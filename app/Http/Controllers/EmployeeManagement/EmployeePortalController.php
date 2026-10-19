<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Services\People\AttendanceCalculator;
use App\Services\People\EmployeeRequestFeed;
use App\Services\People\EmployeeResolver;
use App\Services\People\LeaveService;
use App\Support\EntityContext;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Employee home ("Dashboard" for the Employee role). A summary that links into the working
 * modules — My Attendance, My Requests — rather than repeating them, plus the two things only
 * available here: the employee's own payslips and their own record.
 */
class EmployeePortalController extends Controller
{
    public function __construct(
        protected EmployeeResolver $employeeResolver,
        protected LeaveService $leaveService,
        protected AttendanceCalculator $attendanceCalculator,
        protected EmployeeRequestFeed $requestFeed
    ) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $employee = $this->employeeResolver->forUser($user, $entityId);

        if (! $employee) {
            return Inertia::render('employee-management/portal/page', ['employee' => null]);
        }

        $today = Carbon::today();
        $dtr = DtrEntry::query()
            ->where('employee_id', $employee->id)
            ->whereDate('work_date', $today)
            ->first(['time_in', 'break_out', 'break_in', 'time_out', 'attendance_status', 'tardiness_minutes', 'regular_hours']);

        $mine = fn () => $this->requestFeed->query($entityId)->where('employee_id', $employee->id);

        return Inertia::render('employee-management/portal/page', [
            'employee' => $this->profile($employee),
            'week' => $this->week($employee, $today),
            'todayRecord' => $dtr,
            'requests' => [
                'pending' => $mine()->where('status', 'pending')->count(),
                'recent' => $this->requestFeed->present($mine()->orderByDesc('created_at')->orderByDesc('id')->limit(4)->get()),
            ],
            'balances' => $this->leaveService->balanceSummary(
                $employee,
                (int) $today->year,
                LeaveType::query()->where('is_active', true)->orderBy('sort_order')->get(),
            ),
            'payslips' => $this->payslips($employee),
            'can' => [
                'punch' => $user->canAny(['attendance.punch', 'payroll.manage']),
                'fileRequests' => $user->canAny(['leave.file', 'attendance.view', 'attendance.punch', 'payroll.manage']),
            ],
            'today' => $today->toDateString(),
        ]);
    }

    private function profile(Employee $employee): array
    {
        $account = (string) $employee->bank_account_no;

        return [
            ...$employee->only([
                'id', 'employee_code', 'firstname', 'lastname', 'name', 'avatar_url', 'position',
                'employment_status', 'employment_type', 'email', 'phone',
                'sss_number', 'philhealth_number', 'pagibig_number', 'tin', 'bank_name',
            ]),
            'hire_date' => $employee->hire_date?->toDateString(),
            'regularization_date' => $employee->regularization_date?->toDateString(),
            // Only the last digits: enough to recognise the account, not to use it.
            'bank_account_hint' => $account !== '' ? '•••• '.substr($account, -4) : null,
        ];
    }

    /**
     * The next seven days as the time clock will see them: roster > shift template > company default,
     * with holidays, approved leave and approved official business on top.
     */
    private function week(Employee $employee, Carbon $today): array
    {
        $end = $today->copy()->addDays(6);

        $leaves = LeaveRequest::query()
            ->with('type:id,code,name')
            ->where('employee_id', $employee->id)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereDate('start_date', '<=', $end)
            ->whereDate('end_date', '>=', $today)
            ->get();

        $business = AttendanceRequest::query()
            ->where('employee_id', $employee->id)
            ->where('request_type', AttendanceRequest::TYPE_OFFICIAL_BUSINESS)
            ->where('status', 'approved')
            ->whereBetween('work_date', [$today->toDateString(), $end->toDateString()])
            ->get()
            ->keyBy(fn (AttendanceRequest $a) => $a->work_date->toDateString());

        return collect(CarbonPeriod::create($today, $end))->map(function (Carbon $date) use ($employee, $leaves, $business) {
            $d = $date->toDateString();
            $schedule = $this->attendanceCalculator->scheduleFor($employee, $date);
            $holiday = $this->attendanceCalculator->holidayFor($employee->entity_id, $date);
            $leave = $leaves->first(fn (LeaveRequest $l) => $l->start_date->toDateString() <= $d && $l->end_date->toDateString() >= $d);
            $ob = $business->get($d);

            return [
                'date' => $d,
                'shift_name' => $schedule->shiftName,
                'start' => $schedule->start,
                'end' => $schedule->end,
                'is_rest_day' => $schedule->isRestDay,
                'source' => $schedule->source,
                'holiday' => $holiday ? ['name' => $holiday->name, 'type' => $holiday->type] : null,
                'leave' => $leave ? ['title' => $leave->type?->name ?? 'Leave', 'half_day' => $leave->half_day] : null,
                'official_business' => $ob ? ['destination' => $ob->destination, 'from' => $ob->requested_time_in, 'to' => $ob->requested_time_out] : null,
            ];
        })->all();
    }

    /**
     * Payslips of posted or released runs only — a draft or approved run can still change.
     */
    private function payslips(Employee $employee): array
    {
        return Payslip::query()
            ->with('payrollRun.period')
            ->where('employee_id', $employee->id)
            ->whereHas('payrollRun', fn ($q) => $q->whereIn('status', PayrollRun::RELEASED_STATUSES))
            ->orderByDesc('id')
            ->limit(6)
            ->get()
            ->map(function (Payslip $p) {
                $period = $p->payrollRun?->period;

                return [
                    'id' => $p->id,
                    'period' => [
                        'code' => $period?->code,
                        'start' => $period?->start_date?->toDateString(),
                        'end' => $period?->end_date?->toDateString(),
                        'pay_date' => $period?->pay_date?->toDateString(),
                    ],
                    'earnings' => [
                        'basic_pay' => (float) $p->basic_pay,
                        'ot_pay' => (float) $p->ot_pay,
                        'holiday_premiums' => (float) $p->holiday_pay,
                        'night_diff_pay' => (float) $p->night_diff_pay,
                        'allowances' => (float) $p->taxable_allowances + (float) $p->non_taxable_allowances,
                        'absences' => (float) $p->absences,
                        'tardiness' => (float) $p->tardiness,
                        'unpaid_leave' => (float) $p->unpaid_leave,
                    ],
                    'deductions' => [
                        'sss' => (float) $p->sss,
                        'philhealth' => (float) $p->philhealth,
                        'pagibig' => (float) $p->pagibig,
                        'withholding_tax' => (float) $p->withholding_tax,
                        'other' => (float) $p->other_deductions,
                    ],
                    'gross_pay' => (float) $p->gross_pay,
                    'total_deductions' => $p->totalDeductions(),
                    'net_pay' => (float) $p->net_pay,
                ];
            })
            ->all();
    }
}
