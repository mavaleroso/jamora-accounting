<?php

namespace App\Support;

use App\Models\Account;
use App\Models\AccountType;
use App\Models\BankAccount;
use App\Models\Entity;
use App\Models\PostingRule;
use Illuminate\Support\Facades\DB;

/**
 * The standard chart of accounts and posting rules for each entity. Codes are shared by all three entities so
 * reports and integrations can find accounts by code; names are tailored to what each entity does (JAM Opticus
 * sells optical products and does edging/repair; the two clinics bill eye-care services).
 *
 * Idempotent: running it again adds whatever is missing and renames accounts still carrying an old default name,
 * but never changes an account someone has renamed.
 */
class ChartOfAccounts
{
    public const ACCOUNT_TYPES = [
        ['name' => 'Current Assets', 'classification' => 'asset', 'normal_balance' => 'debit', 'statement' => 'BS'],
        ['name' => 'Non-current Assets', 'classification' => 'asset', 'normal_balance' => 'debit', 'statement' => 'BS'],
        ['name' => 'Current Liabilities', 'classification' => 'liability', 'normal_balance' => 'credit', 'statement' => 'BS'],
        ['name' => 'Non-current Liabilities', 'classification' => 'liability', 'normal_balance' => 'credit', 'statement' => 'BS'],
        ['name' => 'Equity', 'classification' => 'equity', 'normal_balance' => 'credit', 'statement' => 'BS'],
        ['name' => 'Operating Revenue', 'classification' => 'revenue', 'normal_balance' => 'credit', 'statement' => 'IS'],
        ['name' => 'Other Revenue', 'classification' => 'revenue', 'normal_balance' => 'credit', 'statement' => 'IS'],
        ['name' => 'Cost of Sales', 'classification' => 'expense', 'normal_balance' => 'debit', 'statement' => 'IS'],
        ['name' => 'Operating Expenses', 'classification' => 'expense', 'normal_balance' => 'debit', 'statement' => 'IS'],
        ['name' => 'Other Expenses', 'classification' => 'expense', 'normal_balance' => 'debit', 'statement' => 'IS'],
    ];

