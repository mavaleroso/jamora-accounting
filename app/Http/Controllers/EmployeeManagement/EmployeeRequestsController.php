<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRequest;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use App\Services\People\AttendanceRequestService;
use App\Services\People\EmployeeRequestFeed;
use App\Services\People\EmployeeResolver;
use App\Services\People\LeaveService;
use App\Support\EntityContext;
use App\Support\PrivateFiles;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Employee Requests — one place to file and decide every request an employee can make:
 * leave (any type in the leave catalogue), overtime, time correction and official business.
 * (Undertime is deducted automatically and schedules are set by HR, so neither is filed any more.)
 *
 * Leave lives in leave_requests (credits, ledger, DTR sync via LeaveService); the day-level
 * requests live in attendance_requests (AttendanceRequestService). This controller merges both
 * into one feed and serves three perspectives:
 *  - Employee (linked employee, cannot approve): files requests, tracks them, sees own balances.
 *  - Approver (leave.approve and/or attendance.manage, or payroll.manage): approvals inbox for the
 *    kinds they may decide, who's out, team history and balances, filing on behalf.
 *  - Viewer (view rights, no linked employee, cannot approve — e.g. Accounting Retainer): team history and
 *    balances, read-only.
 */
class EmployeeRequestsController extends Controller
{
    public const KINDS = ['leave', ...AttendanceRequest::TYPES];

    private const VIEWS = ['mine', 'inbox', 'all', 'balances'];

    private const STATUSES = ['pending', 'approved', 'declined', 'cancelled'];

    public function __construct(
        protected LeaveService $leaveService,
        protected AttendanceRequestService $attendanceRequests,
        protected EmployeeResolver $employeeResolver,
        protected EmployeeRequestFeed $requestFeed
    ) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $self = $this->employeeResolver->forUser($user, $entityId);
        $perspective = $this->perspective($user, $self);
        $today = Carbon::today();
        $year = (int) $request->integer('year', (int) $today->year);

        $views = array_values(array_filter(self::VIEWS, fn ($v) => match ($v) {
            'mine' => $perspective['hasSelf'],
            'inbox' => $perspective['canReview'],
            'all', 'balances' => $perspective['canViewTeam'],
        }));
        $defaultView = $perspective['canReview'] ? 'inbox' : ($perspective['hasSelf'] ? 'mine' : 'all');
        $view = in_array($request->query('view'), $views, true) ? $request->query('view') : $defaultView;

        $kind = in_array($request->query('kind'), self::KINDS, true) ? $request->query('kind') : '';
        $status = in_array($request->query('status'), [...self::STATUSES, 'all'], true) ? $request->query('status') : 'all';
        $employeeId = $view === 'all' ? ($request->integer('employee_id') ?: null) : null;
        // Tables: search, sort and page size (the approvals inbox defaults to oldest-first).
        $search = trim((string) $request->query('q', ''));
        $sort = in_array($request->query('sort'), ['filed', 'date'], true) ? $request->query('sort') : '';
        $dir = $request->query('dir') === 'asc' ? 'asc' : 'desc';
        $perPage = in_array($request->integer('per_page'), [10, 15, 25, 50, 100], true) ? $request->integer('per_page') : 15;
        // Time corrections are decided on the day itself in Time & Attendance › Timesheets, not here.
        $approvable = array_values(array_diff($this->approvableKinds($perspective), [AttendanceRequest::TYPE_CORRECTION]));

