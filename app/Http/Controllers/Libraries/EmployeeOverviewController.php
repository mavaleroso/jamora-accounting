<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditTrailResource;
use App\Models\AttendanceRequest;
use App\Models\AuditTrail;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollAdjustment;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\User;
use App\Services\Payroll\PayslipPresenter;
use App\Services\People\BenefitCalculator;
use App\Services\People\EmployeeRequestFeed;
use App\Services\People\LeaveService;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Everything about one employee for the Employee Directory's profile view, loaded when it opens:
 * leave balances, contributions and login, plus payroll, request, time-record and activity history.
 * Each history is included only when the viewer may see it elsewhere in the app.
 */
class EmployeeOverviewController extends Controller
{
    private const ATTENDANCE_DAYS = 60;

    private const LIMIT = 100;

    public function __construct(
        protected LeaveService $leaveService,
        protected EmployeeRequestFeed $requestFeed,
        protected BenefitCalculator $benefitCalculator,
        protected EntityContext $entityContext,
    ) {}

    public function __invoke(Request $request, int $id): JsonResponse
    {
        // The directory lists every company the user can open; the employee's own company is current for the lookups.
        $employee = Employee::query()->visibleTo($request->user())->findOrFail($id);

        return $this->entityContext->runAs($employee->entity, fn () => $this->overview($request, $employee));
    }

    private function overview(Request $request, Employee $employee): JsonResponse
    {
        $user = $request->user();
        $can = [
            'payroll' => $user->canAny(['payroll.view', 'payroll.manage', 'payroll.run']),
            'requests' => $user->canAny(['leave.view', 'leave.approve', 'attendance.view', 'attendance.manage', 'payroll.manage']),
            'attendance' => $user->canAny(['attendance.view', 'attendance.manage', 'payroll.manage']),
            'activity' => $user->can('admin.audit-trails.view'),
        ];
        $today = Carbon::today();

        return response()->json([
            'can' => $can,
            'account' => $this->account($employee, $can['activity']),
            'contributions' => $this->benefitCalculator->statutoryFor($employee, $employee->monthlyRate()),
            'leave' => $this->leaveService->balanceSummary(
                $employee,
                (int) $today->year,
                LeaveType::query()->where('is_active', true)->orderBy('sort_order')->get(),
            ),
            'payroll' => $can['payroll'] ? $this->payroll($employee, $today) : null,
            'requests' => $can['requests'] ? $this->requests($employee) : null,
            'attendance' => $can['attendance'] ? $this->attendance($employee, $today) : null,
            'activity' => $can['activity'] ? $this->activity($employee, $request, $today) : null,
        ]);
    }

    private function account(Employee $employee, bool $withSignIns): ?array
    {
        $user = $employee->user()->with('roles:id,name')->first();
        if (! $user) {
            return null;
        }

        return [
            'id' => $user->id,
            'username' => $user->username,
            'email' => $user->email,
            'status' => (bool) $user->status,
            'role' => $user->roles->first()?->name,
            // Sign-in times come from the audit trail, so only for those who may see it.
            'last_login_at' => $withSignIns
                ? AuditTrail::query()->where('user_id', $user->id)->where('event', 'login')->latest('id')->value('created_at')?->toIso8601String()
                : null,
        ];
    }

    /**
     * Every payslip except voided drafts, newest first, with this year's released totals.
     */
    private function payroll(Employee $employee, Carbon $today): array
    {
        $slips = Payslip::query()
            ->with(['payrollRun.period', 'employee'])
            ->where('employee_id', $employee->id)
            ->whereHas('payrollRun', fn ($q) => $q->where('status', '!=', PayrollRun::STATUS_VOID))
            ->get()
            ->filter(fn (Payslip $p) => $p->payrollRun?->period !== null)
            ->sortByDesc(fn (Payslip $p) => $p->payrollRun->period->end_date->toDateString())
            ->values();

        $year = $slips->filter(fn (Payslip $p) => in_array($p->payrollRun->status, PayrollRun::RELEASED_STATUSES, true)
            && $p->payrollRun->period->end_date->year === $today->year);
        $sum = fn (string ...$columns) => round($year->sum(fn (Payslip $p) => array_sum(array_map(fn ($c) => (float) $p->{$c}, $columns))), 2);

        return [
            'year' => $today->year,
            'ytd' => [
                'payslips' => $year->count(),
                'gross' => $sum('gross_pay'),
                'net' => $sum('net_pay'),
                'contributions' => $sum('sss', 'philhealth', 'pagibig'),
                'withholding_tax' => $sum('withholding_tax'),
                'thirteenth_month' => $sum('thirteenth_month_accrual'),
            ],
            'payslips' => $slips->take(self::LIMIT)->map(function (Payslip $p) {
                $run = $p->payrollRun;
                $period = $run->period;

                return [
                    ...PayslipPresenter::present($p),
                    'run' => ['id' => $run->id, 'run_no' => $run->run_no, 'status' => $run->status, 'paid_on' => $run->paid_on?->toDateString()],
                    'period' => [
                        'code' => $period->code,
                        'start_date' => $period->start_date->toDateString(),
                        'end_date' => $period->end_date->toDateString(),
                        'pay_date' => $period->pay_date?->toDateString(),
                    ],
                ];
            })->values()->all(),
        ];
    }

