<?php

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Hash;

class UserService
{
    /**
     * Get all users ordered by most recent first.
     *
     * @return Collection<int, User>
     */
    public function getUsersForListing(): Collection
    {
        return User::query()
            ->with('roles')
            ->orderBy('created_at', 'desc')
            ->get();
    }

    /**
     * Get paginated users with optional search, role / status filters and sort.
     *
     * @param  array{role?: ?string, status?: ?string, sort?: ?string}  $filters
     */
    public function getUsersPaginated(int $page, int $perPage, ?string $search = null, array $filters = []): LengthAwarePaginator
    {
        $query = User::query()->with(['roles:id,name', 'permissions:id,name']);

        $term = trim((string) $search);
        if ($term !== '') {
            $query->where(function ($q) use ($term) {
                $like = '%'.$term.'%';
                $q->where('username', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('firstname', 'like', $like)
                    ->orWhere('middlename', 'like', $like)
                    ->orWhere('lastname', 'like', $like)
                    ->orWhere('position', 'like', $like)
                    ->orWhere('contact_number', 'like', $like)
                    ->orWhere('address', 'like', $like);
            });
        }

        $role = $filters['role'] ?? null;
        if ($role === 'none') {
            $query->doesntHave('roles');
        } elseif ($role) {
            $query->role($role);
        }

        match ($filters['status'] ?? null) {
            'active' => $query->where('status', true),
            'disabled' => $query->where('status', false),
            default => null,
        };

        match ($filters['sort'] ?? 'newest') {
            'name' => $query->orderBy('firstname')->orderBy('lastname'),
            'oldest' => $query->orderBy('created_at'),
            default => $query->orderByDesc('created_at'),
        };

        return $query->orderBy('id')->paginate($perPage, ['*'], 'page', $page);
    }

    /**
     * Find a user by ID.
     */
    public function find(int $id): ?User
    {
        return User::query()->find($id);
    }

    /**
     * Create a new user.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): User
    {
        $role = $data['role'] ?? null;
        $permissions = $data['permissions'] ?? null;
        $permissionsPresent = (bool) ($data['permissions_present'] ?? false);
        unset($data['role']);
        unset($data['permissions'], $data['permissions_present']);
        $data['password'] = Hash::make($data['password']);

        $user = User::query()->create($data);
        if ($role) {
            $user->syncRoles([$role]);
        }
        if ($permissionsPresent || is_array($permissions)) {
            $user->syncPermissions($permissions ?? []);
        }

        return $user;
    }

    /**
     * Update an existing user.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(User $user, array $data): User
    {
        $role = $data['role'] ?? null;
        $permissions = $data['permissions'] ?? null;
        $permissionsPresent = (bool) ($data['permissions_present'] ?? false);
        unset($data['role']);
        unset($data['permissions'], $data['permissions_present']);
        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);
        if ($role) {
            $user->syncRoles([$role]);
        }
        if ($permissionsPresent || is_array($permissions)) {
            $user->syncPermissions($permissions ?? []);
        }

        return $user->fresh();
    }

    /**
     * Update only role and permissions for a user.
     *
     * @param  array<int, string>|null  $permissions
     */
    public function updateRbac(User $user, string $role, ?array $permissions, bool $permissionsPresent): User
    {
        $user->syncRoles([$role]);
        if ($permissionsPresent || is_array($permissions)) {
            $user->syncPermissions($permissions ?? []);
        }

        return $user->fresh();
    }

    /**
     * Update user status (enabled/disabled).
     */
    public function updateStatus(User $user, bool $status): User
    {
        $user->update(['status' => $status]);

        return $user->fresh();
    }
}
