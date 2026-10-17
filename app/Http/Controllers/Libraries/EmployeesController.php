<?php

namespace App\Http\Controllers\Libraries;

use App\Enums\RoleEnum;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveType;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Services\People\BenefitReview;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Role;

/**
 * Employee Directory. Every employee has a login so they can use the self-service portal: creating an
 * employee also creates their user account (Employee role, this branch) or links an existing user.
 */
class EmployeesController extends Controller
{
    private const AVATAR_DIR = 'employee-avatars';

    private const STATUSES = ['active', 'inactive', 'separated'];

    private const EMPLOYMENT_TYPES = ['probationary', 'regular', 'contractual', 'project', 'seasonal'];

    /** Login fields posted with the employee: none (edit only), a new account, or an existing user. */
    private const ACCOUNT_FIELDS = ['account', 'username', 'password', 'link_user_id'];

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
            ->with(['defaultShiftTemplate:id,code,name,start_time,end_time,color', 'user:id,username,email,status', 'user.roles:id,name'])
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
            'linkableUsers' => $this->linkableUsers(),
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
                // Contribution tables, for the form's estimate of automatic SSS / PhilHealth / Pag-IBIG.
                'statutory' => config('people.statutory'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $account = Arr::only($data, self::ACCOUNT_FIELDS);
        $data = Arr::except($data, self::ACCOUNT_FIELDS);

        if ($request->hasFile('avatar')) {
            $data['avatar'] = $request->file('avatar')->store(self::AVATAR_DIR, 'public');
        }

        $user = DB::transaction(function () use ($data, $account) {
            $user = $this->provisionLogin($account, $data);
            Employee::query()->create([...$data, 'user_id' => $user?->id]);

            return $user;
        });

        return redirect()->back()->with('status', $account['account'] === 'new'
            ? "Employee created. They can sign in as {$user?->username}."
            : "Employee created and linked to the login of {$user?->name}.");
    }

