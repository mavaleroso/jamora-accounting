<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\ComplianceItem;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\User;
use App\Services\People\ComplianceCalendar;
use App\Services\People\EmployeeRequestFeed;
use App\Services\People\PeopleAnalytics;
use App\Services\People\TeamBoard;
use App\Support\EntityContext;
use App\Support\MissingValue;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Employee Management home: what needs attention today. Each section is only built for users who can act on
 * it — the team board for timekeepers, the approval inbox for approvers, payroll for payroll, compliance
 * for compliance. Analysis over a period lives in People Reports.
 */
class EmployeeDashboardController extends Controller
{
    public function __construct(
        protected TeamBoard $teamBoard,
        protected EmployeeRequestFeed $requestFeed,
        protected ComplianceCalendar $complianceCalendar,
    ) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = (int) $entityContext->id();
        $user = $request->user();
        $can = fn (string ...$permissions) => collect($permissions)->contains(fn ($p) => $user?->can($p));
        $today = Carbon::today();

        $show = [
            'team' => $can('attendance.manage', 'payroll.manage', 'roster.manage'),
            'inbox' => $can('leave.approve', 'attendance.manage', 'payroll.manage'),
            'payroll' => $can('payroll.view', 'payroll.run'),
            'compliance' => $can('compliance.view'),
            'people' => $can('libraries.employees.manage', 'payroll.manage', 'payroll.view'),
        ];

