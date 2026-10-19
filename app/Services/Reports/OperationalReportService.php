<?php

namespace App\Services\Reports;

use App\Models\Account;
use App\Models\Bill;
use App\Models\CustomerDeposit;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Support\EntityContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * The proposal's operating reports, per entity: daily sales, VAT summary, cost of goods sold, collections by payment
 * method and the customer deposits liability. Each report is returned in one shape (summary cards, columns, rows,
 * totals) so one screen and one Excel export serve them all.
 */
class OperationalReportService
{
    public const REPORTS = [
        'daily-sales' => ['title' => 'Daily Sales Summary', 'mode' => 'range', 'permission' => 'reports.daily-sales.view'],
        'vat-summary' => ['title' => 'VAT Summary', 'mode' => 'range', 'permission' => 'reports.vat-summary.view'],
        'cogs' => ['title' => 'Cost of Goods Sold', 'mode' => 'range', 'permission' => 'reports.income-statement.view'],
        'collections' => ['title' => 'Collections by Payment Method', 'mode' => 'range', 'permission' => 'reports.daily-sales.view'],
        'deposits' => ['title' => 'Customer Deposits Liability', 'mode' => 'as_of', 'permission' => 'reports.ar-aging.view'],
    ];

    /** Invoice statuses that count as sales. */
    protected const SOLD = ['confirmed', 'partially_paid', 'paid'];

    protected const METHOD_LABELS = [
        'cash' => 'Cash',
        'card' => 'Card',
        'gcash' => 'GCash',
        'e_wallet' => 'E-wallet',
        'check' => 'Check',
        'bank_transfer' => 'Bank transfer',
    ];

    /**
     * @param  array{date_from?: string|null, date_to?: string|null, as_of?: string|null}  $filters
     * @return array<string, mixed>
     */
    public function build(string $report, array $filters): array
    {
        $definition = self::REPORTS[$report] ?? throw new InvalidArgumentException("Unknown report {$report}.");
        $today = Carbon::now('Asia/Manila');
        $from = ($filters['date_from'] ?? null) ?: $today->copy()->startOfMonth()->toDateString();
        $to = ($filters['date_to'] ?? null) ?: $today->toDateString();
        $asOf = ($filters['as_of'] ?? null) ?: $today->toDateString();

        $body = match ($report) {
            'daily-sales' => $this->dailySales($from, $to),
            'vat-summary' => $this->vatSummary($from, $to),
            'cogs' => $this->cogs($from, $to),
            'collections' => $this->collections($from, $to),
            'deposits' => $this->deposits($asOf),
        };

        return [
            'key' => $report,
            'title' => $definition['title'],
            'mode' => $definition['mode'],
            'filters' => $definition['mode'] === 'as_of' ? ['as_of' => $asOf] : ['date_from' => $from, 'date_to' => $to],
            'entity' => app(EntityContext::class)->current()?->name,
            'notes' => [],
            'totals' => null,
            ...$body,
        ];
    }

    /**
     * Sales recorded per day: invoices issued (optical POS and manual), split between products and services.
     */
    protected function dailySales(string $from, string $to): array
    {
        $invoices = Invoice::query()
            ->whereIn('status', self::SOLD)
            ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to);

        $byDay = (clone $invoices)
            ->select([
                'invoice_date',
                DB::raw('COUNT(*) as invoices'),
                DB::raw('SUM(total_amount + discount_amount) as gross'),
                DB::raw('SUM(discount_amount) as discounts'),
                DB::raw('SUM(total_amount) as net'),
                DB::raw('SUM(vat_amount) as vat'),
            ])
            ->groupBy('invoice_date')
            ->orderBy('invoice_date')
            ->get()
            ->keyBy(fn ($r) => substr((string) $r->invoice_date, 0, 10));

        $products = InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->where('invoices.entity_id', app(EntityContext::class)->id())
            ->whereNull('invoices.deleted_at')
            ->whereIn('invoices.status', self::SOLD)
            ->whereDate('invoices.invoice_date', '>=', $from)->whereDate('invoices.invoice_date', '<=', $to)
            ->select(['invoices.invoice_date', DB::raw("SUM(CASE WHEN invoice_lines.line_type = 'product' THEN invoice_lines.amount ELSE 0 END) as products")])
            ->groupBy('invoices.invoice_date')
            ->get()
            ->keyBy(fn ($r) => substr((string) $r->invoice_date, 0, 10));

