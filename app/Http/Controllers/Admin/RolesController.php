<?php

namespace App\Http\Controllers\Admin;

use App\Enums\RoleEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\RoleStoreRequest;
use App\Http\Requests\Admin\RoleUpdateRequest;
use App\Models\User;
use App\Support\PermissionCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Roles & Permissions workspace: what each role can do, who holds it, the role x permission matrix,
 * user role assignments and (advanced) the permission keys themselves.
 *
 * Users hold one role each (plus optional direct permissions, managed from Admin › Users).
 */
class RolesController extends Controller
{
    private const TABS = ['roles', 'matrix', 'users', 'permissions'];

    public function index(Request $request): Response
    {
        $roles = Role::query()->with('permissions:id,name')->withCount('users')->orderBy('name')->get();

        $permissions = Permission::query()->with('roles:id,name')->withCount(['roles', 'users'])->orderBy('name')->get();

        $users = User::query()
            ->with(['roles:id,name'])
            ->withCount('permissions')
            ->orderBy('lastname')
            ->orderBy('firstname')
            ->get();

        return Inertia::render('admin/roles-permissions/page', [
            'tab' => in_array($request->query('tab'), self::TABS, true) ? $request->query('tab') : 'roles',
            'currentUserId' => $request->user()?->id,
            'modules' => PermissionCatalog::modules(),
            'roles' => $roles->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'description' => $role->description ?: PermissionCatalog::roleDescription($role->name),
                'customDescription' => $role->description,
                'isSystem' => PermissionCatalog::isSystemRole($role->name),
                'isAdmin' => $role->name === RoleEnum::Admin->value,
                'permissions' => $role->permissions->pluck('name')->values()->all(),
                'usersCount' => $role->users_count,
                'updatedAt' => $role->updated_at?->toISOString(),
            ])->values(),
            'permissions' => $permissions->map(fn (Permission $permission) => [
                ...PermissionCatalog::describe($permission->name),
                'id' => $permission->id,
                'roles' => $permission->roles->pluck('name')->values()->all(),
                'rolesCount' => $permission->roles_count,
                'usersCount' => $permission->users_count,
            ])->values(),
            'users' => $users->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'email' => $user->email,
                'position' => $user->position,
                'status' => (bool) $user->status,
                'avatarUrl' => $user->avatar ? Storage::disk('public')->url($user->avatar) : null,
                'role' => $user->roles->first()?->name,
                'directPermissions' => $user->permissions_count,
            ])->values(),
        ]);
    }

    public function store(RoleStoreRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $permissions = $validated['permissions'] ?? [];
        if (! empty($validated['copy_from'])) {
            $permissions = Role::findById((int) $validated['copy_from'], 'web')->permissions->pluck('name')->all();
        }

        $role = Role::query()->create([
            'name' => trim((string) $validated['name']),
            'description' => $validated['description'] ?? null,
            'guard_name' => 'web',
        ]);
        $role->syncPermissions($permissions);
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'roles', 'role' => $role->id])
            ->with('status', "Role “{$role->name}” created.");
    }

    public function update(RoleUpdateRequest $request, Role $role): RedirectResponse
    {
        $validated = $request->validated();
        $name = trim((string) $validated['name']);

        if ($name !== $role->name && PermissionCatalog::isSystemRole($role->name)) {
            throw ValidationException::withMessages(['name' => "“{$role->name}” is a built-in role and cannot be renamed."]);
        }

        $permissions = $validated['permissions'] ?? [];
        $this->guardLockout($request->user(), $role, $permissions);

        $role->update([
            'name' => $name,
            'description' => $validated['description'] ?? null,
        ]);
        $role->syncPermissions($permissions);
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'roles', 'role' => $role->id])
            ->with('status', "Role “{$role->name}” saved.");
    }

    public function destroy(Role $role): RedirectResponse
    {
        $role->loadCount('users');

        if (PermissionCatalog::isSystemRole($role->name)) {
            throw ValidationException::withMessages(['role' => "“{$role->name}” is a built-in role and cannot be deleted."]);
        }
        if ($role->users_count > 0) {
            throw ValidationException::withMessages(['role' => "Move the {$role->users_count} user(s) holding “{$role->name}” to another role first."]);
        }

        $role->delete();
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'roles'])
            ->with('status', "Role “{$role->name}” deleted.");
    }

    /**
     * Give one or more users this role (users hold a single role, so it replaces their current one).
     */
    public function assign(Request $request, Role $role): RedirectResponse
    {
        $data = $request->validate([
            'user_ids' => ['required', 'array', 'min:1'],
            'user_ids.*' => ['integer', 'exists:users,id'],
        ], ['user_ids.required' => 'Pick at least one user.']);

        $ids = collect($data['user_ids'])->map(fn ($id) => (int) $id);
        if ($ids->contains($request->user()?->id)) {
            throw ValidationException::withMessages(['user_ids' => 'You cannot change your own role. Ask another administrator.']);
        }

        User::query()->whereIn('id', $ids)->get()->each(fn (User $user) => $user->syncRoles([$role->name]));
        $this->flushPermissionCache();

        $n = $ids->count();

        return redirect()->back()->with('status', "“{$role->name}” assigned to {$n} user".($n === 1 ? '' : 's').'.');
    }

    // -----------------------------------------------------------------------------------------

    /**
     * The Admin role, and the acting user's own role, must keep access administration.
     *
     * @param  array<int, string>  $permissions
     */
    private function guardLockout(?User $user, Role $role, array $permissions): void
    {
        $protects = $role->name === RoleEnum::Admin->value || ($user && $user->hasRole($role->name));
        if (! $protects) {
            return;
        }

        $missing = array_diff(PermissionCatalog::ADMIN_LOCKED, $permissions);
        $hadThem = array_intersect(PermissionCatalog::ADMIN_LOCKED, $role->permissions->pluck('name')->all());
        if ($missing && $hadThem) {
            $who = $role->name === RoleEnum::Admin->value ? 'The Admin role' : 'Your own role';
            throw ValidationException::withMessages([
                'permissions' => "{$who} must keep “Manage users” and “Manage roles & permissions” — otherwise nobody could manage access.",
            ]);
        }
    }

    private function flushPermissionCache(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
