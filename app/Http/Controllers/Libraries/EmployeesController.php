<?php

namespace App\Http\Controllers\Libraries;

use App\Enums\RoleEnum;
use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveType;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Services\People\BenefitReview;
use App\Services\People\WorkSchedule;
use App\Support\EntityContext;
use App\Support\MissingValue;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Role;

/**
 * Employee Directory: the employees of every company (branch) the user can open, in one list. Every employee has a
 * login so they can use the self-service portal: creating an employee also creates their user account (Employee
 * role, the employee's company) or links an existing user. An employee is created in the company picked in the
 * form and stays there; each record is validated and saved within its own company.
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
        'company' => 'entity_id',
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
        $sort = array_key_exists((string) $request->query('sort'), self::SORTABLE) ? (string) $request->query('sort') : 'code';
        $direction = $request->query('direction') === 'desc' ? 'desc' : 'asc';
        $companies = $this->companies($request);
        $company = $companies->contains('id', (int) $request->query('company')) ? (int) $request->query('company') : null;

        $query = $this->directory($request)
            ->with([
                'entity:id,code,name',
                // Shift templates belong to a company, which need not be the current one.
                'defaultShiftTemplate' => fn ($q) => $q->withoutGlobalScope('entity')->select(['id', 'code', 'name', 'start_time', 'end_time', 'break_minutes', 'color']),
                'user:id,username,email,status',
                'user.roles:id,name',
                'chargeBankAccount' => fn ($q) => $q->withoutGlobalScope('entity')->select(['id', 'entity_id', 'name', 'bank_name', 'account_number']),
            ])
            ->orderBy($sort === 'company' ? Entity::query()->select('name')->whereColumn('entities.id', 'employees.entity_id') : self::SORTABLE[$sort], $direction);

        if ($sort === 'name') {
            $query->orderBy('firstname', $direction);
        }
        $query->orderBy('employee_code');

        if ($company !== null) {
            $query->where('employees.entity_id', $company);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('employee_code', 'like', "%{$search}%")
                    ->orWhere('firstname', 'like', "%{$search}%")
                    ->orWhere('lastname', 'like', "%{$search}%")
                    ->orWhere('position', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($status !== '') {
            $query->where('employment_status', $status);
        }

        if ($type !== '') {
            $query->where('employment_type', $type);
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('libraries/employees/page', [
            'employees' => $paginator->items(),
            'totalEmployees' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
            'filters' => [
                'company' => $company !== null ? (string) $company : '',
                'status' => $status,
                'type' => $type,
                'sort' => $sort,
                'direction' => $direction,
            ],
            'stats' => $this->stats($this->directory($request)),
            'companies' => $companies,
            // Where a new employee goes unless another company is picked.
            'currentCompanyId' => app(EntityContext::class)->id(),
            'linkableUsers' => $this->linkableUsers($companies->pluck('id')->all()),
            'positions' => $this->directory($request)->whereNotNull('position')->whereNotIn('position', ['', MissingValue::MARK])->distinct()->orderBy('position')->pluck('position'),
            // Each company's active bank accounts, held or shared (a shared one is listed under each of its companies):
            // the form presets the one an employee's pay is released from.
            'bankAccounts' => BankAccount::query()
                ->withoutGlobalScope('entity')
                ->join('bank_account_entity as share', 'share.bank_account_id', '=', 'bank_accounts.id')
                ->whereIn('share.entity_id', $companies->pluck('id'))
                ->where('bank_accounts.is_active', true)
                ->orderBy('bank_accounts.name')
                ->get(['bank_accounts.id', 'share.entity_id', 'bank_accounts.name', 'bank_accounts.bank_name', 'bank_accounts.account_number']),
            // Co-workers' preset breaks, so the form can show who else is on break at a given time.
            'breakSlots' => $this->breakSlots($request),
            'leaveTypes' => LeaveType::query()
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get(['id', 'code', 'name', 'legal_basis', 'is_paid', 'gender']),
            'policy' => [
                'daysPerYear' => (int) config('people.timekeeping.days_per_year', 313),
                'hoursPerDay' => (int) config('people.timekeeping.regular_hours_per_day', 8),
                'defaultRestDays' => array_map('intval', config('people.default_rest_days', [0])),
                // The shift every employee works: the company default in its shift library (Libraries › Shifts). The
                // current company's, and each company's for the form, which may add an employee to another.
                'defaultShift' => $this->companyShift(app(EntityContext::class)->id()),
                'defaultShifts' => $companies->mapWithKeys(fn (array $c) => [$c['id'] => $this->companyShift($c['id'])]),
                'presetBreakMinutes' => WorkSchedule::presetBreakMinutes(),
                // Contribution tables, for the form's estimate of automatic SSS / PhilHealth / Pag-IBIG.
                'statutory' => config('people.statutory'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $company = $this->companyFor($request);

        // Validation, the record and the login's access all belong to the chosen company.
        return app(EntityContext::class)->runAs($company, fn () => $this->createEmployee($request, $company));
    }

    public function update(Request $request, int $id): RedirectResponse
    {
        $employee = $this->find($request, $id);

        return app(EntityContext::class)->runAs($employee->entity, fn () => $this->updateEmployee($request, $employee));
    }

    public function destroy(Request $request, int $id): RedirectResponse
    {
        $this->find($request, $id)->delete();

        return redirect()->back()->with('status', 'Employee deleted successfully.');
    }

    private function createEmployee(Request $request, Entity $company): RedirectResponse
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
            ? "Employee created in {$company->name}. They can sign in as {$user?->username}."
            : "Employee created in {$company->name} and linked to the login of {$user?->name}.");
    }

    private function updateEmployee(Request $request, Employee $employee): RedirectResponse
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

    /**
     * Companies (branches) in the user's directory: it lists their employees, and a new employee may join any of them.
     *
     * @return Collection<int, array{id: int, code: string, name: string}>
     */
    private function companies(Request $request): Collection
    {
        return $request->user()->directoryEntities()->orderBy('entities.name')->get()
            ->map(fn (Entity $e) => ['id' => $e->id, 'code' => $e->code, 'name' => $e->name])
            ->values();
    }

    /**
     * @return Builder<Employee>
     */
    private function directory(Request $request): Builder
    {
        return Employee::query()->visibleTo($request->user());
    }

    /**
     * An employee of any company in the user's directory.
     */
    private function find(Request $request, int $id): Employee
    {
        return $this->directory($request)->findOrFail($id);
    }

    /**
     * The company a new employee joins: the one picked in the form, else the current branch.
     */
    private function companyFor(Request $request): Entity
    {
        $id = $request->filled('entity_id') ? (int) $request->input('entity_id') : app(EntityContext::class)->id();
        $company = $id ? $request->user()->directoryEntities()->find($id) : null;

        if (! $company) {
            throw ValidationException::withMessages(['entity_id' => 'Choose a company you have access to.']);
        }

        return $company;
    }

    /**
     * The shift an employee normally works: their own shift, else their company's default shift.
     *
     * @return array{start: string, end: string, break_minutes: int}
     */
    private function regularShift(?ShiftTemplate $template, ?int $entityId): array
    {
        $default = ShiftTemplate::defaultShift($entityId);

        return $template
            ? ['start' => (string) $template->start_time, 'end' => (string) $template->end_time, 'break_minutes' => (int) $template->break_minutes]
            : ['start' => $default['start'], 'end' => $default['end'], 'break_minutes' => $default['break_minutes']];
    }

    /**
     * A company's default shift, as the form shows it.
     *
     * @return array{name: string, start: string, end: string, break_minutes: int}
     */
    private function companyShift(?int $entityId): array
    {
        return ['name' => ShiftTemplate::defaultShift($entityId)['name'], ...$this->regularShift(null, $entityId)];
    }

    /**
     * The window a preset break covers on a shift: always the preset length, and none when the shift has no break.
     *
     * @param  array{start: string, end: string, break_minutes: int}  $shift
     * @return array{0: string, 1: string}|null
     */
    private function presetWindow(?string $breakStart, array $shift): ?array
    {
        return $shift['break_minutes'] > 0
            ? WorkSchedule::fitBreak($breakStart, $shift['start'], $shift['end'], WorkSchedule::presetBreakMinutes())
            : null;
    }

    /**
     * Preset breaks of active employees and the window each covers on their regular shift. Co-workers may share one.
     *
     * @return list<array{id: int, entity_id: int, name: string, break_start: string, break_end: string}>
     */
    private function breakSlots(Request $request): array
    {
        return $this->directory($request)
            ->whereNotNull('break_start')
            ->where('employment_status', 'active')
            ->where('is_active', true)
            ->with(['defaultShiftTemplate' => fn ($q) => $q->withoutGlobalScope('entity')])
            ->get(['id', 'entity_id', 'firstname', 'middlename', 'lastname', 'break_start', 'default_shift_template_id'])
            ->map(function (Employee $e) {
                $window = $this->presetWindow($e->break_start, $this->regularShift($e->defaultShiftTemplate, $e->entity_id));

                return $window ? ['id' => $e->id, 'entity_id' => $e->entity_id, 'name' => $e->name, 'break_start' => $window[0], 'break_end' => $window[1]] : null;
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Directory-wide counters (not limited to the current page or filters).
     *
     * @param  Builder<Employee>  $base
     * @return array<string, int>
     */
    private function stats(Builder $base): array
    {
        $missingStatutory = function ($q) {
            foreach (['sss_number', 'philhealth_number', 'pagibig_number', 'tin'] as $column) {
                MissingValue::orWhereMissing($q, $column);
            }
        };

        return [
            'total' => (clone $base)->count(),
            'active' => (clone $base)->where('employment_status', 'active')->count(),
            'probationary' => (clone $base)->where('employment_status', 'active')->where('employment_type', 'probationary')->count(),
            'separated' => (clone $base)->where('employment_status', 'separated')->count(),
            'incomplete_statutory' => (clone $base)->where('employment_status', 'active')->where($missingStatutory)->count(),
        ];
    }

    /**
     * Users who can be linked to a new employee, with the companies where they already are one (a user is an
     * employee at most once per company). Users who already are in every company listed are left out.
     *
     * @param  list<int>  $companyIds
     * @return list<array{id: int, name: string, username: ?string, email: ?string, role: ?string, employee_entity_ids: list<int>}>
     */
    private function linkableUsers(array $companyIds): array
    {
        $employeeOf = Employee::query()->withoutGlobalScope('entity')->whereNotNull('user_id')->get(['user_id', 'entity_id'])
            ->groupBy('user_id')
            ->map(fn ($rows) => $rows->pluck('entity_id')->map(fn ($id) => (int) $id)->unique()->values()->all());

        return User::query()
            ->with('roles:id,name')
            ->orderBy('firstname')
            ->orderBy('lastname')
            ->get(['id', 'username', 'email', 'firstname', 'lastname'])
            ->map(fn (User $u) => [
                'id' => $u->id, 'name' => $u->name, 'username' => $u->username, 'email' => $u->email, 'role' => $u->roles->first()?->name,
                'employee_entity_ids' => $employeeOf[$u->id] ?? [],
            ])
            ->filter(fn (array $u) => array_diff($companyIds, $u['employee_entity_ids']) !== [])
            ->values()
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
            'birth_date' => ['nullable', 'date', 'before_or_equal:'.now()->subYears(Employee::MIN_WORKING_AGE)->toDateString()],
            'dependents' => ['nullable', 'integer', 'min:0', 'max:30'],
            'position' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:150', ...($newLogin ? [Rule::unique('users', 'email')] : [])],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:255'],
            'emergency_contact_name' => ['nullable', 'string', 'max:150'],
            'emergency_contact_relationship' => ['nullable', 'string', 'max:50'],
            'emergency_contact_phone' => ['nullable', 'string', 'max:50'],
            'hire_date' => ['nullable', 'date'],
            'regularization_date' => ['nullable', 'date', ...$afterHire],
            'separation_date' => ['nullable', 'required_if:employment_status,separated', 'date', ...$afterHire],
            'employment_status' => ['required', 'string', Rule::in(self::STATUSES)],
            'employment_type' => ['required', 'string', Rule::in(self::EMPLOYMENT_TYPES)],
            'default_shift_template_id' => ['nullable', 'integer', Rule::exists('shift_templates', 'id')->where(fn ($q) => $q->where('entity_id', $entityId)->orWhereNull('entity_id'))],
            'rest_days' => ['nullable', 'array'],
            'rest_days.*' => ['integer', 'between:0,6'],
            'break_start' => ['nullable', 'date_format:H:i,H:i:s'],
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
            'bank_account_name' => ['nullable', 'string', 'max:150'],
            'bank_account_no' => ['nullable', 'string', 'max:50'],
            // The payroll bank: an active bank account the employee's company holds or shares. Pay is released from
            // it to the employee's account at the same bank; none = paid in cash or cheque.
            'charge_bank_account_id' => ['nullable', 'integer', function (string $attribute, mixed $value, \Closure $fail) use ($entityId) {
                if (! BankAccount::query()->withoutGlobalScope('entity')->usableBy((int) $entityId)->where('is_active', true)->whereKey($value)->exists()) {
                    $fail('Choose one of the bank accounts registered for the employee\'s company.');
                }
            }],
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
            'break_start.date_format' => 'Enter the break time as hours and minutes, e.g. 12:00.',
            'birth_date.before_or_equal' => 'The employee must be at least '.Employee::MIN_WORKING_AGE.' years old (RA 9231).',
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

        // The preset break must lie within the employee's regular shift; the shift decides its length.
        if (array_key_exists('break_start', $data)) {
            $data['break_start'] = $this->presetBreak($data['break_start'], $data['default_shift_template_id'] ?? null);
        }

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

        // The employee's bank is the payroll bank's: their account is held at the registered bank pay is released from.
        if (array_key_exists('charge_bank_account_id', $data)) {
            $data['bank_name'] = $data['charge_bank_account_id']
                ? BankAccount::query()->withoutGlobalScope('entity')->whereKey($data['charge_bank_account_id'])->value('bank_name')
                : null;
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

    /**
     * The preset break start (H:i:s), or null for none. Refused when the hour does not fit the regular shift.
     */
    private function presetBreak(?string $breakStart, ?int $templateId): ?string
    {
        if (blank($breakStart)) {
            return null;
        }

        $shift = $this->regularShift($templateId ? ShiftTemplate::query()->withoutGlobalScope('entity')->find($templateId) : null, app(EntityContext::class)->id());
        $window = $this->presetWindow($breakStart, $shift);

        if ($window === null) {
            $range = Carbon::parse($shift['start'])->format('g:i A').' – '.Carbon::parse($shift['end'])->format('g:i A');
            $minutes = WorkSchedule::presetBreakMinutes();
            $length = $minutes === 60 ? '1-hour' : "{$minutes}-minute";

            throw ValidationException::withMessages(['break_start' => $shift['break_minutes'] > 0
                ? "The {$length} break must fit within the shift ({$range})."
                : 'This shift has no unpaid break. Leave the break time blank or choose a shift with one.']);
        }

        return $window[0];
    }
}