    private function requests(Employee $employee): array
    {
        $mine = fn () => $this->requestFeed->query($this->entityContext->id())->where('employee_id', $employee->id);

        return [
            'counts' => $mine()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status')->map(fn ($n) => (int) $n),
            'items' => $this->requestFeed->present($mine()->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get())
                ->map(fn (array $r) => [...$r, 'employee' => null])
                ->values(),
        ];
    }

    private function attendance(Employee $employee, Carbon $today): array
    {
        $from = $today->copy()->subDays(self::ATTENDANCE_DAYS - 1);
        $rows = DtrEntry::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('work_date', [$from->toDateString(), $today->toDateString()])
            ->orderByDesc('work_date')
            ->get();

        $worked = $rows->filter(fn (DtrEntry $d) => $d->time_in !== null);

        return [
            'from' => $from->toDateString(),
            'to' => $today->toDateString(),
            'summary' => [
                'days_worked' => $worked->count(),
                'late_days' => $rows->filter(fn (DtrEntry $d) => (float) $d->tardiness_minutes > 0)->count(),
                'late_minutes' => (int) round($rows->sum(fn (DtrEntry $d) => (float) $d->tardiness_minutes)),
                'undertime_minutes' => (int) round($rows->sum(fn (DtrEntry $d) => (float) $d->undertime_minutes)),
                'absences' => $rows->where('attendance_status', 'absent')->count(),
                'leave_days' => $rows->where('attendance_status', 'on_leave')->count(),
                'missing_punches' => $rows->where('attendance_status', 'incomplete')->count(),
                'hours_worked' => round($rows->sum(fn (DtrEntry $d) => (float) $d->regular_hours), 2),
                'ot_hours' => round($rows->sum(fn (DtrEntry $d) => (float) $d->ot_hours_approved), 2),
                'pending' => $rows->where('status', DtrEntry::STATUS_OPEN)->count(),
            ],
            'days' => $rows->map(fn (DtrEntry $d) => [
                'id' => $d->id,
                'work_date' => $d->work_date->toDateString(),
                'day_type' => $d->day_type,
                'attendance_status' => $d->attendance_status,
                'status' => $d->status,
                'time_in' => $d->time_in,
                'break_out' => $d->break_out,
                'break_in' => $d->break_in,
                'time_out' => $d->time_out,
                'regular_hours' => (float) $d->regular_hours,
                'tardiness_minutes' => (float) $d->tardiness_minutes,
                'undertime_minutes' => (float) $d->undertime_minutes,
                'ot_hours_approved' => (float) $d->ot_hours_approved,
                'source' => $d->source,
            ])->values(),
        ];
    }

    /**
     * Audit entries about this employee: their record and login, their requests, benefit enrollments,
     * payroll adjustments and recent time records.
     */
    private function activity(Employee $employee, Request $request, Carbon $today): array
    {
        $subjects = [
            Employee::class => [$employee->id],
            User::class => array_filter([$employee->user_id]),
            LeaveRequest::class => LeaveRequest::query()->where('employee_id', $employee->id)->pluck('id')->all(),
            AttendanceRequest::class => AttendanceRequest::query()->where('employee_id', $employee->id)->pluck('id')->all(),
            EmployeeBenefit::class => EmployeeBenefit::query()->where('employee_id', $employee->id)->pluck('id')->all(),
            PayrollAdjustment::class => PayrollAdjustment::query()->where('employee_id', $employee->id)->pluck('id')->all(),
            DtrEntry::class => DtrEntry::query()->where('employee_id', $employee->id)
                ->whereDate('work_date', '>=', $today->copy()->subDays(self::ATTENDANCE_DAYS - 1))->pluck('id')->all(),
        ];

        $rows = AuditTrail::query()
            ->with(['user:id,firstname,lastname,username', 'entity:id,code,name'])
            ->where(function ($q) use ($subjects) {
                foreach ($subjects as $type => $ids) {
                    if ($ids !== []) {
                        $q->orWhere(fn ($w) => $w->where('subject_type', $type)->whereIn('subject_id', array_map('strval', $ids)));
                    }
                }
            })
            ->latest('id')
            ->limit(self::LIMIT)
            ->get();

        return [
            // Without the submitted payload; the IP address and device stay.
            'items' => $rows->map(function (AuditTrail $a) use ($request) {
                $item = (new AuditTrailResource($a))->toArray($request);
                $item['request']['payload'] = null;

                return $item;
            })->values(),
            'subject' => ['type' => Employee::class, 'id' => (string) $employee->id],
            'truncated' => $rows->count() === self::LIMIT,
        ];
    }
}
