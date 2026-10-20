<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\User;
use App\Support\ChartOfAccounts;
use App\Support\EntityContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Single place that decides which cash/bank GL account a receipt or disbursement hits, and that writes the
 * matching bank-register line. Every screen that moves money (collections, deposits, bill payments, direct
 * cash/bank records, fund transfers, the optical sync) goes through here so the ledger, the bank register and
 * reconciliation always agree.
 *
 * A bank account may be shared between companies (see BankAccount). Each company posts to its own Cash in Bank
 * sub-account for the account, and the register line is tagged with the company whose books it is in, so a shared
 * account's disbursements stay in the right company's expenses.
 */
class CashMovementService
{
    public const METHODS = ['cash', 'gcash', 'card', 'check', 'bank_transfer'];

    /** Cash-side holding accounts a fund transfer can move money out of (besides a bank account). */
    public const CLEARING_SOURCES = [
        'cash_on_hand' => '1000',
        'card_clearing' => '1020',
        'ewallet_clearing' => '1030',
    ];

    /** Bank and merchant fees deducted from card / e-wallet settlements. */
    public const BANK_FEES_ACCOUNT = '6600';

    public function __construct(protected JournalPostingService $journalPostingService) {}

    /**
     * A bank account the current company holds or shares, validated as active.
     */
    public function bankAccountFor(?int $bankAccountId): ?BankAccount
    {
        if (! $bankAccountId) {
            return null;
        }

        $bank = BankAccount::query()->withoutGlobalScope('entity')->findOrFail($bankAccountId);
        $entityId = app(EntityContext::class)->id();

        if ($entityId && ! $bank->allowsEntity((int) $entityId)) {
            throw ValidationException::withMessages([
                'bank_account_id' => 'This bank account is not shared with this company.',
            ]);
        }

        if (! $bank->is_active) {
            throw ValidationException::withMessages(['bank_account_id' => 'This bank account is inactive.']);
        }

        return $bank;
    }

    /**
     * Cash-side GL account: the current company's own ledger account for the bank when money goes through a bank,
     * otherwise the clearing account for the payment method.
     */
    public function cashAccountFor(string $method, ?BankAccount $bank = null): Account
    {
        if ($bank) {
            return ChartOfAccounts::ensureBankLedger($bank, app(EntityContext::class)->id() ?? (int) $bank->entity_id);
        }

        $code = match ($method) {
            'card' => '1020',
            'gcash', 'e_wallet' => '1030',
            'check', 'bank_transfer' => '1010',
            default => '1000',
        };

        return Account::query()->where('code', $code)->first()
            ?? Account::query()->where('code', '1000')->firstOrFail();
    }

    /** Methods that settle through a bank and therefore need a bank account. */
    public function requiresBank(string $method): bool
    {
        return in_array($method, ['check', 'bank_transfer'], true);
    }

    /**
     * Create the journal entry for a source document and post it right away (unless source documents are set to
     * stay drafts). A null user means the system recorded it, e.g. the optical sync.
     *
     * @param  array<string, mixed>  $header
     * @param  list<array<string, mixed>>  $lines
     */
    public function journal(array $header, array $lines, ?int $userId = null): JournalEntry
    {
        $user = $userId ? User::query()->find($userId) : null;
        $entry = $this->journalPostingService->create($header, $lines, $user);

        if (config('accounting.auto_post_source_documents', true)) {
            $entry = $this->journalPostingService->post($entry, $user);
        }

        return $entry;
    }

    /**
     * Record the bank-register line for a movement through a bank account, tagged with the company whose books it
     * is in (the current one, unless given).
     */
    public function recordBankLine(BankAccount $bank, array $data): BankTransaction
    {
        return BankTransaction::query()->create([
            'bank_account_id' => $bank->id,
            'entity_id' => $data['entity_id'] ?? app(EntityContext::class)->id() ?? $bank->entity_id,
            'txn_date' => $data['txn_date'],
            'description' => $data['description'],
            'amount' => round((float) $data['amount'], 2),
            'direction' => $data['direction'],
            'reference' => $data['reference'] ?? null,
            'source_type' => $data['source_type'] ?? 'direct_entry',
            'source_id' => $data['source_id'] ?? null,
            'journal_entry_id' => $data['journal_entry_id'] ?? null,
            'is_cleared' => false,
        ]);
    }