        // --- Feed for the current view ------------------------------------------------------
        $feed = null;
        $statusCounts = null;
        if ($view !== 'balances') {
            $scope = $this->requestFeed->query($entityId);
            match ($view) {
                'mine' => $scope->where('employee_id', $self->id),
                'inbox' => $scope->whereIn('kind', $approvable)->when($self, fn ($q) => $q->where('employee_id', '!=', $self->id)),
                'all' => $scope->when($employeeId, fn ($q) => $q->where('employee_id', $employeeId)),
            };
            $scope->when($kind !== '', fn ($q) => $q->where('kind', $kind));
            $scope->when($search !== '', function ($q) use ($search, $view, $entityId) {
                $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
                $q->where(function ($w) use ($like, $view, $entityId) {
                    $w->where('reason', 'like', $like)
                        ->orWhere('destination', 'like', $like)
                        ->orWhere('type_name', 'like', $like);
                    if ($view !== 'mine') {
                        $w->orWhereIn('employee_id', Employee::query()->where('entity_id', $entityId)
                            ->where(fn ($e) => $e->where('firstname', 'like', $like)->orWhere('lastname', 'like', $like)->orWhere('employee_code', 'like', $like))
                            ->select('id'));
                    }
                });
            });

            $statusCounts = (clone $scope)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

            $rows = $scope
                ->when($view === 'inbox', fn ($q) => $q->where('status', 'pending'))
                ->when($view !== 'inbox' && $status !== 'all', fn ($q) => $q->where('status', $status))
                ->when($sort === '' && $view === 'inbox', fn ($q) => $q->orderBy('created_at'))
                ->when($sort === '' && $view !== 'inbox', fn ($q) => $q->orderByRaw("case when status = 'pending' then 0 else 1 end")->orderByDesc('created_at'))
                ->when($sort !== '', fn ($q) => $q->orderBy($sort === 'date' ? 'date_from' : 'created_at', $dir))
                ->orderByDesc('id')
                ->paginate($perPage)
                ->withQueryString();

            $feed = $rows->setCollection($this->requestFeed->present($rows->getCollection()));
        }

        // --- Badges ---------------------------------------------------------------------------
        $inboxByKind = $perspective['canReview']
            ? $this->requestFeed->query($entityId)
                ->where('status', 'pending')
                ->whereIn('kind', $approvable)
                ->when($self, fn ($q) => $q->where('employee_id', '!=', $self->id))
                ->selectRaw('kind, count(*) as total')
                ->groupBy('kind')
                ->pluck('total', 'kind')
                ->map(fn ($n) => (int) $n)
            : collect();
        $myPending = $self ? $this->requestFeed->query($entityId)->where('employee_id', $self->id)->where('status', 'pending')->count() : 0;

        $leaveTypes = LeaveType::query()->where('is_active', true)->orderBy('sort_order')->get();

