<?php

namespace App\Support;

use App\Enums\RoleEnum;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Support\Facades\Session;

/**
 * An Admin who is also an employee can use the system as that employee ("Employee view", switched in the header): the
 * employee menu and the self-service side of Requests, Attendance and the roster, as any employee sees them. It is a
 * view, not a change of rights: the Admin role keeps its permissions. The choice is kept in the session.
 */
class ViewMode
{
    public const SESSION_KEY = 'view_mode';

    public const ADMIN = 'admin';

    public const EMPLOYEE = 'employee';

    /** @var array<int, int|null> user id => the company of their employee record, null when they have none */
    private array $employeeCompany = [];

    /** Admins with an employee record can switch between the admin and the employee view. */
    public function canSwitch(?User $user): bool
    {
        return $user !== null && $user->hasRole(RoleEnum::Admin->value) && $this->employeeCompanyId($user) !== null;
    }

    /** The view in use, or null when the user has only one. */
    public function current(?User $user): ?string
    {
        if (! $this->canSwitch($user)) {
            return null;
        }

        return Session::get(self::SESSION_KEY) === self::EMPLOYEE ? self::EMPLOYEE : self::ADMIN;
    }

    public function asEmployee(?User $user): bool
    {
        return $this->current($user) === self::EMPLOYEE;
    }

    /** The company of the user's employee record (an active one first). */
    public function employeeCompanyId(User $user): ?int
    {
        if (! array_key_exists($user->id, $this->employeeCompany)) {
            $entityId = Employee::query()->withoutEntityScope()->where('user_id', $user->id)
                ->orderByDesc('is_active')->orderBy('id')->value('entity_id');
            $this->employeeCompany[$user->id] = $entityId !== null ? (int) $entityId : null;
        }

        return $this->employeeCompany[$user->id];
    }
}