    /**
     * Move money between the entity's own cash accounts: deposit cash on hand to the bank, record a card or
     * e-wallet settlement (net of the merchant fee), move funds between two bank accounts, or withdraw cash.
     *
     *   Dr destination (amount − fee)   Dr Bank and Merchant Fees (fee)   Cr source (amount)
     *
     * `from` and `to` are "bank:{id}" or a clearing source key (cash_on_hand, card_clearing, ewallet_clearing).
     *
     * @param  array{txn_date: string, amount: float|string, fee?: float|string|null, from: string, to: string, reference?: string|null, description?: string|null}  $data
     */
    public function transfer(array $data, ?int $userId = null): JournalEntry
    {
        $amount = round((float) $data['amount'], 2);
        $fee = round((float) ($data['fee'] ?? 0), 2);

        if ($data['from'] === $data['to']) {
            throw ValidationException::withMessages(['to' => 'Choose a different account to transfer to.']);
        }
        if ($fee < 0 || $fee >= $amount) {
            throw ValidationException::withMessages(['fee' => 'The fee must be less than the amount transferred.']);
        }

        [$fromAccount, $fromBank] = $this->transferEnd($data['from'], 'from');
        [$toAccount, $toBank] = $this->transferEnd($data['to'], 'to');
        $received = round($amount - $fee, 2);
        $memo = trim(($data['description'] ?? '') ?: "Transfer {$fromAccount->name} → {$toAccount->name}");

        return DB::transaction(function () use ($data, $amount, $fee, $received, $fromAccount, $fromBank, $toAccount, $toBank, $memo, $userId) {
            $lines = [['account_id' => $toAccount->id, 'debit' => $received, 'credit' => 0, 'memo' => $memo]];
            if ($fee > 0) {
                $feeAccount = Account::query()->where('code', self::BANK_FEES_ACCOUNT)->first()
                    ?? throw ValidationException::withMessages(['fee' => 'Account '.self::BANK_FEES_ACCOUNT.' Bank and Merchant Fees is missing from this entity.']);
                $lines[] = ['account_id' => $feeAccount->id, 'debit' => $fee, 'credit' => 0, 'memo' => 'Bank / merchant fee'];
            }
            $lines[] = ['account_id' => $fromAccount->id, 'debit' => 0, 'credit' => $amount, 'memo' => $memo];

            $entry = $this->journal([
                'journal_id' => Journal::query()->where('code', 'GJ')->firstOrFail()->id,
                'entry_date' => $data['txn_date'],
                'reference' => $data['reference'] ?? null,
                'memo' => $memo,
                'source_system' => 'cash_bank',
                'source_type' => 'fund_transfer',
            ], $lines, $userId);

            foreach ([[$fromBank, 'out', $amount], [$toBank, 'in', $received]] as [$bank, $direction, $value]) {
                if ($bank) {
                    $this->recordBankLine($bank, [
                        'txn_date' => $data['txn_date'],
                        'description' => $memo,
                        'amount' => $value,
                        'direction' => $direction,
                        'reference' => $data['reference'] ?? null,
                        'source_type' => 'fund_transfer',
                        'journal_entry_id' => $entry->id,
                    ]);
                }
            }

            return $entry;
        });
    }

    /**
     * @return array{0: Account, 1: BankAccount|null}
     */
    protected function transferEnd(string $key, string $field): array
    {
        if (str_starts_with($key, 'bank:')) {
            $bank = $this->bankAccountFor((int) substr($key, 5));

            return [$this->cashAccountFor('bank_transfer', $bank), $bank];
        }

        $code = self::CLEARING_SOURCES[$key] ?? throw ValidationException::withMessages([$field => 'Choose a cash or bank account.']);

        return [
            Account::query()->where('code', $code)->first()
                ?? throw ValidationException::withMessages([$field => "Account {$code} is missing from this entity."]),
            null,
        ];
    }

    /**
     * Cash/bank GL account ids. Manual (non-cash) journals may not touch these; cash moves through the
     * dedicated receipt/payment/transfer screens instead.
     *
     * @return list<int>
     */
    public function cashAccountIds(): array
    {
        $codes = array_values(array_filter([
            config('accounting.default_accounts.cash_on_hand', '1000'),
            config('accounting.default_accounts.cash_in_bank', '1010'),
            config('accounting.default_accounts.card_clearing', '1020'),
            config('accounting.default_accounts.ewallet_clearing', '1030'),
        ]));

        // Every company's own ledger for each bank account it holds or shares.
        return Account::query()->whereIn('code', $codes)->pluck('id')
            ->merge(DB::table('bank_account_entity')->whereNotNull('gl_account_id')->pluck('gl_account_id'))
            ->unique()->map(fn ($id) => (int) $id)->values()->all();
    }
}
