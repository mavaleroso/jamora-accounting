<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\JournalEntry;
use App\Models\User;
use App\Support\EntityContext;
use Illuminate\Validation\ValidationException;

/**
 * Single place that decides which cash/bank GL account a receipt or disbursement hits, and that writes the
 * matching bank-register line. Every screen that moves money (collections, deposits, bill payments, direct
 * cash/bank records) goes through here so the ledger, the bank register and reconciliation always agree.
 */
class CashMovementService
{
    public const METHODS = ['cash', 'gcash', 'card', 'check', 'bank_transfer'];

    public function __construct(protected JournalPostingService $journalPostingService) {}

    /**
     * Validate that the bank account may be used by the current entity (shared accounts must be linked to it).
     */
    public function bankAccountFor(?int $bankAccountId): ?BankAccount
    {
        if (! $bankAccountId) {
            return null;
        }

        $bank = BankAccount::query()->with('glAccount')->findOrFail($bankAccountId);
        $entityId = app(EntityContext::class)->id();

        if ($entityId && ! $bank->allowsEntity((int) $entityId)) {
            throw ValidationException::withMessages([
                'bank_account_id' => 'This bank account is not assigned to the current entity.',
            ]);
        }

        if (! $bank->is_active) {
            throw ValidationException::withMessages(['bank_account_id' => 'This bank account is inactive.']);
        }

        return $bank;
    }

    /**
     * Cash-side GL account: the bank's own GL account when money goes through a bank, otherwise the clearing
     * account for the payment method.
     */
    public function cashAccountFor(string $method, ?BankAccount $bank = null): Account
    {
        // glAccount is entity-scoped: for a shared bank whose GL account belongs to the other entity it resolves
        // to null, and this entity's own Cash in Bank is used instead.
        if ($bank?->glAccount) {
            return $bank->glAccount;
        }

        $code = $bank ? config('accounting.default_accounts.cash_in_bank', '1010') : match ($method) {
            'card' => '1020',
            'gcash' => '1030',
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
     * Create (and, unless entries are synced as drafts, post) a journal entry for a source document.
     *
     * @param  array<string, mixed>  $header
     * @param  list<array<string, mixed>>  $lines
     */
    public function journal(array $header, array $lines, int $userId): JournalEntry
    {
        $user = User::query()->find($userId);
        $entry = $this->journalPostingService->create($header, $lines, $user);

        if (! config('accounting.sync_as_draft', true) && $user) {
            $entry = $this->journalPostingService->post($entry, $user);
        }

        return $entry;
    }

    /**
     * Record the bank-register line for a movement through a bank account.
     */
    public function recordBankLine(BankAccount $bank, array $data): BankTransaction
    {
        return BankTransaction::query()->create([
            'bank_account_id' => $bank->id,
            'entity_id' => $data['entity_id'] ?? app(EntityContext::class)->id(),
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
     * Cash/bank GL account ids. Manual (non-cash) journals may not touch these; cash moves through the
     * dedicated receipt/payment screens instead.
     *
     * @return list<int>
     */
    public function cashAccountIds(): array
    {
        $codes = array_values(array_filter([
            config('accounting.default_accounts.cash_on_hand', '1000'),
            config('accounting.default_accounts.cash_in_bank', '1010'),
            config('accounting.default_accounts.card_clearing', '1020'),
            '1030',
        ]));

        return Account::query()->whereIn('code', $codes)->pluck('id')
            ->merge(BankAccount::query()->whereNotNull('gl_account_id')->pluck('gl_account_id'))
            ->unique()->map(fn ($id) => (int) $id)->values()->all();
    }
}
