<?php

namespace App\Services\People;

use App\Models\Employee;
use App\Models\User;
use App\Support\EntityContext;
use App\Support\ViewMode;

/**
 * Resolves the employee record linked to a user within the current entity.
 *
 * A user is linked by employees.user_id; email match is only a fallback for records
 * that have not been linked yet. The lookup is always constrained to the entity so a
 * user can never resolve to another entity's employee.
 */
class EmployeeResolver
{
    public function __construct(protected EntityContext $entityContext) {}

    public function forUser(?User $user, ?int $entityId = null): ?Employee
    {
        if (! $user) {
            return null;
        }

        $entityId ??= $this->entityContext->id();

        $base = Employee::query()->withoutEntityScope();
        if ($entityId !== null) {
            $base->where('employees.entity_id', $entityId);
        }

        $linked = (clone $base)->where('user_id', $user->id)->first();
        if ($linked) {
            return $linked;
        }

        if (blank($user->email)) {
            return null;
        }

        return (clone $base)->whereNull('user_id')->where('email', $user->email)->first();
    }

    /**
     * Whether the user holds any of these permissions as such. Unlike isHr(), payroll.manage does not stand in for
     * them: deciding on and handling employees' requests (requests.approve, requests.manage) are the owner's.
     */
    public function may(?User $user, string ...$abilities): bool
    {
        return $user !== null && ! app(ViewMode::class)->asEmployee($user) && $user->canAny($abilities);
    }

    public function isHr(?User $user, string $ability = 'payroll.manage'): bool
    {
        // An Admin in the employee view uses the self-service side, as any employee does.
        if (! $user || app(ViewMode::class)->asEmployee($user)) {
            return false;
        }

        return $user->can($ability) || $user->can('payroll.manage');
    }
}