        $rows = $byDay->map(function ($r, string $day) use ($products) {
            $net = round((float) $r->net, 2);
            $productNet = round((float) ($products[$day]->products ?? 0), 2);

            return [
                'date' => $day,
                'invoices' => (int) $r->invoices,
                'gross' => round((float) $r->gross, 2),
                'discounts' => round((float) $r->discounts, 2),
                'net' => $net,
                'vat' => round((float) $r->vat, 2),
                'net_of_vat' => round($net - (float) $r->vat, 2),
                'products' => $productNet,
                'services' => round($net - $productNet, 2),
            ];
        })->values()->all();

        $totals = $this->sum($rows, ['invoices', 'gross', 'discounts', 'net', 'vat', 'net_of_vat', 'products', 'services']);

        return [
            'summary' => [
                ['label' => 'Net sales (VAT-inclusive)', 'value' => $totals['net'], 'format' => 'currency'],
                ['label' => 'Output VAT', 'value' => $totals['vat'], 'format' => 'currency'],
                ['label' => 'Discounts given', 'value' => $totals['discounts'], 'format' => 'currency'],
                ['label' => 'Invoices', 'value' => $totals['invoices'], 'format' => 'number'],
            ],
            'columns' => [
                ['key' => 'date', 'label' => 'Date', 'format' => 'date'],
                ['key' => 'invoices', 'label' => 'Invoices', 'format' => 'number', 'align' => 'right'],
                ['key' => 'gross', 'label' => 'Gross', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'discounts', 'label' => 'Discounts', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'net', 'label' => 'Net sales', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'vat', 'label' => 'VAT', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'net_of_vat', 'label' => 'Net of VAT', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'products', 'label' => 'Products', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'services', 'label' => 'Services', 'format' => 'currency', 'align' => 'right'],
            ],
            'rows' => $rows,
            'totals' => ['date' => 'Total', ...$totals],
        ];
    }

    /**
     * Output VAT on sales less input VAT on supplier bills, per month.
     */
    protected function vatSummary(string $from, string $to): array
    {
        $month = fn (string $column) => DB::connection()->getDriverName() === 'sqlite'
            ? DB::raw("strftime('%Y-%m', {$column}) as month")
            : DB::raw("DATE_FORMAT({$column}, '%Y-%m') as month");

        $sales = Invoice::query()
            ->whereIn('status', self::SOLD)
            ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to)
            ->select([
                $month('invoice_date'),
                DB::raw('SUM(CASE WHEN vat_amount > 0 THEN total_amount - vat_amount ELSE 0 END) as vatable'),
                DB::raw('SUM(CASE WHEN is_vat_exempt = 1 THEN total_amount ELSE 0 END) as exempt'),
                DB::raw('SUM(CASE WHEN vat_amount = 0 AND is_vat_exempt = 0 THEN total_amount ELSE 0 END) as non_vat'),
                DB::raw('SUM(vat_amount) as output_vat'),
            ])
            ->groupBy('month')
            ->get()
            ->keyBy('month');

        $purchases = Bill::query()
            ->whereIn('status', ['posted', 'partially_paid', 'paid'])
            ->whereDate('bill_date', '>=', $from)->whereDate('bill_date', '<=', $to)
            ->select([
                $month('bill_date'),
                DB::raw('SUM(CASE WHEN vat_amount > 0 THEN subtotal ELSE 0 END) as vatable_purchases'),
                DB::raw('SUM(vat_amount) as input_vat'),
            ])
            ->groupBy('month')
            ->get()
            ->keyBy('month');

        $months = $sales->keys()->merge($purchases->keys())->unique()->sort()->values();
        $rows = $months->map(function (string $m) use ($sales, $purchases) {
            $output = round((float) ($sales[$m]->output_vat ?? 0), 2);
            $input = round((float) ($purchases[$m]->input_vat ?? 0), 2);

            return [
                'month' => Carbon::createFromFormat('Y-m', $m)->format('F Y'),
                'vatable_sales' => round((float) ($sales[$m]->vatable ?? 0), 2),
                'exempt_sales' => round((float) ($sales[$m]->exempt ?? 0), 2),
                'non_vat_sales' => round((float) ($sales[$m]->non_vat ?? 0), 2),
                'output_vat' => $output,
                'vatable_purchases' => round((float) ($purchases[$m]->vatable_purchases ?? 0), 2),
                'input_vat' => $input,
                'vat_payable' => round($output - $input, 2),
            ];
        })->all();

        $totals = $this->sum($rows, ['vatable_sales', 'exempt_sales', 'non_vat_sales', 'output_vat', 'vatable_purchases', 'input_vat', 'vat_payable']);
        $vatRegistered = app(EntityContext::class)->current()?->vatRegistered() ?? true;

        return [
            'summary' => [
                ['label' => 'Output VAT', 'value' => $totals['output_vat'], 'format' => 'currency'],
                ['label' => 'Input VAT', 'value' => $totals['input_vat'], 'format' => 'currency'],
                ['label' => 'VAT payable', 'value' => $totals['vat_payable'], 'format' => 'currency'],
                ['label' => 'VAT-exempt sales (senior / PWD)', 'value' => $totals['exempt_sales'], 'format' => 'currency'],
            ],
            'columns' => [
                ['key' => 'month', 'label' => 'Month', 'format' => 'text'],
                ['key' => 'vatable_sales', 'label' => 'VATable sales', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'exempt_sales', 'label' => 'VAT-exempt sales', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'non_vat_sales', 'label' => 'Non-VAT sales', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'output_vat', 'label' => 'Output VAT', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'vatable_purchases', 'label' => 'VATable purchases', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'input_vat', 'label' => 'Input VAT', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'vat_payable', 'label' => 'VAT payable', 'format' => 'currency', 'align' => 'right'],
            ],
            'rows' => $rows,
            'totals' => ['month' => 'Total', ...$totals],
            'notes' => array_values(array_filter([
                $vatRegistered ? null : 'This entity is set up as non-VAT: its sales carry no output VAT.',
                'Supporting summary for the BIR VAT return (2550M/2550Q); it does not replace the filing.',
            ])),
        ];
    }

    /**
     * Cost of goods sold and stock write-offs by stock type, from the stock postings, checked against the ledger.
     */
    protected function cogs(string $from, string $to): array
    {
        $movements = InventoryMovement::query()
            ->whereIn('movement_type', ['sales_issue', 'write_off'])
            ->where('review_status', '!=', 'reversed')
            ->whereDate('occurred_on', '>=', $from)->whereDate('occurred_on', '<=', $to)
            ->select([
                DB::raw("COALESCE(stock_type, 'other') as stock_type"),
                DB::raw("SUM(CASE WHEN movement_type = 'sales_issue' THEN -quantity ELSE 0 END) as sold_qty"),
                DB::raw("SUM(CASE WHEN movement_type = 'sales_issue' THEN total_cost ELSE 0 END) as cogs"),
                DB::raw("SUM(CASE WHEN movement_type = 'sales_issue' AND total_cost = 0 THEN -quantity ELSE 0 END) as uncosted"),
                DB::raw("SUM(CASE WHEN movement_type = 'write_off' THEN -quantity ELSE 0 END) as written_off_qty"),
                DB::raw("SUM(CASE WHEN movement_type = 'write_off' THEN total_cost ELSE 0 END) as written_off"),
            ])
            ->groupBy(DB::raw("COALESCE(stock_type, 'other')"))
            ->orderBy('stock_type')
            ->get();

        $rows = $movements->map(fn ($r) => [
            'stock_type' => ucfirst((string) $r->stock_type),
            'sold_qty' => (int) $r->sold_qty,
            'cogs' => round((float) $r->cogs, 2),
            'uncosted' => (int) $r->uncosted,
            'written_off_qty' => (int) $r->written_off_qty,
            'written_off' => round((float) $r->written_off, 2),
        ])->all();

        $totals = $this->sum($rows, ['sold_qty', 'cogs', 'uncosted', 'written_off_qty', 'written_off']);
        $ledgerCogs = $this->ledgerMovement('5000', $from, $to);
        $ledgerLosses = $this->ledgerMovement('5010', $from, $to);

        return [
            'summary' => [
                ['label' => 'Cost of goods sold (ledger 5000)', 'value' => $ledgerCogs, 'format' => 'currency'],
                ['label' => 'Write-offs (ledger 5010)', 'value' => $ledgerLosses, 'format' => 'currency'],
                ['label' => 'Items sold', 'value' => $totals['sold_qty'], 'format' => 'number'],
                ['label' => 'Sold without a cost', 'value' => $totals['uncosted'], 'format' => 'number'],
            ],
            'columns' => [
                ['key' => 'stock_type', 'label' => 'Stock type', 'format' => 'text'],
                ['key' => 'sold_qty', 'label' => 'Items sold', 'format' => 'number', 'align' => 'right'],
                ['key' => 'cogs', 'label' => 'Cost of goods sold', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'uncosted', 'label' => 'Without cost', 'format' => 'number', 'align' => 'right'],
                ['key' => 'written_off_qty', 'label' => 'Written off', 'format' => 'number', 'align' => 'right'],
                ['key' => 'written_off', 'label' => 'Write-off cost', 'format' => 'currency', 'align' => 'right'],
            ],
            'rows' => $rows,
            'totals' => ['stock_type' => 'Total', ...$totals],
            'notes' => array_values(array_filter([
                abs($ledgerCogs - $totals['cogs']) >= 0.01
                    ? 'The ledger differs from the stock postings by '.number_format($ledgerCogs - $totals['cogs'], 2).' — usually manual cost-of-sales journals.'
                    : null,
                $totals['uncosted'] > 0 ? 'Items sold without a decodable cost in the optical POS have no cost of goods sold; see Inventory → Needs review.' : null,
            ])),
        ];
    }

    /**
     * Money received in the period by payment method: customer deposits (optical POS payments and downpayments) and
     * direct invoice collections. Deposit applications are not new money and are left out.
     */
    protected function collections(string $from, string $to): array
    {
        $deposits = CustomerDeposit::query()
            ->where('status', '!=', 'void')
            ->whereDate('deposit_date', '>=', $from)->whereDate('deposit_date', '<=', $to)
            ->select([
                DB::raw("COALESCE(payment_method, 'cash') as method"),
                DB::raw("CASE WHEN source_system = 'optical' THEN 'Optical POS payments' ELSE 'Customer deposits' END as source"),
                DB::raw('COUNT(*) as receipts'),
                DB::raw('SUM(amount) as amount'),
            ])
            ->groupBy(DB::raw("COALESCE(payment_method, 'cash')"), DB::raw("CASE WHEN source_system = 'optical' THEN 'Optical POS payments' ELSE 'Customer deposits' END"))
            ->get();

        $payments = InvoicePayment::query()
            ->whereNotIn('payment_method', ['deposit', 'intercompany'])
            ->whereDate('paid_date', '>=', $from)->whereDate('paid_date', '<=', $to)
            ->select(['payment_method as method', DB::raw("'Invoice collections' as source"), DB::raw('COUNT(*) as receipts'), DB::raw('SUM(amount) as amount')])
            ->groupBy('payment_method')
            ->get();

        $rows = $deposits->concat($payments)
            ->map(fn ($r) => [
                'method' => self::METHOD_LABELS[$r->method] ?? ucfirst(str_replace('_', ' ', (string) $r->method)),
                'source' => $r->source,
                'receipts' => (int) $r->receipts,
                'amount' => round((float) $r->amount, 2),
            ])
            ->sortBy([['method', 'asc'], ['source', 'asc']])
            ->values()
            ->all();

        $totals = $this->sum($rows, ['receipts', 'amount']);
        $byMethod = collect($rows)->groupBy('method')->map(fn ($g) => round($g->sum('amount'), 2))->sortDesc();

        return [
            'summary' => [
                ['label' => 'Total collected', 'value' => $totals['amount'], 'format' => 'currency'],
                ...$byMethod->take(3)->map(fn ($v, $k) => ['label' => $k, 'value' => $v, 'format' => 'currency'])->values()->all(),
            ],
            'columns' => [
                ['key' => 'method', 'label' => 'Payment method', 'format' => 'text'],
                ['key' => 'source', 'label' => 'Recorded as', 'format' => 'text'],
                ['key' => 'receipts', 'label' => 'Receipts', 'format' => 'number', 'align' => 'right'],
                ['key' => 'amount', 'label' => 'Amount', 'format' => 'currency', 'align' => 'right'],
            ],
            'rows' => $rows,
            'totals' => ['method' => 'Total', 'source' => '', ...$totals],
            'notes' => ['Card and e-wallet amounts sit in their clearing accounts until the settlement is transferred to the bank (Cash & Bank → Transfer funds).'],
        ];
    }

    /**
     * Deposits still held for customers at the as-of date: received on or before it, less what was applied by then.
     */
    protected function deposits(string $asOf): array
    {
        $deposits = CustomerDeposit::query()
            ->with('partner:id,code,name')
            ->where('status', '!=', 'void')
            ->whereDate('deposit_date', '<=', $asOf)
            ->orderBy('deposit_date')
            ->get();

        // Applications include those made by a related entity's invoice (recorded in that entity's books).
        $applied = InvoicePayment::query()
            ->withoutGlobalScope('entity')
            ->whereIn('customer_deposit_id', $deposits->pluck('id'))
            ->whereDate('paid_date', '<=', $asOf)
            ->groupBy('customer_deposit_id')
            ->selectRaw('customer_deposit_id, SUM(amount) as applied')
            ->get()
            ->pluck('applied', 'customer_deposit_id');

        $asOfDate = Carbon::parse($asOf);
        $rows = $deposits
            ->map(function (CustomerDeposit $d) use ($applied, $asOfDate) {
                $used = round((float) ($applied[$d->id] ?? 0), 2);
                $outstanding = round((float) $d->amount - $used, 2);

                return [
                    'date' => $d->deposit_date->toDateString(),
                    'customer' => $d->partner?->name ?? '—',
                    'reference' => $d->reference,
                    'method' => self::METHOD_LABELS[$d->payment_method ?? ''] ?? $d->payment_method,
                    'source' => $d->source_system === 'optical' ? 'Optical POS' : 'Recorded here',
                    'amount' => round((float) $d->amount, 2),
                    'applied' => $used,
                    'outstanding' => $outstanding,
                    'age_days' => (int) $d->deposit_date->diffInDays($asOfDate),
                ];
            })
            ->filter(fn (array $r) => $r['outstanding'] > 0.004)
            ->values()
            ->all();

        $totals = $this->sum($rows, ['amount', 'applied', 'outstanding']);
        $liability = $this->ledgerBalance('2300', $asOf);

        return [
            'summary' => [
                ['label' => 'Deposits held', 'value' => $totals['outstanding'], 'format' => 'currency'],
                ['label' => 'Customer Deposits ledger (2300)', 'value' => $liability, 'format' => 'currency'],
                ['label' => 'Open deposits', 'value' => count($rows), 'format' => 'number'],
                ['label' => 'Older than 30 days', 'value' => collect($rows)->where('age_days', '>', 30)->sum('outstanding'), 'format' => 'currency'],
            ],
            'columns' => [
                ['key' => 'date', 'label' => 'Received', 'format' => 'date'],
                ['key' => 'customer', 'label' => 'Customer', 'format' => 'text'],
                ['key' => 'reference', 'label' => 'Reference', 'format' => 'text'],
                ['key' => 'method', 'label' => 'Method', 'format' => 'text'],
                ['key' => 'source', 'label' => 'Source', 'format' => 'text'],
                ['key' => 'amount', 'label' => 'Amount', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'applied', 'label' => 'Applied', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'outstanding', 'label' => 'Held', 'format' => 'currency', 'align' => 'right'],
                ['key' => 'age_days', 'label' => 'Days', 'format' => 'number', 'align' => 'right'],
            ],
            'rows' => $rows,
            'totals' => ['date' => 'Total', 'customer' => '', 'reference' => '', 'method' => '', 'source' => '', ...$totals, 'age_days' => null],
            'notes' => array_values(array_filter([
                abs($liability - $totals['outstanding']) >= 0.01
                    ? 'The 2300 ledger balance differs from the deposits held by '.number_format($liability - $totals['outstanding'], 2).' (e.g. deposits carried in through opening balances or manual journals).'
                    : null,
            ])),
        ];
    }

    /** Net debit movement of an account in the period (expenses are positive). */
    protected function ledgerMovement(string $code, string $from, string $to): float
    {
        $account = Account::query()->where('code', $code)->first();
        if (! $account) {
            return 0.0;
        }

        return round((float) JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entry_lines.account_id', $account->id)
            ->whereIn('journal_entries.status', JournalEntry::LEDGER_STATUSES)
            ->whereNull('journal_entries.deleted_at')
            ->whereDate('journal_entries.entry_date', '>=', $from)->whereDate('journal_entries.entry_date', '<=', $to)
            ->sum(DB::raw('journal_entry_lines.debit - journal_entry_lines.credit')), 2);
    }

    /** Credit balance of a liability account up to a date. */
    protected function ledgerBalance(string $code, string $asOf): float
    {
        $account = Account::query()->where('code', $code)->first();
        if (! $account) {
            return 0.0;
        }

        return round((float) JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entry_lines.account_id', $account->id)
            ->whereIn('journal_entries.status', JournalEntry::LEDGER_STATUSES)
            ->whereNull('journal_entries.deleted_at')
            ->whereDate('journal_entries.entry_date', '<=', $asOf)
            ->sum(DB::raw('journal_entry_lines.credit - journal_entry_lines.debit')), 2);
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  list<string>  $keys
     * @return array<string, float|int>
     */
    protected function sum(array $rows, array $keys): array
    {
        $totals = [];
        foreach ($keys as $key) {
            $value = array_sum(array_column($rows, $key));
            $totals[$key] = is_int($value) ? $value : round((float) $value, 2);
        }

        return $totals;
    }
}
