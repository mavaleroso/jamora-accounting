<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveType;
use App\Models\ShiftTemplate;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class EmployeesController extends Controller
{
    private const AVATAR_DIR = 'employee-avatars';

    private const STATUSES = ['active', 'inactive', 'separated'];

    private const EMPLOYMENT_TYPES = ['probationary', 'regular', 'contractual', 'project', 'seasonal'];

    private const SORTABLE = [
        'code' => 'employee_code',
        'name' => 'lastname',
        'hire_date' => 'hire_date',
        'basic_pay' => 'basic_pay',
    ];

    public function index(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->query('per_page', 10)));
        $page = max(1, (int) $request->query('page', 1));
        $search = trim((string) $request->query('search', ''));
        $status = in_array($request->query('status'), self::STATUSES, true) ? $request->query('status') : '';
        $type = in_array($request->query('type'), self::EMPLOYMENT_TYPES, true) ? $request->query('type') : '';
        $department = trim((string) $request->query('department', ''));
        $sort = array_key_exists((string) $request->query('sort'), self::SORTABLE) ? (string) $request->query('sort') : 'code';
        $direction = $request->query('direction') === 'desc' ? 'desc' : 'asc';

        $query = Employee::query()
            ->with('defaultShiftTemplate:id,code,name,start_time,end_time,color')
            ->orderBy(self::SORTABLE[$sort], $direction)
            ->orderBy('employee_code');

        if ($sort === 'name') {
            $query->orderBy('firstname', $direction);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('employee_code', 'like', "%{$search}%")
                    ->orWhere('firstname', 'like', "%{$search}%")
                    ->orWhere('lastname', 'like', "%{$search}%")
                    ->orWhere('position', 'like', "%{$search}%")
                    ->orWhere('biometric_id', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($status !== '') {
            $query->where('employment_status', $status);
        }

        if ($type !== '') {
            $query->where('employment_type', $type);
        }

        if ($department !== '') {
            $query->where('department', $department);
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('libraries/employees/page', [
            'employees' => $paginator->items(),
            'totalEmployees' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
            'filters' => [
                'status' => $status,
                'type' => $type,
                'department' => $department,
                'sort' => $sort,
                'direction' => $direction,
            ],
            'stats' => $this->stats(),
            'departments' => Employee::query()->whereNotNull('department')->distinct()->orderBy('department')->pluck('department'),
            'positions' => Employee::query()->whereNotNull('position')->distinct()->orderBy('position')->pluck('position'),
            'shiftTemplates' => ShiftTemplate::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'start_time', 'end_time', 'break_minutes', 'color']),
            'leaveTypes' => LeaveType::query()
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get(['id', 'code', 'name', 'legal_basis', 'is_paid', 'gender']),
            'policy' => [
                'daysPerYear' => (int) config('people.timekeeping.days_per_year', 313),
                'hoursPerDay' => (int) config('people.timekeeping.regular_hours_per_day', 8),
                'defaultRestDays' => array_map('intval', config('people.default_rest_days', [0])),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        if ($request->hasFile('avatar')) {
            $data['avatar'] = $request->file('avatar')->store(self::AVATAR_DIR, 'public');
        }

        Employee::query()->create($data);

        return redirect()->back()->with('status', 'Employee created successfully.');
    }

    public function update(Request $request, Employee $employee): RedirectResponse
    {
        $data = $this->validated($request, $employee);
        $oldAvatar = $employee->avatar;

        if ($request->hasFile('avatar')) {
            $data['avatar'] = $request->file('avatar')->store(self::AVATAR_DIR, 'public');
        } elseif ($request->boolean('remove_avatar')) {
            $data['avatar'] = null;
        }

        $employee->update($data);

        if (array_key_exists('avatar', $data) && $oldAvatar && $oldAvatar !== $employee->avatar && ! str_starts_with($oldAvatar, 'http')) {
            Storage::disk('public')->delete($oldAvatar);
        }

        return redirect()->back()->with('status', 'Employee updated successfully.');
    }

    public function destroy(Employee $employee): RedirectResponse
    {
        $employee->delete();

        return redirect()->back()->with('status', 'Employee deleted successfully.');
    }

    /**
     * Directory-wide counters (not limited to the current page or filters).
     *
     * @return array<string, int>
     */
    private function stats(): array
    {
        $base = Employee::query();
        $missingStatutory = function ($q) {
            foreach (['sss_number', 'philhealth_number', 'pagibig_number', 'tin'] as $column) {
                $q->orWhereNull($column)->orWhere($column, '');
            }
        };

        return [
            'total' => (clone $base)->count(),
            'active' => (clone $base)->where('employment_status', 'active')->count(),
            'probationary' => (clone $base)->where('employment_status', 'active')->where('employment_type', 'probationary')->count(),
            'separated' => (clone $base)->where('employment_status', 'separated')->count(),
            'unmapped_biometric' => (clone $base)->where('employment_status', 'active')
                ->where(fn ($q) => $q->whereNull('biometric_id')->orWhere('biometric_id', ''))
                ->count(),
            'incomplete_statutory' => (clone $base)->where('employment_status', 'active')->where($missingStatutory)->count(),
            'incomplete_records' => (clone $base)->where('employment_status', 'active')
                ->where(function ($q) use ($missingStatutory) {
                    $q->where($missingStatutory)->orWhereNull('biometric_id')->orWhere('biometric_id', '');
                })
                ->count(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Employee $employee = null): array
    {
        $entityId = app(EntityContext::class)->id();
        $afterHire = $request->filled('hire_date') ? ['after_or_equal:hire_date'] : [];

        $data = $request->validate([
            'employee_code' => ['required', 'string', 'max:50', Rule::unique('employees', 'employee_code')->where('entity_id', $entityId)->ignore($employee?->id)],
            'firstname' => ['required', 'string', 'max:100'],
            'middlename' => ['nullable', 'string', 'max:100'],
            'lastname' => ['required', 'string', 'max:100'],
            'gender' => ['nullable', 'string', 'in:male,female'],
            'civil_status' => ['nullable', 'string', 'in:single,married,widowed,separated,solo_parent'],
            'position' => ['nullable', 'string', 'max:100'],
            'department' => ['nullable', 'string', 'max:100'],
            'biometric_id' => ['nullable', 'string', 'max:50', Rule::unique('employees', 'biometric_id')->where('entity_id', $entityId)->whereNull('deleted_at')->ignore($employee?->id)],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:50'],
            'hire_date' => ['nullable', 'date'],
            'regularization_date' => ['nullable', 'date', ...$afterHire],
            'separation_date' => ['nullable', 'required_if:employment_status,separated', 'date', ...$afterHire],
            'employment_status' => ['required', 'string', Rule::in(self::STATUSES)],
            'employment_type' => ['required', 'string', Rule::in(self::EMPLOYMENT_TYPES)],
            'default_shift_template_id' => ['nullable', 'integer', Rule::exists('shift_templates', 'id')->where(fn ($q) => $q->where('entity_id', $entityId)->orWhereNull('entity_id'))],
            'rest_days' => ['nullable', 'array'],
            'rest_days.*' => ['integer', 'between:0,6'],
            'leave_type_scope' => ['nullable', 'in:all,custom'],
            'leave_type_ids' => ['nullable', 'array'],
            'leave_type_ids.*' => ['integer', 'exists:leave_types,id'],
            'pay_type' => ['required', 'string', 'in:monthly,daily,hourly'],
            'basic_pay' => ['required', 'numeric', 'min:0'],
            'vacation_leave_credits' => ['nullable', 'numeric', 'min:0'],
            'sick_leave_credits' => ['nullable', 'numeric', 'min:0'],
            'sss_number' => ['nullable', 'string', 'max:50'],
            'philhealth_number' => ['nullable', 'string', 'max:50'],
            'pagibig_number' => ['nullable', 'string', 'max:50'],
            'tin' => ['nullable', 'string', 'max:50'],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'bank_account_no' => ['nullable', 'string', 'max:50'],
            'is_active' => ['boolean'],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'remove_avatar' => ['nullable', 'boolean'],
        ], [
            'avatar.max' => 'The photo must not be larger than 2 MB.',
            'avatar.mimes' => 'The photo must be a JPG, PNG or WebP image.',
            'separation_date.required_if' => 'A separation date is required for separated employees.',
            'regularization_date.after_or_equal' => 'Regularization date cannot be earlier than the hire date.',
            'separation_date.after_or_equal' => 'Separation date cannot be earlier than the hire date.',
            'biometric_id.unique' => 'This biometric ID is already mapped to another employee.',
        ]);

        // Empty selection means "use the company default rest days".
        $restDays = array_values(array_unique(array_map('intval', $data['rest_days'] ?? [])));
        sort($restDays);
        $data['rest_days'] = $restDays !== [] ? $restDays : null;

        // "All" is stored as NULL so leave types added later are enabled automatically.
        $data['leave_type_ids'] = ($data['leave_type_scope'] ?? 'all') === 'custom'
            ? array_values(array_unique(array_map('intval', $data['leave_type_ids'] ?? [])))
            : null;
        unset($data['leave_type_scope']);

        // The file itself is stored by the caller.
        unset($data['avatar'], $data['remove_avatar']);

        $data['vacation_leave_credits'] = $data['vacation_leave_credits'] ?? 0;
        $data['sick_leave_credits'] = $data['sick_leave_credits'] ?? 0;

        // Separated staff can never be scheduled or paid; clear stale separation dates otherwise.
        if ($data['employment_status'] === 'separated') {
            $data['is_active'] = false;
        } else {
            $data['separation_date'] = null;
            $data['is_active'] = (bool) ($data['is_active'] ?? true);
        }

        return $data;
    }
}