    /** @var list<array{code: string, name: string, type: string, cash_flow_section?: string, description?: string}> */
    public const ACCOUNTS = [
        ['code' => '1000', 'name' => 'Cash on Hand', 'type' => 'Current Assets', 'cash_flow_section' => 'operating'],
        ['code' => '1010', 'name' => 'Cash in Bank', 'type' => 'Current Assets', 'cash_flow_section' => 'operating', 'description' => 'Each bank account has its own sub-account under this one.'],
        ['code' => '1020', 'name' => 'Card Clearing', 'type' => 'Current Assets', 'cash_flow_section' => 'operating', 'description' => 'Card collections awaiting settlement to the bank.'],
        ['code' => '1030', 'name' => 'GCash / E-Wallet Clearing', 'type' => 'Current Assets', 'cash_flow_section' => 'operating', 'description' => 'E-wallet collections awaiting transfer to the bank.'],
        ['code' => '1100', 'name' => 'Accounts Receivable', 'type' => 'Current Assets', 'cash_flow_section' => 'operating'],
        ['code' => '1200', 'name' => 'Inventory', 'type' => 'Current Assets'],
        ['code' => '1300', 'name' => 'Input VAT', 'type' => 'Current Assets'],
        ['code' => '1400', 'name' => 'Due from Related Entities', 'type' => 'Current Assets', 'cash_flow_section' => 'operating', 'description' => 'Amounts another group entity collected on this entity\'s behalf.'],
        ['code' => '1500', 'name' => 'Property and Equipment', 'type' => 'Non-current Assets', 'cash_flow_section' => 'investing'],
        ['code' => '1510', 'name' => 'Accumulated Depreciation', 'type' => 'Non-current Assets', 'description' => 'Contra asset: credit balance.'],
        ['code' => '2000', 'name' => 'Accounts Payable', 'type' => 'Current Liabilities', 'cash_flow_section' => 'operating'],
        ['code' => '2100', 'name' => 'Output VAT', 'type' => 'Current Liabilities'],
        ['code' => '2200', 'name' => 'Accrued Expenses', 'type' => 'Current Liabilities', 'cash_flow_section' => 'operating'],
        ['code' => '2210', 'name' => 'Goods Received Not Billed', 'type' => 'Current Liabilities', 'cash_flow_section' => 'operating', 'description' => 'Supplier deliveries received into inventory; cleared when the supplier bill is entered.'],
        ['code' => '2300', 'name' => 'Customer Deposits', 'type' => 'Current Liabilities', 'cash_flow_section' => 'operating'],
        ['code' => '2400', 'name' => 'SSS Payable', 'type' => 'Current Liabilities'],
        ['code' => '2410', 'name' => 'PhilHealth Payable', 'type' => 'Current Liabilities'],
        ['code' => '2420', 'name' => 'Pag-IBIG Payable', 'type' => 'Current Liabilities'],
        ['code' => '2430', 'name' => 'Withholding Tax Payable', 'type' => 'Current Liabilities'],
        ['code' => '2435', 'name' => 'Expanded Withholding Tax Payable', 'type' => 'Current Liabilities', 'description' => 'EWT withheld from supplier payments (BIR 2307 / 1601-EQ).'],
        ['code' => '2440', 'name' => 'Other Payroll Deductions Payable', 'type' => 'Current Liabilities'],
        ['code' => '2450', 'name' => 'Employee Benefits Payable', 'type' => 'Current Liabilities'],
        ['code' => '2500', 'name' => 'Salaries Payable', 'type' => 'Current Liabilities'],
        ['code' => '2600', 'name' => 'Due to Related Entities', 'type' => 'Current Liabilities', 'cash_flow_section' => 'operating', 'description' => 'Amounts this entity collected on another group entity\'s behalf.'],
        ['code' => '3000', 'name' => 'Capital', 'type' => 'Equity', 'cash_flow_section' => 'financing'],
        ['code' => '3100', 'name' => 'Retained Earnings', 'type' => 'Equity'],
        ['code' => '3900', 'name' => 'Opening Balance Equity', 'type' => 'Equity', 'description' => 'Contra side of go-live opening balances; close to Capital / Retained Earnings once complete.'],
        ['code' => '4000', 'name' => 'Sales Revenue', 'type' => 'Operating Revenue'],
        ['code' => '4005', 'name' => 'Sales Revenue – Wholesale', 'type' => 'Operating Revenue'],
        ['code' => '4010', 'name' => 'Service Revenue', 'type' => 'Operating Revenue'],
        ['code' => '4100', 'name' => 'Sales Discounts', 'type' => 'Operating Revenue', 'description' => 'Contra revenue account'],
        ['code' => '4110', 'name' => 'Senior Citizen / PWD Discounts', 'type' => 'Operating Revenue', 'description' => 'Contra revenue: statutory 20% discounts (RA 9994 / RA 10754).'],
        ['code' => '5000', 'name' => 'Cost of Goods Sold', 'type' => 'Cost of Sales'],
        ['code' => '5010', 'name' => 'Inventory Losses and Write-offs', 'type' => 'Cost of Sales', 'description' => 'Defective, expired and edging-loss stock.'],
        ['code' => '6000', 'name' => 'Salaries and Wages', 'type' => 'Operating Expenses'],
        ['code' => '6010', 'name' => 'Employer Statutory Contributions', 'type' => 'Operating Expenses'],
        ['code' => '6020', 'name' => 'Employee Benefits Expense', 'type' => 'Operating Expenses'],
        ['code' => '6100', 'name' => 'Rent Expense', 'type' => 'Operating Expenses'],
        ['code' => '6200', 'name' => 'Utilities Expense', 'type' => 'Operating Expenses'],
        ['code' => '6300', 'name' => 'Office Supplies', 'type' => 'Operating Expenses'],
        ['code' => '6400', 'name' => 'Miscellaneous Expense', 'type' => 'Other Expenses'],
        ['code' => '6500', 'name' => 'Depreciation Expense', 'type' => 'Operating Expenses'],
        ['code' => '6600', 'name' => 'Bank and Merchant Fees', 'type' => 'Operating Expenses'],
    ];