        return Inertia::render('employee-management/requests/page', [
            'perspective' => $perspective,
            'views' => $views,
            'view' => $view,
            'filters' => [
                'kind' => $kind,
                'status' => $view === 'inbox' ? 'pending' : $status,
                'employee_id' => $employeeId,
                'year' => $year,
                'q' => $search,
                'sort' => $sort,
                'dir' => $dir,
                'per_page' => $perPage,
            ],
            'feed' => $feed,
            'statusCounts' => $statusCounts ? collect(self::STATUSES)->mapWithKeys(fn ($s) => [$s => (int) ($statusCounts[$s] ?? 0)]) : null,
            'badges' => [
                'mine' => $myPending,
                'inbox' => (int) $inboxByKind->sum(),
                'inboxByKind' => $inboxByKind,
                'corrections' => $perspective['canApproveAttendance']
                    ? AttendanceRequest::query()->where('entity_id', $entityId)->where('request_type', AttendanceRequest::TYPE_CORRECTION)->where('status', 'pending')
                        ->when($self, fn ($q) => $q->where('employee_id', '!=', $self->id))->count()
                    : 0,
            ],
            'self' => $self ? [
                ...$self->only(['id', 'employee_code', 'firstname', 'lastname', 'name', 'avatar_url', 'position', 'gender', 'leave_type_ids']),
                'balances' => $this->leaveService->balanceSummary($self, $year, $leaveTypes),
                'upcoming' => $this->outOfOffice($entityId, $today, $today->copy()->addDays(60), $self->id)->take(5)->values(),
            ] : null,
            'team' => $perspective['canViewTeam'] ? [
                'out' => $this->outOfOffice($entityId, $today, $today->copy()->addDays(13)),
                'stats' => $this->teamStats($entityId, $today, $approvable, $self),
            ] : null,
            'teamBalances' => $view === 'balances' ? $this->teamBalances($entityId, $year, $leaveTypes) : null,
            'employees' => $perspective['canViewTeam'] || $perspective['canFileOnBehalf']
                ? Employee::query()
                    ->where('entity_id', $entityId)
                    ->where('is_active', true)
                    ->orderBy('lastname')
                    ->get(['id', 'employee_code', 'firstname', 'middlename', 'lastname', 'avatar', 'position', 'gender', 'leave_type_ids'])
                : [],
            'leaveTypes' => $leaveTypes->map(fn (LeaveType $t) => $t->only([
                'id', 'code', 'name', 'legal_basis', 'is_paid', 'balance_tracked', 'annual_entitlement', 'max_days_per_filing',
                'counts_calendar_days', 'gender', 'min_service_months', 'min_notice_days', 'attachment_required_after_days', 'allow_half_day',
            ])),
            'today' => $today->toDateString(),
        ]);
    }

    /**
     * File any request. `kind` picks the request; HR may file on behalf of an employee.
     */
    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $self = $this->employeeResolver->forUser($user, $entityId);
        $perspective = $this->perspective($user, $self);

        $kind = $request->validate(
            ['kind' => ['required', Rule::in(['leave', ...AttendanceRequest::FILEABLE_TYPES])]],
            ['kind.in' => match ($request->input('kind')) {
                AttendanceRequest::TYPE_UNDERTIME => 'Undertime no longer needs a request: leaving before your shift ends is deducted automatically.',
                AttendanceRequest::TYPE_SCHEDULE_CHANGE => 'Schedule changes are no longer requested. Ask HR to update your shift or rest days.',
                default => 'Choose a valid request type.',
            }],
        )['kind'];
        $isLeave = $kind === 'leave';

        if (! ($isLeave ? $perspective['canFileLeave'] : $perspective['canFileAttendance'])) {
            abort(403);
        }

        $onBehalf = $isLeave ? $perspective['canApproveLeave'] : $perspective['canApproveAttendance'];
        $employee = $onBehalf && $request->filled('employee_id')
            ? Employee::query()->where('entity_id', $entityId)->findOrFail($request->integer('employee_id'))
            : $self;

        if (! $employee) {
            throw ValidationException::withMessages(['employee_id' => 'No active employee profile is linked to your account.']);
        }

        if ($isLeave) {
            $validated = $request->validate($this->leaveService->rules());
            $leaveType = $this->leaveService->resolveLeaveType($validated['leave_type_id'] ?? null, $validated['leave_type'] ?? null);
            $this->leaveService->file($employee, $leaveType, [
                'start_date' => $validated['start_date'],
                'end_date' => $validated['end_date'],
                'half_day' => $validated['half_day'] ?? null,
                'reason' => $validated['reason'],
                'attachment_path' => $request->file('attachment')?->store('leave-attachments', PrivateFiles::DISK),
            ], $user);
            $label = $leaveType->name;
        } else {
            $request->merge(['request_type' => $kind]);
            $validated = $request->validate($this->attendanceRequests->rules(), $this->attendanceRequests->messages());
            $this->attendanceRequests->file($employee, $validated, $user);
            $label = AttendanceRequest::LABELS[$kind];
        }

        $who = $employee->id === $self?->id ? '' : " for {$employee->name}";

        return redirect()->back()->with('status', "{$label} request filed{$who}. It is now waiting for approval.");
    }

    public function reviewLeave(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($leaveRequest->entity_id, $entityContext);
        if (! $this->employeeResolver->isHr($request->user(), 'leave.approve')) {
            abort(403);
        }

        $validated = $this->validateDecision($request);
        if ($validated['decision'] === 'approved') {
            $this->leaveService->approve($leaveRequest, $request->user());
        } else {
            $this->leaveService->decline($leaveRequest, $request->user(), $validated['remarks']);
        }

        return redirect()->back()->with('status', "Leave {$validated['decision']} for {$leaveRequest->employee?->name}.");
    }

    public function reviewAttendance(Request $request, AttendanceRequest $attendanceRequest, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($attendanceRequest->entity_id, $entityContext);
        if (! $this->employeeResolver->isHr($request->user(), 'attendance.manage')) {
            abort(403);
        }

        $validated = $this->validateDecision($request);
        $status = $validated['decision'] === 'approved' ? 'approved' : 'rejected';
        $this->attendanceRequests->review($attendanceRequest, $request->user(), $status, $validated['remarks'] ?? null);

        return redirect()->back()->with('status', "{$attendanceRequest->label()} {$validated['decision']} for {$attendanceRequest->employee?->name}.");
    }

    public function cancelLeave(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($leaveRequest->entity_id, $entityContext);
        $this->assertOwnerOr($request->user(), $leaveRequest->employee_id, $entityContext, 'leave.approve');

        // Once approved leave has begun, only HR can withdraw it (the days may already be paid).
        if ($leaveRequest->status === LeaveRequest::STATUS_APPROVED
            && $leaveRequest->start_date->lte(Carbon::today())
            && ! $this->employeeResolver->isHr($request->user(), 'leave.approve')) {
            throw ValidationException::withMessages(['status' => 'This leave has already started. Ask HR to cancel it.']);
        }

        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:255']])['reason'] ?? null;
        $this->leaveService->cancel($leaveRequest, $request->user(), $reason ?: 'Withdrawn by the employee.');

        return redirect()->back()->with('status', 'Leave request cancelled and credits restored.');
    }

    /**
     * The supporting document of a leave request, for the employee who filed it and leave approvers.
     */
    public function leaveAttachment(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): StreamedResponse
    {
        $this->assertEntity($leaveRequest->entity_id, $entityContext);
        $this->assertOwnerOr($request->user(), $leaveRequest->employee_id, $entityContext, 'leave.approve');
        abort_unless($leaveRequest->attachment_path, 404);

        return PrivateFiles::response($leaveRequest->attachment_path);
    }

    public function cancelAttendance(Request $request, AttendanceRequest $attendanceRequest, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($attendanceRequest->entity_id, $entityContext);
        $this->assertOwnerOr($request->user(), $attendanceRequest->employee_id, $entityContext, 'attendance.manage');

        $this->attendanceRequests->cancel($attendanceRequest);

        return redirect()->back()->with('status', "{$attendanceRequest->label()} request cancelled.");
    }

    // -----------------------------------------------------------------------------------------

    /**
     * @return array<string, bool>
     */
    private function perspective(?User $user, ?Employee $self): array
    {
        $canApproveLeave = $this->employeeResolver->isHr($user, 'leave.approve');
        $canApproveAttendance = $this->employeeResolver->isHr($user, 'attendance.manage');
        $canReview = $canApproveLeave || $canApproveAttendance;

        return [
            'hasSelf' => (bool) $self,
            'canApproveLeave' => $canApproveLeave,
            'canApproveAttendance' => $canApproveAttendance,
            'canReview' => $canReview,
            'canViewTeam' => $canReview || ! $self,
            'canFileLeave' => (bool) $user?->canAny(['leave.file', 'payroll.manage']),
            'canFileAttendance' => (bool) $user?->canAny(['attendance.view', 'attendance.punch', 'attendance.manage', 'payroll.view', 'payroll.manage']),
            'canFileOnBehalf' => $canReview,
        ];
    }

    /**
     * @return array<int, string>
     */
    private function approvableKinds(array $perspective): array
    {
        return array_values(array_merge(
            $perspective['canApproveLeave'] ? ['leave'] : [],
            $perspective['canApproveAttendance'] ? AttendanceRequest::TYPES : [],
        ));
    }

    /**
     * Approved leave and official business overlapping a window — "who's out".
     */
    private function outOfOffice(?int $entityId, Carbon $from, Carbon $to, ?int $employeeId = null): Collection
    {
        $leaves = LeaveRequest::query()
            ->with([EmployeeRequestFeed::EMPLOYEE_COLUMNS, 'type:id,code,name'])
            ->where('entity_id', $entityId)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereDate('start_date', '<=', $to)
            ->whereDate('end_date', '>=', $from)
            ->when($employeeId, fn ($q) => $q->where('employee_id', $employeeId))
            ->get()
            ->map(fn (LeaveRequest $l) => [
                'key' => "leave-{$l->id}",
                'kind' => 'leave',
                'title' => $l->type?->name ?? 'Leave',
                'employee' => $l->employee,
                'date_from' => $l->start_date->toDateString(),
                'date_to' => $l->end_date->toDateString(),
                'days' => (float) $l->days_count,
                'half_day' => $l->half_day,
            ]);

        $business = AttendanceRequest::query()
            ->with(EmployeeRequestFeed::EMPLOYEE_COLUMNS)
            ->where('entity_id', $entityId)
            ->where('request_type', AttendanceRequest::TYPE_OFFICIAL_BUSINESS)
            ->where('status', 'approved')
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->when($employeeId, fn ($q) => $q->where('employee_id', $employeeId))
            ->get()
            ->map(fn (AttendanceRequest $a) => [
                'key' => "attendance-{$a->id}",
                'kind' => $a->request_type,
                'title' => $a->destination ? "Official business · {$a->destination}" : 'Official business',
                'employee' => $a->employee,
                'date_from' => $a->work_date->toDateString(),
                'date_to' => $a->work_date->toDateString(),
                'time_from' => $a->requested_time_in,
                'time_to' => $a->requested_time_out,
            ]);

        return $leaves->concat($business)->sortBy('date_from')->values();
    }

    private function teamStats(?int $entityId, Carbon $today, array $approvable, ?Employee $self): array
    {
        $oldest = $approvable
            ? $this->requestFeed->query($entityId)->where('status', 'pending')->whereIn('kind', $approvable)
                ->when($self, fn ($q) => $q->where('employee_id', '!=', $self->id))
                ->min('created_at')
            : null;

        $month = [$today->copy()->startOfMonth(), $today->copy()->endOfMonth()];
        $decidedThisMonth = LeaveRequest::query()->where('entity_id', $entityId)->whereIn('status', ['approved', 'declined'])->whereBetween('approved_at', $month)->count()
            + AttendanceRequest::query()->where('entity_id', $entityId)->whereIn('status', ['approved', 'rejected'])->whereBetween('reviewed_at', $month)->count();

        $leaveDaysThisMonth = (float) LeaveRequest::query()
            ->where('entity_id', $entityId)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereBetween('start_date', [$month[0]->toDateString(), $month[1]->toDateString()])
            ->sum('days_count');

        return [
            'oldestPendingDays' => $oldest ? (int) Carbon::parse($oldest)->startOfDay()->diffInDays($today) : null,
            'decidedThisMonth' => $decidedThisMonth,
            'leaveDaysThisMonth' => $leaveDaysThisMonth,
        ];
    }

    private function teamBalances(?int $entityId, int $year, Collection $leaveTypes): array
    {
        $employees = Employee::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->orderBy('lastname')
            ->get();

        $balances = LeaveBalance::query()
            ->where('entity_id', $entityId)
            ->where('year', $year)
            ->get()
            ->groupBy('employee_id');

        return $employees->map(fn (Employee $e) => [
            'employee' => $e->only(['id', 'employee_code', 'firstname', 'lastname', 'name', 'avatar_url', 'position']),
            'balances' => collect($this->leaveService->balanceSummary($e, $year, $leaveTypes, ($balances->get($e->id) ?? collect())->keyBy('leave_type_id')))
                ->keyBy('code'),
        ])->all();
    }

    private function validateDecision(Request $request): array
    {
        return $request->validate([
            'decision' => ['required', 'in:approved,declined'],
            'remarks' => ['nullable', 'required_if:decision,declined', 'string', 'max:255'],
        ], [
            'remarks.required_if' => 'Tell the employee why the request was declined.',
        ]);
    }

    private function assertEntity(?int $entityId, EntityContext $entityContext): void
    {
        if ((int) $entityId !== (int) $entityContext->id()) {
            abort(404);
        }
    }

    private function assertOwnerOr(User $user, int $employeeId, EntityContext $entityContext, string $ability): void
    {
        if ($this->employeeResolver->isHr($user, $ability)) {
            return;
        }

        if ($this->employeeResolver->forUser($user, $entityContext->id())?->id !== $employeeId) {
            abort(403);
        }
    }
}
