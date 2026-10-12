<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Role;

class PeopleAccessController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $users = User::query()
            ->with(['roles'])
            ->orderBy('lastname')
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'email' => $user->email,
                'position' => $user->position,
                'status' => (bool) $user->status,
                'roles' => $user->roles->pluck('name')->toArray(),
            ]);

        $roles = Role::query()->with('permissions')->get()->map(fn (Role $r) => [
            'id' => $r->id,
            'name' => $r->name,
            'permissions_count' => $r->permissions->count(),
            'permissions' => $r->permissions->pluck('name')->toArray(),
        ]);

        return Inertia::render('employee-management/access/page', [
            'users' => $users,
            'roles' => $roles,
        ]);
    }

    public function assignRole(Request $request, User $user): RedirectResponse
    {
        $validated = $request->validate([
            'roles' => ['required', 'array'],
            'roles.*' => ['string', 'exists:roles,name'],
        ]);

        $user->syncRoles($validated['roles']);

        return redirect()->back()->with('status', 'Roles updated successfully.');
    }
}

