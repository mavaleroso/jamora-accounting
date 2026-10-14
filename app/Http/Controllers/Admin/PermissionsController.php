<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PermissionStoreRequest;
use App\Http\Requests\Admin\PermissionUpdateRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

class PermissionsController extends Controller
{
    public function index(): RedirectResponse
    {
        return redirect()->route('roles.index', ['tab' => 'permissions']);
    }

    public function store(PermissionStoreRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $permission = Permission::query()->create([
            'name' => (string) $validated['name'],
            'guard_name' => 'web',
        ]);
        $permission->syncRoles($validated['roles'] ?? []);
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'permissions'])
            ->with('status', 'Permission created successfully.');
    }

    public function update(PermissionUpdateRequest $request, Permission $permission): RedirectResponse
    {
        $validated = $request->validated();

        if ((string) $validated['name'] !== $permission->name) {
            $this->guardBuiltin($permission, 'renamed');
        }

        $permission->update([
            'name' => (string) $validated['name'],
        ]);
        $permission->syncRoles($validated['roles'] ?? []);
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'permissions'])
            ->with('status', 'Permission updated successfully.');
    }

    public function destroy(Permission $permission): RedirectResponse
    {
        $this->guardBuiltin($permission, 'deleted');
        $permission->loadCount(['roles', 'users']);

        if ($permission->roles_count > 0 || $permission->users_count > 0) {
            return redirect()
                ->route('roles.index', ['tab' => 'permissions'])
                ->with('error', 'Permission is currently assigned and cannot be deleted.');
        }

        $permission->delete();
        $this->flushPermissionCache();

        return redirect()
            ->route('roles.index', ['tab' => 'permissions'])
            ->with('status', 'Permission deleted successfully.');
    }

    /** Built-in keys are checked by the application; renaming or deleting one silently breaks access. */
    private function guardBuiltin(Permission $permission, string $action): void
    {
        if (PermissionEnum::tryFrom($permission->name) !== null) {
            throw ValidationException::withMessages(['name' => "“{$permission->name}” is a built-in permission and cannot be {$action}."]);
        }
    }

    private function flushPermissionCache(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
