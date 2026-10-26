<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\ProfileDeleteRequest;
use App\Http\Requests\Settings\ProfileUpdateRequest;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Support\EntityContext;
use App\Support\MissingValue;
use App\Support\PermissionCatalog;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The user's own profile, from the same data as User management (the login, role, access and companies) and the
 * Employee Directory (the employee records linked to the login, one per company). Personal details saved here go to
 * the login and to every linked employee record, so the three screens show the same person.
 */
class ProfileController extends Controller
{
    /** Where the Employee Directory keeps employee photos. */
    private const EMPLOYEE_AVATAR_DIR = 'employee-avatars';

    /** Login field => employee field, for the details both keep. */
    private const SHARED_FIELDS = [
        'firstname' => 'firstname',
        'middlename' => 'middlename',
        'lastname' => 'lastname',
        'email' => 'email',
        'contact_number' => 'phone',
        'address' => 'address',
        'birthdate' => 'birth_date',
    ];

    /** Details only an employee record keeps. */
    private const EMPLOYEE_FIELDS = ['civil_status', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone'];

    /**
     * Show the user's profile settings page.
     */
    public function edit(Request $request): Response
    {
        $user = $request->user();
        $employees = $this->employees($user);

        return Inertia::render('settings/profile', [
            'mustVerifyEmail' => $user instanceof MustVerifyEmail,
            'status' => $request->session()->get('status'),
            'profile' => $this->details($user, $employees->first()),
            'account' => $this->account($user),
            'employments' => $employees->map(fn (Employee $e) => $this->employment($e))->values()->all(),
        ]);
    }

    /**
     * Update the user's profile information, on the login and on the employee records linked to it.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validated();
        $userData = Arr::only($data, [...array_keys(self::SHARED_FIELDS), 'sex']);
        $oldAvatar = $user->avatar;

        if ($request->hasFile('avatar')) {
            $userData['avatar'] = $request->file('avatar')->store('avatars', 'public');
        } elseif ($request->boolean('remove_avatar')) {
            $userData['avatar'] = null;
        }
        $photoChanged = array_key_exists('avatar', $userData);

        $employees = $this->employees($user);
        $replaced = [];

        DB::transaction(function () use ($user, $userData, $data, $employees, $photoChanged, &$replaced) {
            $user->fill($userData);

            if ($user->isDirty('email')) {
                $user->email_verified_at = null;
            }

            $user->save();

            foreach ($employees as $employee) {
                $changes = Arr::only($data, self::EMPLOYEE_FIELDS);
                foreach (self::SHARED_FIELDS as $from => $to) {
                    $changes[$to] = $userData[$from] ?? null;
                }

                // The directory takes male / female only; anything else leaves its value as it is.
                $gender = strtolower((string) ($userData['sex'] ?? ''));
                if (in_array($gender, ['male', 'female'], true)) {
                    $changes['gender'] = $gender;
                }

                // Each record keeps its own copy of the photo, as one uploaded in the directory would be; removing the
                // photo removes theirs too.
                if ($photoChanged) {
                    $replaced[] = $employee->avatar;
                    $changes['avatar'] = $userData['avatar'] ? $this->copyPhoto($userData['avatar']) : null;
                }

                $employee->update($changes);
            }
        });

        foreach (array_unique(array_filter([...$replaced, $photoChanged ? $oldAvatar : null])) as $path) {
            if (! str_starts_with($path, 'http')) {
                Storage::disk('public')->delete($path);
            }
        }

        return to_route('profile.edit');
    }

    /**
     * Delete the user's profile.
     */
    public function destroy(ProfileDeleteRequest $request): RedirectResponse
    {
        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }

    // -----------------------------------------------------------------------------------------

    /**
     * Employee records linked to the login, in every company; the current company's first, then the active ones.
     *
     * @return Collection<int, Employee>
     */
    private function employees(User $user): Collection
    {
        $current = app(EntityContext::class)->id();

        return Employee::query()
            ->withoutGlobalScope('entity')
            ->where('user_id', $user->id)
            ->with([
                'entity:id,code,name',
                'defaultShiftTemplate' => fn ($q) => $q->withoutGlobalScope('entity'),
                'chargeBankAccount' => fn ($q) => $q->withoutGlobalScope('entity')->select(['id', 'name', 'bank_name']),
            ])
            ->get()
            ->sortBy(fn (Employee $e) => [$e->entity_id === $current ? 0 : 1, $e->employment_status === 'active' ? 0 : 1, $e->hire_date?->timestamp ?? PHP_INT_MAX])
            ->values();
    }

    /**
     * The form's values: what the login holds, and the employee record's where the login has none (e.g. a detail HR
     * entered in the directory). A "-" counts as none.
     *
     * @return array<string, string|null>
     */
    private function details(User $user, ?Employee $employee): array
    {
        $value = fn (mixed $v) => MissingValue::is($v) ? null : ($v instanceof \DateTimeInterface ? $v->format('Y-m-d') : (string) $v);

        $details = [];
        foreach (self::SHARED_FIELDS as $from => $to) {
            $details[$from] = $value($user->{$from}) ?? $value($employee?->{$to});
        }
        $details['sex'] = $value($user->sex) ?? ($employee?->gender ? ucfirst($employee->gender) : null);
        foreach (self::EMPLOYEE_FIELDS as $field) {
            $details[$field] = $value($employee?->{$field});
        }

        return $details;
    }

    /**
     * The login as User management shows it: role, status, security, companies and what the user can access.
     *
     * @return array<string, mixed>
     */
    private function account(User $user): array
    {
        $role = $user->getRoleNames()->first();
        $current = app(EntityContext::class)->id();
        $defaults = $user->entities()->wherePivot('is_default', true)->pluck('entities.id')->all();

        return [
            'username' => $user->username,
            'role' => $role,
            'role_description' => $role ? PermissionCatalog::roleDescription($role) : null,
            'position' => MissingValue::is($user->position) ? null : $user->position,
            'date_started' => $user->date_started?->format('Y-m-d'),
            'status' => (bool) $user->status,
            'email_verified' => $user->email_verified_at !== null,
            'created_at' => $user->created_at?->toIso8601String(),
            'companies' => $user->accessibleEntities()->orderBy('entities.name')->get(['entities.id', 'entities.code', 'entities.name'])
                ->map(fn (Entity $e) => [
                    'id' => $e->id,
                    'code' => $e->code,
                    'name' => $e->name,
                    'is_default' => in_array($e->id, $defaults, true),
                    'is_current' => $e->id === $current,
                ])
                ->values()
                ->all(),
            'access' => $this->access($user),
        ];
    }

    /**
     * The user's permissions (role and extra), grouped by module in the catalog's order.
     *
     * @return list<array{key: string, label: string, permissions: list<string>}>
     */
    private function access(User $user): array
    {
        $byModule = $user->getAllPermissions()->pluck('name')
            ->map(fn (string $name) => PermissionCatalog::describe($name))
            ->groupBy('module');

        return collect(PermissionCatalog::modules())
            ->filter(fn (array $m) => $byModule->has($m['key']))
            ->map(fn (array $m) => [
                'key' => $m['key'],
                'label' => $m['label'],
                'permissions' => $byModule[$m['key']]->pluck('label')->sort()->values()->all(),
            ])
            ->values()
            ->all();
    }

    /**
     * An employee record as the Employee Directory keeps it. Kept by HR: shown, not edited, here.
     *
     * @return array<string, mixed>
     */
    private function employment(Employee $e): array
    {
        $onFile = fn (?string $v) => MissingValue::is($v) ? null : $v;
        $shift = $e->defaultShiftTemplate
            ? ['name' => $e->defaultShiftTemplate->name, 'start' => (string) $e->defaultShiftTemplate->start_time, 'end' => (string) $e->defaultShiftTemplate->end_time]
            : Arr::only(ShiftTemplate::defaultShift($e->entity_id), ['name', 'start', 'end']);
        $accountNo = $onFile($e->bank_account_no);

        return [
            'id' => $e->id,
            'employee_code' => $e->employee_code,
            'company' => $e->entity ? ['id' => $e->entity->id, 'code' => $e->entity->code, 'name' => $e->entity->name] : null,
            'position' => $onFile($e->position),
            'employment_status' => $e->employment_status,
            'employment_type' => $e->employment_type,
            'hire_date' => $e->hire_date?->format('Y-m-d'),
            'regularization_date' => $e->regularization_date?->format('Y-m-d'),
            'separation_date' => $e->separation_date?->format('Y-m-d'),
            'shift' => $shift,
            'ids' => [
                'sss_number' => $onFile($e->sss_number),
                'philhealth_number' => $onFile($e->philhealth_number),
                'pagibig_number' => $onFile($e->pagibig_number),
                'tin' => $onFile($e->tin),
            ],
            'bank' => [
                'name' => $e->chargeBankAccount?->bank_name ?? $onFile($e->bank_name),
                // Only the last digits: enough to recognise the account.
                'account_no' => $accountNo ? '•••• '.substr($accountNo, -4) : null,
            ],
        ];
    }

    /**
     * A copy of the login's new photo for an employee record.
     */
    private function copyPhoto(string $path): string
    {
        $copy = self::EMPLOYEE_AVATAR_DIR.'/'.pathinfo($path, PATHINFO_FILENAME).'-'.bin2hex(random_bytes(4)).'.'.pathinfo($path, PATHINFO_EXTENSION);
        Storage::disk('public')->copy($path, $copy);

        return $copy;
    }
}
