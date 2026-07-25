<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\RoleStoreRequest;
use App\Http\Requests\Admin\RoleUpdateRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesController extends Controller
{
    public function index(Request $request): Response
    {
        $roles = Role::query()
            ->with('permissions')
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'permissions' => $role->permissions->pluck('name')->values()->all(),
                'usersCount' => $role->users_count,
                'createdAt' => $role->created_at?->toISOString(),
                'updatedAt' => $role->updated_at?->toISOString(),
            ])
            ->values()
            ->all();

        $permissionOptions = Permission::query()
            ->orderBy('name')
            ->pluck('name')
            ->all();

        $permissions = Permission::query()
            ->with('roles')
            ->withCount('roles')
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(fn (Permission $permission) => [
                'id' => $permission->id,
                'name' => $permission->name,
                'roles' => $permission->roles->pluck('name')->values()->all(),
                'rolesCount' => $permission->roles_count,
                'usersCount' => $permission->users_count,
                'createdAt' => $permission->created_at?->toISOString(),
                'updatedAt' => $permission->updated_at?->toISOString(),
            ])
            ->values()
            ->all();

        $roleOptions = Role::query()
            ->orderBy('name')
            ->pluck('name')
            ->all();

        $tab = $request->query('tab') === 'permissions' ? 'permissions' : 'roles';

        return Inertia::render('admin/roles-permissions/page', [
            'roles' => $roles,
            'permissionOptions' => $permissionOptions,
            'permissions' => $permissions,
            'roleOptions' => $roleOptions,
            'tab' => $tab,
        ]);
    }

    public function store(RoleStoreRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $role = Role::query()->create([
            'name' => (string) $validated['name'],
            'guard_name' => 'web',
        ]);
        $role->syncPermissions($validated['permissions'] ?? []);
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'roles'])
            ->with('status', 'Role created successfully.');
    }

    public function update(RoleUpdateRequest $request, Role $role): RedirectResponse
    {
        $validated = $request->validated();

        $role->update([
            'name' => (string) $validated['name'],
        ]);
        $role->syncPermissions($validated['permissions'] ?? []);
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'roles'])
            ->with('status', 'Role updated successfully.');
    }

    public function destroy(Role $role): RedirectResponse
    {
        $role->loadCount('users');
        if ($role->name === 'Admin') {
            return redirect()
                ->route('roles.index', ['tab' => 'roles'])
                ->with('error', 'The Admin role cannot be deleted.');
        }

        if ($role->users_count > 0) {
            return redirect()
                ->route('roles.index', ['tab' => 'roles'])
                ->with('error', 'This role is assigned to users and cannot be deleted.');
        }

        $role->delete();
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'roles'])
            ->with('status', 'Role deleted successfully.');
    }

    private function flushPermissionCache(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