        return Inertia::render('employee-management/dashboard/page', [
            'today' => $today->toDateString(),
            'greeting' => $this->greeting($user),
            'show' => $show,
            'team' => $show['team'] ? $this->team($entityId) : null,
            'trend' => $show['team'] ? $this->trend($entityId, $today) : null,
            'inbox' => $show['inbox'] ? $this->inbox($entityId, $today) : null,
            'payroll' => $show['payroll'] ? $this->payroll($today) : null,
            'compliance' => $show['compliance'] ? $this->compliance($entityId, $today) : null,
            'people' => $show['people'] ? $this->people($entityId, $today) : null,
            'out' => $show['team'] || $show['inbox'] ? $this->out($entityId, $today) : null,
        ]);
    }

    // -----------------------------------------------------------------------------------------

    /** Today's board, condensed: counts and who needs a look (late / not in yet / absent). */
    private function team(int $entityId): array
    {
        $board = $this->teamBoard->build($entityId);
        $counts = $board['counts'];
        $off = ($counts['rest_day'] ?? 0) + ($counts['holiday'] ?? 0);
        $person = fn (array $row) => [
            ...collect($row['employee'])->only(['id', 'employee_code', 'name', 'position', 'avatar_url'])->all(),
            'status' => $row['status'],
            'late_by' => $row['late_by'] ?? null,
            'tardiness_minutes' => $row['tardiness_minutes'],
            'shift_start' => $row['schedule']['start'] ?? null,
            'leave' => $row['leave'],
        ];

        return [
            'holiday' => $board['holiday'],
            'generatedAt' => $board['generated_at'],
            'counts' => [
                'scheduled' => count($board['rows']) - $off,
                'in' => ($counts['working'] ?? 0) + ($counts['on_break'] ?? 0) + ($counts['done'] ?? 0),
                'working' => ($counts['working'] ?? 0) + ($counts['on_break'] ?? 0),
                'done' => $counts['done'] ?? 0,
                'late' => $counts['late'] ?? 0,
                'expected' => $counts['expected'] ?? 0,
                'onLeave' => $counts['on_leave'] ?? 0,
                'absent' => $counts['absent'] ?? 0,
                'off' => $off,
                'arrivedLate' => collect($board['rows'])->filter(fn ($r) => in_array($r['status'], ['working', 'on_break', 'done'], true) && $r['tardiness_minutes'] > 0)->count(),
            ],
            'attention' => collect($board['rows'])->whereIn('status', ['late', 'absent'])->map($person)->values()->take(8),
            'arrivedLate' => collect($board['rows'])->filter(fn ($r) => in_array($r['status'], ['working', 'on_break', 'done'], true) && $r['tardiness_minutes'] > 0)
                ->sortByDesc('tardiness_minutes')->map($person)->values()->take(5),
        ];
    }

    /** Attendance rate for the last 14 completed days. */
    private function trend(int $entityId, Carbon $today): array
    {
        $analytics = new PeopleAnalytics($entityId, $today->copy()->subDays(14), $today->copy()->subDay());
        $attendance = $analytics->attendance();

        return [
            'rate' => $attendance['rate'],
            'daily' => $attendance['daily'],
            'lateCount' => $attendance['lateCount'],
            'absences' => $attendance['absences'],
        ];
    }

    /** Requests waiting for a decision, and time records that need review before payroll. */
    private function inbox(int $entityId, Carbon $today): array
    {
        $pending = $this->requestFeed->query($entityId)->where('status', 'pending');
        $byKind = (clone $pending)->selectRaw('kind, count(*) as n')->groupBy('kind')->pluck('n', 'kind');
        $oldest = (clone $pending)->orderBy('created_at')->limit(6)->get();

        $open = DtrEntry::query()->where('entity_id', $entityId)->where('status', DtrEntry::STATUS_OPEN)->whereDate('work_date', '<', $today->toDateString());

        return [
            'pendingTotal' => (int) $byKind->sum(),
            'pendingByKind' => $byKind->map(fn ($n) => (int) $n),
            'oldest' => $this->requestFeed->present($oldest)->map(fn (array $r) => [
                'key' => $r['key'],
                'title' => $r['title'],
                'kind' => $r['kind'],
                'employee' => $r['employee'] ? ['name' => $r['employee']->name, 'employee_code' => $r['employee']->employee_code, 'avatar_url' => $r['employee']->avatar_url] : null,
                'date_from' => $r['date_from'],
                'date_to' => $r['date_to'],
                'filed_at' => $r['filed_at'],
            ]),
            'unapprovedRecords' => (clone $open)->count(),
            'incompleteRecords' => (clone $open)->where('attendance_status', 'incomplete')->count(),
            'oldestUnapproved' => (clone $open)->min('work_date'),
        ];
    }

    /** Pay periods that still need payroll work, oldest first, and the next pay day. */
    private function payroll(Carbon $today): array
    {
        $periods = PayrollPeriod::query()
            ->with('activeRun')
            ->whereDate('start_date', '<=', $today->toDateString())
            ->orderBy('start_date')
            ->get()
            ->filter(fn (PayrollPeriod $p) => $p->activeRun?->status !== PayrollRun::STATUS_PAID)
            ->take(3);

        $next = PayrollPeriod::query()->whereDate('pay_date', '>=', $today->toDateString())->orderBy('pay_date')->first();

        return [
            'periods' => $periods->map(fn (PayrollPeriod $p) => [
                'id' => $p->id,
                'code' => $p->code,
                'start_date' => $p->start_date->toDateString(),
                'end_date' => $p->end_date->toDateString(),
                'pay_date' => $p->pay_date?->toDateString(),
                'run' => $p->activeRun ? ['id' => $p->activeRun->id, 'status' => $p->activeRun->status, 'net_total' => (float) $p->activeRun->net_total, 'headcount' => $p->activeRun->headcount] : null,
                'cutoffOver' => $p->end_date->lt($today),
            ])->values(),
            'nextPayDate' => $next?->pay_date?->toDateString(),
            'nextPayCode' => $next?->code,
        ];
    }

    private function compliance(int $entityId, Carbon $today): array
    {
        $this->complianceCalendar->ensureRecent($entityId, $today);

        $open = ComplianceItem::query()->where('entity_id', $entityId)->whereIn('status', ['pending', 'prepared'])->orderBy('due_date')->get();
        $soon = $open->filter(fn (ComplianceItem $i) => $i->due_date && $i->due_date->lte($today->copy()->addDays(14)));

        return [
            'overdue' => $open->filter->isOverdue()->count(),
            'dueSoon' => $soon->reject->isOverdue()->count(),
            'awaitingVerification' => ComplianceItem::query()->where('entity_id', $entityId)->where('status', 'submitted')->count(),
            'items' => $soon->take(5)->map(fn (ComplianceItem $i) => [
                'id' => $i->id,
                'title' => $i->title,
                'agency' => $i->agency,
                'form_code' => $i->form_code,
                'period' => $i->period,
                'due_date' => $i->due_date?->toDateString(),
                'status' => $i->status,
                'overdue' => $i->isOverdue(),
            ])->values(),
        ];
    }

    /** People follow-ups: probation reviews, work anniversaries, new joiners, incomplete records. */
    private function people(int $entityId, Carbon $today): array
    {
        $active = Employee::query()->where('entity_id', $entityId)->where('is_active', true)->where('employment_status', 'active')->get();
        $card = fn (Employee $e) => $e->only(['id', 'employee_code', 'name', 'position', 'avatar_url']);

        return [
            'active' => $active->count(),
            'newThisMonth' => $active->filter(fn (Employee $e) => $e->hire_date?->isSameMonth($today))->map($card)->values(),
            'probationDue' => $active
                ->filter(fn (Employee $e) => $e->employment_type === 'probationary' && ! $e->regularization_date && $e->hire_date && $e->hire_date->copy()->addMonths(6)->lte($today->copy()->addDays(30)))
                ->sortBy(fn (Employee $e) => $e->hire_date)
                ->map(fn (Employee $e) => $card($e) + ['due' => $e->hire_date->copy()->addMonths(6)->toDateString()])
                ->values(),
            'anniversaries' => $active
                ->filter(fn (Employee $e) => $e->hire_date && $e->hire_date->month === $today->month && $e->hire_date->year < $today->year)
                ->sortBy(fn (Employee $e) => $e->hire_date->day)
                ->map(fn (Employee $e) => $card($e) + ['date' => $e->hire_date->copy()->year($today->year)->toDateString(), 'years' => $today->year - $e->hire_date->year])
                ->values(),
            'missingIds' => $active->filter(fn (Employee $e) => MissingValue::is($e->sss_number) || MissingValue::is($e->philhealth_number) || MissingValue::is($e->pagibig_number) || MissingValue::is($e->tin))->count(),
            'noBank' => $active->filter(fn (Employee $e) => blank($e->bank_account_no))->count(),
        ];
    }

    /** Approved leave today and over the next 7 days. */
    private function out(int $entityId, Carbon $today): array
    {
        $leave = (new PeopleAnalytics($entityId, $today, $today))->leave(false);

        return collect($leave['upcoming'])
            ->filter(fn ($l) => $l['start'] <= $today->copy()->addDays(7)->toDateString())
            ->map(fn ($l) => [...$l, 'today' => $l['start'] <= $today->toDateString()])
            ->values()
            ->all();
    }

    private function greeting(?User $user): string
    {
        $hour = (int) Carbon::now()->format('G');
        $part = $hour < 12 ? 'Good morning' : ($hour < 18 ? 'Good afternoon' : 'Good evening');

        return trim($part.($user?->firstname ? ', '.$user->firstname : ''));
    }
}