    /**
     * Revenue names per entity. Codes stay the same so integrations and reports work across entities.
     *
     * @var array<string, array<string, string>>
     */
    public const ENTITY_NAMES = [
        'JAM_OPTICUS' => [
            '4000' => 'Product Sales – Retail',
            '4005' => 'Product Sales – Wholesale',
            '4010' => 'Service Revenue – Edging & Repair',
        ],
        'A_JAMORA' => [
            '4000' => 'Product Sales',
            '4010' => 'Clinical Services – Eye Exams & Consultations',
        ],
        'AL_JAMORA' => [
            '4000' => 'Product Sales',
            '4010' => 'Clinical Services – Pediatric & General Eye Care',
        ],
    ];

    /** Old default names that may be replaced; an account renamed to anything else is left alone. */
    public const REPLACEABLE_NAMES = ['GCash Clearing', 'Sales Revenue', 'Service Revenue'];

    /**
     * Posting rules: the debit and credit account of each automatic posting. The optical sync reads these; each
     * pair is a complete posting so it reads correctly on the posting-rules screen.
     *
     * @var list<array{event: string, name: string, debit: string, credit: string}>
     */
    public const POSTING_RULES = [
        ['event' => 'deposit_cash', 'name' => 'Cash payment received before completion', 'debit' => '1000', 'credit' => '2300'],
        ['event' => 'deposit_card', 'name' => 'Card payment received before completion', 'debit' => '1020', 'credit' => '2300'],
        ['event' => 'deposit_ewallet', 'name' => 'E-wallet payment received before completion', 'debit' => '1030', 'credit' => '2300'],
        ['event' => 'deposit_opening', 'name' => 'Deposit carried in at go-live', 'debit' => '3900', 'credit' => '2300'],
        ['event' => 'sale_product_retail', 'name' => 'Retail product sale', 'debit' => '1100', 'credit' => '4000'],
        ['event' => 'sale_product_wholesale', 'name' => 'Wholesale product sale', 'debit' => '1100', 'credit' => '4005'],
        ['event' => 'sale_service', 'name' => 'Service sale', 'debit' => '1100', 'credit' => '4010'],
        ['event' => 'sale_discount', 'name' => 'Sales discount', 'debit' => '4100', 'credit' => '1100'],
        ['event' => 'sale_senior_pwd_discount', 'name' => 'Senior citizen / PWD discount', 'debit' => '4110', 'credit' => '1100'],
        ['event' => 'output_vat', 'name' => 'Output VAT on sales', 'debit' => '1100', 'credit' => '2100'],
        ['event' => 'deposit_applied', 'name' => 'Deposit applied to the completed sale', 'debit' => '2300', 'credit' => '1100'],
        ['event' => 'intercompany_collected', 'name' => 'Deposit collected for a related entity\'s sale', 'debit' => '2300', 'credit' => '2600'],
        ['event' => 'intercompany_billed', 'name' => 'Sale settled by the collecting entity', 'debit' => '1400', 'credit' => '1100'],
        ['event' => 'cogs', 'name' => 'Cost of goods sold', 'debit' => '5000', 'credit' => '1200'],
        ['event' => 'inventory_receipt', 'name' => 'Supplier delivery received', 'debit' => '1200', 'credit' => '2210'],
        ['event' => 'inventory_return', 'name' => 'Stock returned to supplier', 'debit' => '2210', 'credit' => '1200'],
        ['event' => 'inventory_writeoff', 'name' => 'Defective / expired stock written off', 'debit' => '5010', 'credit' => '1200'],
    ];

    /** Rules from the database-driven sync that the API sync no longer uses. */
    public const RETIRED_RULES = ['ar', 'sales_revenue', 'sales_discount', 'collection_cash', 'collection_card', 'purchase_inventory'];

    /**
     * @return array<string, AccountType>
     */
    public static function accountTypes(): array
    {
        $types = [];
        foreach (self::ACCOUNT_TYPES as $type) {
            $types[$type['name']] = AccountType::query()->firstOrCreate(['name' => $type['name']], $type);
        }

        return $types;
    }

    public static function ensureFor(Entity $entity): void
    {
        $types = self::accountTypes();
        $names = self::ENTITY_NAMES[$entity->code] ?? [];

        foreach (self::ACCOUNTS as $definition) {
            $name = $names[$definition['code']] ?? $definition['name'];

            $account = Account::withoutGlobalScope('entity')->firstOrCreate(
                ['entity_id' => $entity->id, 'code' => $definition['code']],
                [
                    'name' => $name,
                    'account_type_id' => $types[$definition['type']]->id,
                    'is_postable' => true,
                    'is_active' => true,
                    'cash_flow_section' => $definition['cash_flow_section'] ?? null,
                    'description' => $definition['description'] ?? null,
                ]
            );

            if ($account->name !== $name && in_array($account->name, self::REPLACEABLE_NAMES, true)) {
                $account->update(['name' => $name, 'description' => $account->description ?? ($definition['description'] ?? null)]);
            }
        }

        self::ensurePostingRules($entity);
    }

