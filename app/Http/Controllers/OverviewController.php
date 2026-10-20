<?php

namespace App\Http\Controllers;

use App\Models\AccountingPeriod;
use App\Models\AttendanceRequest;
use App\Models\AuditTrail;
use App\Models\BankAccount;
use App\Models\BankReconciliation;
use App\Models\BankTransaction;
use App\Models\Bill;
use App\Models\ComplianceItem;
use App\Models\CostCenter;
use App\Models\CustomerDeposit;
use App\Models\Employee;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\LeaveRequest;
use App\Models\Partner;
use App\Models\PayrollRun;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use App\Models\TaxCode;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Role;

/**
 * Landing page after login: a snapshot of every module the user can access.
 *
 * Each metric is gated by the same permissions as the sidebar link it points to,
 * so users only ever see figures for modules they can open.
 */
class OverviewController extends Controller
{
    public function index(Request $request): Response
    {
        return Inertia::render('overview', [
            'modules' => Inertia::defer(fn () => $this->modules($request->user())),
        ]);
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    private function modules(User $user): array
    {
        $today = Carbon::now('Asia/Manila')->startOfDay();
        $can = fn (array $permissions): bool => $user->canAny($permissions);

        $modules = [
            'Accounting' => $this->accounting($can, $today),
            'Billing' => $this->billing($can, $today),
            'Inventory Integration' => $this->integration($can),
            'Accounts Payable' => $this->payables($can, $today),
            'Banks' => $this->banks($can),
            'Employee Management' => $this->employees($can, $today),
            'Reports' => $this->reports($can, $today),
            'Libraries' => $this->libraries($can),
            'Admin' => $this->admin($can, $today),
        ];

        return array_filter(array_map(fn (array $metrics) => array_values(array_filter($metrics)), $modules));
    }

    /**
     * @param  'number'|'currency'|'text'  $format
     * @param  'default'|'warning'|'danger'|'success'  $tone
     * @return array<string, mixed>
     */
    private function metric(string $label, int|float|string|null $value, string $format = 'number', string $tone = 'default', ?string $href = null, ?string $hint = null): array
    {
        return compact('label', 'value', 'format', 'tone', 'href', 'hint');
    }

    /**
     * Tone for a count that should ideally be zero.
     *
     * @return 'default'|'warning'|'danger'
     */
    private function alertTone(int $count, string $tone = 'warning'): string
    {
        return $count > 0 ? $tone : 'default';
    }

    private function accounting(callable $can, Carbon $today): array
    {
        $metrics = [];

        if ($can(['journals.view', 'journals.create', 'journals.update', 'journals.post'])) {
            $unposted = JournalEntry::query()->whereIn('status', ['draft', 'pending'])->count();
            $metrics[] = $this->metric('Unposted entries', $unposted, tone: $this->alertTone($unposted), href: '/accounting/journal-entries');
        }

        if ($can(['journals.approve'])) {
            $awaiting = JournalEntry::query()->where('source_system', 'manual')->where('status', 'pending')->count();
            $metrics[] = $this->metric('Entries for approval', $awaiting, tone: $this->alertTone($awaiting), href: '/accounting/journal-entries?status=pending', hint: 'Submitted manual entries waiting for your review.');
        }

        if ($can(['dashboard.view'])) {
            $totals = $this->classificationTotals($today->copy()->startOfMonth(), $today->copy()->endOfMonth());
            $metrics[] = $this->metric('Revenue MTD', $totals['revenue'], 'currency', href: '/accounting/dashboard');
            $metrics[] = $this->metric('Expenses MTD', $totals['expense'], 'currency', href: '/accounting/dashboard');
        }

        if ($can(['periods.view', 'periods.manage', 'periods.close', 'periods.reopen'])) {
            $period = AccountingPeriod::query()
                ->where('status', 'open')
                ->whereDate('start_date', '<=', $today)
                ->whereDate('end_date', '>=', $today)
                ->first();
            $metrics[] = $this->metric(
                'Current period',
                $period ? 'Period '.$period->period_no : 'None open',
                'text',
                $period ? 'default' : 'warning',
                '/accounting/periods',
                $period ? $period->start_date->format('M j').' – '.$period->end_date->format('M j') : null,
            );
        }

        return $metrics;
    }

    private function billing(callable $can, Carbon $today): array
    {
        if (! $can(['billing.view', 'billing.manage', 'billing.collect'])) {
            return [];
        }

        $open = Invoice::query()->whereIn('status', ['confirmed', 'partially_paid']);
        $overdue = (clone $open)->whereDate('due_date', '<', $today)->count();

        return [
            $this->metric('Receivables', round((float) (clone $open)->sum('balance_due'), 2), 'currency', href: '/billing/invoices'),
            $this->metric('Overdue invoices', $overdue, tone: $this->alertTone($overdue, 'danger'), href: '/billing/invoices'),
            $this->metric('Invoices this month', Invoice::query()->whereDate('invoice_date', '>=', $today->copy()->startOfMonth()->toDateString())->whereDate('invoice_date', '<=', $today->copy()->endOfMonth()->toDateString())->count(), href: '/billing/invoices'),
            $this->metric('Open deposits', round((float) CustomerDeposit::query()->where('status', 'open')->sum(DB::raw('amount - applied_amount')), 2), 'currency', href: '/billing/deposits'),
        ];
    }

    private function integration(callable $can): array
    {
        $metrics = [];

        if ($can(['integration.optical.view', 'journals.view', 'billing.view'])) {
            $review = InventoryMovement::query()->where('review_status', 'needs_review')->count();
            $metrics[] = $this->metric('Movements to review', $review, tone: $this->alertTone($review), href: '/integration/inventory');
        }

        if ($can(['integration.optical.view', 'integration.optical.sync'])) {
            $failed = SyncDocument::query()->where('status', 'failed')->count();
            $lastRun = SyncRun::query()->latest('started_at')->first();
            $metrics[] = $this->metric('Sync failures', $failed, tone: $this->alertTone($failed, 'danger'), href: '/integration/optical');
            $metrics[] = $this->metric(
                'Last sync',
                $lastRun?->started_at?->diffForHumans() ?? 'Never',
                'text',
                $lastRun && $lastRun->status === 'failed' ? 'danger' : 'default',
                '/integration/optical',
                $lastRun ? ucfirst((string) $lastRun->status) : null,
            );
        }

        return $metrics;
    }

    private function payables(callable $can, Carbon $today): array
    {
        if (! $can(['ap.view', 'ap.manage', 'ap.pay'])) {
            return [];
        }

        $open = Bill::query()->whereIn('status', ['posted', 'partially_paid']);
        $overdue = (clone $open)->whereDate('due_date', '<', $today)->count();
        $dueSoon = (clone $open)->whereDate('due_date', '>=', $today->toDateString())->whereDate('due_date', '<=', $today->copy()->addDays(7)->toDateString())->count();

        return [
            $this->metric('Payables', round((float) (clone $open)->sum('balance_due'), 2), 'currency', href: '/ap/bills'),
            $this->metric('Overdue bills', $overdue, tone: $this->alertTone($overdue, 'danger'), href: '/ap/bills'),
            $this->metric('Due in 7 days', $dueSoon, tone: $this->alertTone($dueSoon), href: '/ap/bills'),
        ];
    }

    private function banks(callable $can): array
    {
        if (! $can(['banks.view', 'banks.manage', 'banks.reconcile'])) {
            return [];
        }

        $openRecs = BankReconciliation::query()->where('status', 'open')->count();

        return [
            $this->metric('Active accounts', BankAccount::query()->where('is_active', true)->count(), href: '/banks/accounts'),
            $this->metric('Open reconciliations', $openRecs, tone: $this->alertTone($openRecs), href: '/banks/reconciliations'),
            $this->metric('Uncleared transactions', BankTransaction::query()->where('is_cleared', false)->count(), href: '/banks/reconciliations'),
        ];
    }

    private function employees(callable $can, Carbon $today): array
    {
        $metrics = [];

        if ($can(['libraries.employees.manage'])) {
            $metrics[] = $this->metric(
                'Active employees',
                Employee::query()->where('is_active', true)->where('employment_status', 'active')->count(),
                href: '/libraries/employees',
            );
        }

        if ($can(['requests.approve'])) {
            $pending = LeaveRequest::query()->where('status', LeaveRequest::STATUS_PENDING)->count();
            $metrics[] = $this->metric('Leave to approve', $pending, tone: $this->alertTone($pending), href: '/employee-management/requests');
        }

        if ($can(['requests.approve'])) {
            $pending = AttendanceRequest::query()->where('status', 'pending')->count();
            $metrics[] = $this->metric('Attendance requests', $pending, tone: $this->alertTone($pending), href: '/employee-management/requests');
        }

        if ($can(['payroll.view', 'payroll.run'])) {
            $run = PayrollRun::query()->where('status', '!=', PayrollRun::STATUS_VOID)->latest('id')->first();
            $metrics[] = $this->metric(
                'Latest payroll',
                $run ? round((float) $run->net_total, 2) : null,
                'currency',
                href: '/payroll/runs',
                hint: $run ? $run->run_no.' · '.ucfirst((string) $run->status) : 'No runs yet',
            );
        }

        if ($can(['compliance.view', 'compliance.manage', 'compliance.verify'])) {
            $overdue = ComplianceItem::query()
                ->whereIn('status', ['pending', 'prepared'])
                ->whereDate('due_date', '<', $today)
                ->count();
            $metrics[] = $this->metric('Overdue filings', $overdue, tone: $this->alertTone($overdue, 'danger'), href: '/employee-management/compliance');
        }

        return $metrics;
    }

    private function reports(callable $can, Carbon $today): array
    {
        if (! $can(['reports.income-statement.view'])) {
            return [];
        }

        $month = $this->classificationTotals($today->copy()->startOfMonth(), $today->copy()->endOfMonth());
        $year = $this->classificationTotals($today->copy()->startOfYear(), $today->copy()->endOfYear());
        $netMonth = round($month['revenue'] - $month['expense'], 2);

        return [
            $this->metric('Net income MTD', $netMonth, 'currency', $netMonth < 0 ? 'danger' : 'success', '/reports/income-statement'),
            $this->metric('Revenue YTD', $year['revenue'], 'currency', href: '/reports/income-statement'),
            $this->metric('Expenses YTD', $year['expense'], 'currency', href: '/reports/income-statement'),
        ];
    }

    private function libraries(callable $can): array
    {
        return [
            $can(['libraries.partners.manage']) ? $this->metric('Partners', Partner::query()->count(), href: '/libraries/partners') : null,
            $can(['libraries.vendors.manage']) ? $this->metric('Vendors', Vendor::query()->count(), href: '/libraries/vendors') : null,
            $can(['libraries.cost-centers.manage']) ? $this->metric('Cost centers', CostCenter::query()->count(), href: '/libraries/cost-centers') : null,
            $can(['libraries.tax-codes.manage']) ? $this->metric('Tax codes', TaxCode::query()->count(), href: '/libraries/tax-codes') : null,
        ];
    }

    private function admin(callable $can, Carbon $today): array
    {
        return [
            $can(['admin.users.manage']) ? $this->metric('Users', User::query()->count(), href: '/admin/users') : null,
            $can(['admin.roles-permissions.manage']) ? $this->metric('Roles', Role::query()->count(), href: '/admin/roles') : null,
            $can(['admin.audit-trails.view'])
                ? $this->metric('Activity today', AuditTrail::query()->where('created_at', '>=', $today->copy()->utc())->count(), href: '/admin/audit-trails')
                : null,
        ];
    }

    /**
     * Posted revenue and expense totals for a date range, in one query.
     *
     * @return array{revenue: float, expense: float}
     */
    private function classificationTotals(Carbon $from, Carbon $to): array
    {
        $rows = JournalEntryLine::query()
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->join('accounts', 'journal_entry_lines.account_id', '=', 'accounts.id')
            ->join('account_types', 'accounts.account_type_id', '=', 'account_types.id')
            ->where('journal_entries.status', 'posted')
            ->whereIn('account_types.classification', ['revenue', 'expense'])
            ->whereBetween('journal_entries.entry_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('account_types.classification')
            ->select([
                'account_types.classification',
                DB::raw('COALESCE(SUM(journal_entry_lines.debit), 0) as total_debit'),
                DB::raw('COALESCE(SUM(journal_entry_lines.credit), 0) as total_credit'),
            ])
            ->get()
            ->keyBy('classification');

        $revenue = $rows->get('revenue');
        $expense = $rows->get('expense');

        return [
            'revenue' => round((float) ($revenue?->total_credit ?? 0) - (float) ($revenue?->total_debit ?? 0), 2),
            'expense' => round((float) ($expense?->total_debit ?? 0) - (float) ($expense?->total_credit ?? 0), 2),
        ];
    }
}
