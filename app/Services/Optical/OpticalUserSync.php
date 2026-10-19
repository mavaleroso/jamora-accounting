<?php

namespace App\Services\Optical;

use App\Enums\RoleEnum;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Support\MissingValue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Throwable;

/**
 * Replicates optical-new's users as accounting logins, each with an employee record.
 *
 *   - Login: a copy of the optical-new user, value for value (username, email, names, sex, contact number, address,
 *     birthdate, position, start date, status and photo), refreshed on every sync. A user removed from optical-new
 *     is disabled here. Roles are given here: a new login starts with the Employee role.
 *   - Passwords are not copied: a new login gets a random one, which an admin resets in User management.
 *   - Employee record: created in the entity its optical-new role belongs to (optical.user_entities) and never
 *     moved. Text fields optical-new has no value for are marked "-" until filled in here, and a "-" never replaces
 *     a value entered here. Email, dates and pay stay empty, since they must be valid; a birth date too recent for
 *     a working employee (optical-new's placeholder) is not copied.
 */
class OpticalUserSync
{
    /** Login fields copied as they are. */
    private const USER_FIELDS = ['firstname', 'middlename', 'lastname', 'sex', 'contact_number', 'address', 'birthdate', 'position', 'date_started'];

    /** What optical-new staff type in for "nothing" (an employee record shows "-" instead). */
    private const EMPTY_WORDS = ['-', 'none', 'n/a', 'null'];

    /** Employee fields optical-new has no counterpart for. */
    private const LOCAL_FIELDS = [
        'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone',
        'sss_number', 'philhealth_number', 'pagibig_number', 'tin', 'bank_name', 'bank_account_name', 'bank_account_no',
    ];

    private const PHOTO_TYPES = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    public function __construct(protected OpticalRouter $router) {}

    /**
     * @param  array<string, mixed>  $record  a user from GET /users
     * @return 'created'|'updated'|'skipped'
     */
    public function process(array $record): string
    {
        $opticalId = (int) ($record['id'] ?? 0);
        $username = $this->raw($record['username'] ?? null);

        if ($opticalId <= 0 || $username === null) {
            return 'skipped';
        }

        return DB::transaction(function () use ($record, $opticalId, $username) {
            // A login made here under the same username becomes the copy.
            $user = User::query()->where('optical_user_id', $opticalId)->first()
                ?? User::query()->whereNull('optical_user_id')->where('username', $username)->first();
            $newUser = $user === null;
            $user ??= new User(['password' => Str::password(40)]);
            $previousPhoto = $user->avatar;

            $this->fillUser($user, $record, $opticalId, $username, $newUser);
            $userChanged = $user->isDirty();
            $statusChanged = $user->isDirty('status');
            $user->save();

            if ($newUser) {
                $user->assignRole(Role::findOrCreate(RoleEnum::Employee->value, 'web'));
            }

            // An employee record deleted here stays deleted.
            $employee = Employee::query()->withoutGlobalScopes()->where('user_id', $user->id)->first();
            if ($employee?->trashed()) {
                return $newUser ? 'created' : ($userChanged ? 'updated' : 'skipped');
            }

            $employee ??= $this->newEmployee($user, $record, $opticalId);
            $this->fillEmployee($employee, $record, $user, $previousPhoto, $statusChanged);
            $employeeChanged = $employee->isDirty();
            $employee->save();

            if (! $user->entities()->where('entities.id', $employee->entity_id)->exists()) {
                $user->entities()->attach($employee->entity_id, ['is_default' => ! $user->entities()->exists()]);
            }

            return match (true) {
                $newUser || $employee->wasRecentlyCreated => 'created',
                $userChanged || $employeeChanged => 'updated',
                default => 'skipped',
            };
        });
    }

    /**
     * Disable the logins (and make the employees inactive) of users no longer in optical-new.
     *
     * @param  list<int>  $opticalIds  every user optical-new returned
     */
    public function disableMissing(array $opticalIds): int
    {
        $users = User::query()->whereNotNull('optical_user_id')->whereNotIn('optical_user_id', $opticalIds)->where('status', true)->get();

        foreach ($users as $user) {
            $user->update(['status' => false]);
            Employee::query()->withoutGlobalScopes()->where('user_id', $user->id)->whereNull('deleted_at')
                ->where('employment_status', 'active')->get()
                ->each->update(['employment_status' => 'inactive', 'is_active' => false]);
        }

        return $users->count();
    }

    /**
     * @param  array<string, mixed>  $r
     */
    protected function fillUser(User $user, array $r, int $opticalId, string $username, bool $new): void
    {
        $user->optical_user_id = $opticalId;

        // Follow a renamed username unless another login has it; a new login takes "<username>-<id>" then.
        if (! User::query()->where('username', $username)->whereKeyNot($user->getKey())->exists()) {
            $user->username = $username;
        } elseif ($new) {
            $user->username = "{$username}-{$opticalId}";
        }

        // An email another login here already uses stays with that login.
        $email = $this->raw($r['email'] ?? null);
        if ($email === null || ! User::query()->where('email', $email)->whereKeyNot($user->getKey())->exists()) {
            $user->email = $email;
        }

        foreach (self::USER_FIELDS as $field) {
            $user->setAttribute($field, $this->raw($r[$field] ?? null));
        }

        $user->avatar = $this->copyPhoto($r['avatar_url'] ?? null, $user->avatar);
        $user->status = (bool) ($r['status'] ?? true);
    }