    public static function ensurePostingRules(Entity $entity): void
    {
        $accounts = Account::withoutGlobalScope('entity')
            ->where('entity_id', $entity->id)
            ->pluck('id', 'code');

        PostingRule::withoutGlobalScope('entity')
            ->where('entity_id', $entity->id)
            ->whereIn('event', self::RETIRED_RULES)
            ->delete();

        foreach (self::POSTING_RULES as $order => $rule) {
            $debitId = $accounts[$rule['debit']] ?? null;
            $creditId = $accounts[$rule['credit']] ?? null;
            if (! $debitId || ! $creditId) {
                continue;
            }

            $existing = PostingRule::withoutGlobalScope('entity')
                ->where('entity_id', $entity->id)
                ->where('event', $rule['event'])
                ->first();

            if ($existing) {
                // Keep accounts someone remapped on the posting-rules screen; refresh the label and order.
                $existing->update(['name' => $rule['name'], 'sort_order' => ($order + 1) * 10]);

                continue;
            }

            PostingRule::withoutGlobalScope('entity')->create([
                'entity_id' => $entity->id,
                'event' => $rule['event'],
                'name' => $rule['name'],
                'debit_account_id' => $debitId,
                'credit_account_id' => $creditId,
                'is_active' => true,
                'sort_order' => ($order + 1) * 10,
            ]);
        }
    }

    /**
     * A company's own Cash in Bank sub-account (1011, 1012, …) for a bank account, in that company's chart: the one
     * already linked, else a new one. Each company sharing an account has its own; linking one to a company shares the
     * account with it. $entityId defaults to the account's holder, whose ledger may also be picked on the account.
     */
    public static function ensureBankLedger(BankAccount $bank, ?int $entityId = null): Account
    {
        $entityId ??= (int) $bank->entity_id;
        $isHolder = $entityId === (int) $bank->entity_id;
        $link = DB::table('bank_account_entity')->where('bank_account_id', $bank->id)->where('entity_id', $entityId)->first();

        $ledgerId = $isHolder ? ($bank->gl_account_id ?: $link?->gl_account_id) : $link?->gl_account_id;
        $account = $ledgerId ? Account::withoutGlobalScope('entity')->where('entity_id', $entityId)->find($ledgerId) : null;

        if (! $account) {
            $parent = Account::withoutGlobalScope('entity')->where('entity_id', $entityId)->where('code', '1010')->first();
            $taken = Account::withTrashed()->withoutGlobalScope('entity')->where('entity_id', $entityId)->pluck('code')->all();

            $code = collect(range(1011, 1019))->map(fn (int $c) => (string) $c)->first(fn (string $c) => ! in_array($c, $taken, true))
                ?? '1010-'.$bank->id;

            $account = Account::withoutGlobalScope('entity')->create([
                'entity_id' => $entityId,
                'code' => $code,
                'name' => 'Cash in Bank – '.trim($bank->bank_name.' '.$bank->name),
                'account_type_id' => $parent?->account_type_id ?? self::accountTypes()['Current Assets']->id,
                'parent_id' => $parent?->id,
                'is_postable' => true,
                'is_active' => true,
                'cash_flow_section' => 'operating',
                'description' => $bank->account_number ? 'Account no. '.$bank->account_number : null,
            ]);
        }

        if (! $link) {
            DB::table('bank_account_entity')->insert(['bank_account_id' => $bank->id, 'entity_id' => $entityId, 'gl_account_id' => $account->id, 'created_at' => now(), 'updated_at' => now()]);
        } elseif ((int) $link->gl_account_id !== $account->id) {
            DB::table('bank_account_entity')->where('id', $link->id)->update(['gl_account_id' => $account->id, 'updated_at' => now()]);
        }
        if ($isHolder && (int) $bank->gl_account_id !== $account->id) {
            $bank->forceFill(['gl_account_id' => $account->id])->saveQuietly();
        }

        return $account;
    }
}