    public function update(Request $request, Employee $employee): RedirectResponse
    {
        $data = $this->validated($request, $employee);
        $account = Arr::only($data, self::ACCOUNT_FIELDS);
        $data = Arr::except($data, self::ACCOUNT_FIELDS);
        $oldAvatar = $employee->avatar;

        if ($request->hasFile('avatar')) {
            $data['avatar'] = $request->file('avatar')->store(self::AVATAR_DIR, 'public');
        } elseif ($request->boolean('remove_avatar')) {
            $data['avatar'] = null;
        }

        $oldMonthly = $employee->monthlyRate();
        DB::transaction(function () use ($employee, $data, $account) {
            // Records created before logins were required can get one here.
            $user = $employee->user_id ? null : $this->provisionLogin($account, $data);
            $employee->update($user ? [...$data, 'user_id' => $user->id] : $data);
        });

        // Benefit shares stay fixed; a pay change only flags the ones worked out from salary for review.
        $toReview = $employee->wasChanged(['basic_pay', 'pay_type'])
            ? app(BenefitReview::class)->afterSalaryChange($employee, $oldMonthly)
            : 0;

        if (array_key_exists('avatar', $data) && $oldAvatar && $oldAvatar !== $employee->avatar && ! str_starts_with($oldAvatar, 'http')) {
            Storage::disk('public')->delete($oldAvatar);
        }

        return redirect()->back()->with('status', $toReview > 0
            ? "Employee updated. Salary changed: {$toReview} benefit ".str('share')->plural($toReview).' based on salary need review in Benefits Administration.'
            : 'Employee updated successfully.');
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
     * Users who can be linked to a new employee: not already an employee in this branch.
     *
     * @return list<array{id: int, name: string, username: ?string, email: ?string, role: ?string}>
     */
    private function linkableUsers(): array
    {
        return User::query()
            ->with('roles:id,name')
            ->whereNotIn('id', Employee::query()->whereNotNull('user_id')->select('user_id'))
            ->orderBy('firstname')
            ->orderBy('lastname')
            ->get(['id', 'username', 'email', 'firstname', 'lastname'])
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'username' => $u->username, 'email' => $u->email, 'role' => $u->roles->first()?->name])
            ->all();
    }

    /**
     * Create the employee's login (Employee role) or take the existing user to link, and give it
     * access to this branch. Returns null when no login was asked for (editing an older record).
     *
     * @param  array<string, mixed>  $account
     * @param  array<string, mixed>  $employee
     */
    private function provisionLogin(array $account, array $employee): ?User
    {
        $user = match ($account['account'] ?? 'none') {
            'new' => User::query()->create([
                'username' => $account['username'],
                'password' => $account['password'], // hashed by the model cast
                'email' => $employee['email'] ?? null,
                'firstname' => $employee['firstname'],
                'middlename' => $employee['middlename'] ?? null,
                'lastname' => $employee['lastname'],
                'position' => $employee['position'] ?? null,
                'contact_number' => $employee['phone'] ?? null,
                'sex' => $employee['gender'] ?? null,
                'date_started' => $employee['hire_date'] ?? null,
                'status' => ($employee['employment_status'] ?? 'active') !== 'separated',
            ]),
            'existing' => User::query()->findOrFail($account['link_user_id']),
            default => null,
        };

        if (! $user) {
            return null;
        }

        // Only a new login gets a role; a linked user keeps theirs (e.g. the Accountant).
        if (($account['account'] ?? null) === 'new') {
            $user->assignRole(Role::findOrCreate(RoleEnum::Employee->value, 'web'));
        }

        $entityId = app(EntityContext::class)->id();
        if ($entityId && ! $user->entities()->where('entities.id', $entityId)->exists()) {
            $user->entities()->attach($entityId, ['is_default' => ! $user->entities()->exists()]);
        }

        return $user;
    }

    /**
     * Login rules: required when creating, optional when editing a record without one, and not
     * offered once the employee is linked.
     *
     * @return array<string, mixed>
     */
    private function accountRules(?Employee $employee, ?int $entityId): array
    {
        if ($employee?->user_id) {
            return [];
        }

        return [
            'account' => [$employee ? 'nullable' : 'required', Rule::in($employee ? ['none', 'new', 'existing'] : ['new', 'existing'])],
            'username' => ['exclude_unless:account,new', 'required', 'string', 'min:3', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('users', 'username')],
            'password' => ['exclude_unless:account,new', 'required', 'string', 'max:100', Password::defaults()],
            'link_user_id' => [
                'exclude_unless:account,existing', 'required', 'integer', Rule::exists('users', 'id'),
                Rule::unique('employees', 'user_id')->where('entity_id', $entityId)->whereNull('deleted_at'),
            ],
        ];
    }

    /**
     * SSS, PhilHealth and Pag-IBIG: deducted (always computed from the table) or not deducted.
     *
     * @return array<string, mixed>
     */
    private function contributionRules(): array
    {
        $rules = ['contribution_settings' => ['nullable', 'array:'.implode(',', Employee::CONTRIBUTIONS)]];
        foreach (Employee::CONTRIBUTIONS as $agency) {
            $key = "contribution_settings.{$agency}";
            $rules["{$key}.mode"] = ['nullable', Rule::in(Employee::CONTRIBUTION_MODES)];
        }

        return $rules;
    }

    /**
     * Keep only the contributions not deducted; all deducted is stored as NULL.
     *
     * @param  array<string, array<string, mixed>>  $input
     * @return array<string, array<string, mixed>>|null
     */
    private function contributionSettings(array $input): ?array
    {
        $settings = [];
        foreach (Employee::CONTRIBUTIONS as $agency) {
            $row = $input[$agency] ?? [];
            $settings[$agency] = ($row['mode'] ?? 'auto') === 'none' ? ['mode' => 'none'] : null;
        }
        $settings = array_filter($settings);

        return $settings === [] ? null : $settings;
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Employee $employee = null): array
    {
        $entityId = app(EntityContext::class)->id();
        $afterHire = $request->filled('hire_date') ? ['after_or_equal:hire_date'] : [];
        // A new login takes the employee's email, which must not already belong to another user.
        $newLogin = ! $employee?->user_id && $request->input('account') === 'new';

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
            'email' => ['nullable', 'email', 'max:150', ...($newLogin ? [Rule::unique('users', 'email')] : [])],
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
            ...$this->accountRules($employee, $entityId),
            ...$this->contributionRules(),
        ], [
            'avatar.max' => 'The photo must not be larger than 2 MB.',
            'avatar.mimes' => 'The photo must be a JPG, PNG or WebP image.',
            'separation_date.required_if' => 'A separation date is required for separated employees.',
            'regularization_date.after_or_equal' => 'Regularization date cannot be earlier than the hire date.',
            'separation_date.after_or_equal' => 'Separation date cannot be earlier than the hire date.',
            'biometric_id.unique' => 'This biometric ID is already mapped to another employee.',
            'account.required' => 'Every employee needs a login: create one or link an existing user.',
            'username.unique' => 'This username is already taken.',
            'username.regex' => 'Use letters, numbers, dots, dashes and underscores only — no spaces.',
            'email.unique' => 'This email already belongs to a user account. Link that account instead.',
            'link_user_id.required' => 'Choose the user to link.',
            'link_user_id.unique' => 'This user is already linked to another employee in this branch.',
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

        if ($request->has('contribution_settings')) {
            $data['contribution_settings'] = $this->contributionSettings($data['contribution_settings'] ?? []);
        }

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