    /**
     * The user's photo, copied into this app's public storage under the same file name; returns its path.
     */
    protected function copyPhoto(mixed $url, ?string $current): ?string
    {
        $url = $this->raw($url);
        if ($url === null) {
            return null;
        }

        $name = basename((string) parse_url($url, PHP_URL_PATH));
        if (! in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), self::PHOTO_TYPES, true)) {
            return $current;
        }

        $path = 'avatars/'.$name;
        $disk = Storage::disk('public');
        if ($path === $current && $disk->exists($path)) {
            return $path;
        }

        try {
            $response = Http::timeout(15)->get($url);
            if (! $response->successful()) {
                return $current;
            }
            $disk->put($path, $response->body());

            return $path;
        } catch (Throwable) {
            return $current;
        }
    }

    /**
     * @param  array<string, mixed>  $r
     */
    protected function newEmployee(User $user, array $r, int $opticalId): Employee
    {
        $entity = $this->entityFor($r['roles'] ?? []);

        return new Employee([
            'entity_id' => $entity->id,
            'user_id' => $user->id,
            'employee_code' => $this->employeeCode($entity, $opticalId),
            'employment_status' => $user->status ? 'active' : 'inactive',
            'employment_type' => 'regular',
            'is_active' => $user->status,
            'pay_type' => 'monthly',
            'basic_pay' => 0,
            'vacation_leave_credits' => 0,
            'sick_leave_credits' => 0,
        ]);
    }

    /**
     * @param  array<string, mixed>  $r
     */
    protected function fillEmployee(Employee $employee, array $r, User $user, ?string $previousPhoto, bool $statusChanged): void
    {
        $employee->firstname = $this->text($r['firstname'] ?? null) ?? $employee->firstname ?? $user->username;
        $this->sync($employee, 'middlename', $r['middlename'] ?? null);
        $this->sync($employee, 'lastname', $r['lastname'] ?? null);
        $this->sync($employee, 'position', $r['position'] ?? null);
        $this->sync($employee, 'phone', $r['contact_number'] ?? null);
        $this->sync($employee, 'address', $r['address'] ?? null);

        foreach (self::LOCAL_FIELDS as $field) {
            $this->sync($employee, $field, null);
        }

        $employee->email = $this->email($r['email'] ?? null) ?? $employee->email;
        $gender = strtolower((string) $this->text($r['sex'] ?? null));
        if (in_array($gender, ['male', 'female'], true)) {
            $employee->gender = $gender;
        }
        $employee->hire_date = $this->date($r['date_started'] ?? null) ?? $employee->hire_date;
        $birthDate = $this->date($r['birthdate'] ?? null);
        if ($birthDate !== null && $birthDate <= now()->subYears(Employee::MIN_WORKING_AGE)->toDateString()) {
            $employee->birth_date = $birthDate;
        }

        // A photo uploaded here is kept; one taken from the login follows it.
        if (blank($employee->avatar) || str_starts_with((string) $employee->avatar, 'http') || $employee->avatar === $previousPhoto) {
            $employee->avatar = $user->avatar;
        }

        // The employee follows the login being disabled or enabled in optical-new; a separated one stays separated.
        if ($statusChanged && $employee->exists && $employee->employment_status !== 'separated') {
            $employee->employment_status = $user->status ? 'active' : 'inactive';
            $employee->is_active = $user->status;
        }
    }

    /**
     * optical-new's value when it has one; otherwise "-" for a field still empty here.
     */
    protected function sync(Model $model, string $attribute, mixed $value): void
    {
        $value = $this->text($value);

        if ($value !== null) {
            $model->setAttribute($attribute, $value);
        } elseif (blank($model->getAttribute($attribute))) {
            $model->setAttribute($attribute, MissingValue::MARK);
        }
    }

    /**
     * The employer, from the first optical-new role that names one.
     *
     * @param  list<string>  $roles
     */
    protected function entityFor(array $roles): Entity
    {
        $map = array_change_key_case(config('optical.user_entities', []));

        foreach ($roles as $role) {
            if ($code = $map[strtolower(trim((string) $role))] ?? null) {
                return $this->router->entity($code);
            }
        }

        return $this->router->entity((string) config('optical.default_user_entity', 'A_JAMORA'));
    }

    protected function employeeCode(Entity $entity, int $opticalId): string
    {
        $base = 'OPT-'.str_pad((string) $opticalId, 4, '0', STR_PAD_LEFT);
        $code = $base;

        for ($n = 2; Employee::query()->withoutGlobalScopes()->where('entity_id', $entity->id)->where('employee_code', $code)->exists(); $n++) {
            $code = "{$base}-{$n}";
        }

        return $code;
    }

    /** The value as optical-new has it (trimmed), or null when empty. */
    protected function raw(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    /** Like raw(), but "none", "n/a" and the like count as empty. */
    protected function text(mixed $value): ?string
    {
        $value = $this->raw($value);

        return $value === null || in_array(strtolower($value), self::EMPTY_WORDS, true) ? null : $value;
    }

    protected function email(mixed $value): ?string
    {
        $value = $this->text($value);

        return $value !== null && filter_var($value, FILTER_VALIDATE_EMAIL) ? $value : null;
    }

    protected function date(mixed $value): ?string
    {
        $value = $this->text($value);

        try {
            return $value !== null ? Carbon::parse($value)->toDateString() : null;
        } catch (Throwable) {
            return null;
        }
    }
}
