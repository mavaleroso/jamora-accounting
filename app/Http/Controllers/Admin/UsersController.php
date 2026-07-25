<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UserRbacUpdateRequest;
use App\Http\Requests\Admin\UserStoreRequest;
use App\Http\Requests\Admin\UserStatusUpdateRequest;
use App\Http\Requests\Admin\UserUpdateRequest;
use App\Models\User;
use App\Services\Admin\UserService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Inertia\Inertia;
use Inertia\Response;

class UsersController extends Controller
{
    public function __construct(
        private readonly UserService $userService
    ) {}

    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 10);
        $pageSize = max(1, min(100, $pageSize));
        $page = (int) $request->get('page', 1);
        $page = max(1, $page);
        $search = trim((string) $request->get('search', ''));

        $paginator = $this->userService->getUsersPaginated($page, $pageSize, $search !== '' ? $search : null);
        $users = collect($paginator->items())
            ->map(fn (User $user) => array_merge(
                $user->toArray(),
                [
                    'roles' => $user->getRoleNames()->values()->all(),
                    'permissions' => $user->getPermissionNames()->values()->all(),
                ]
            ))
            ->values()
            ->all();
        $roles = Role::query()
            ->with('permissions')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => [
                'name' => $role->name,
                'permissions' => $role->permissions->pluck('name')->values()->all(),
            ])
            ->all();
        $permissions = Permission::query()->orderBy('name')->pluck('name')->all();

        return Inertia::render('admin/users/page', [
            'users' => $users,
            'totalUsers' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
            'roles' => $roles,
            'permissions' => $permissions,
        ]);
    }

    public function store(UserStoreRequest $request): RedirectResponse
    {
        $data = collect($request->validated())->except('avatar')->all();

        if ($request->hasFile('avatar')) {
            $data['avatar'] = $request->file('avatar')->store('avatars', 'public');
        }

        $this->userService->create($data);

        return redirect()->back()
            ->with('status', 'User created successfully.');
    }

    public function update(UserUpdateRequest $request, User $user): RedirectResponse
    {
        $data = collect($request->validated())->except('avatar')->all();

        if ($request->hasFile('avatar')) {
            if ($user->avatar) {
                Storage::disk('public')->delete($user->avatar);
            }
            $data['avatar'] = $request->file('avatar')->store('avatars', 'public');
        }

        $this->userService->update($user, $data);

        return redirect()->back()
            ->with('status', 'User updated successfully.');
    }

    public function updateRbac(UserRbacUpdateRequest $request, User $user): RedirectResponse
    {
        $validated = $request->validated();
        $this->userService->updateRbac(
            $user,
            (string) $validated['role'],
            $validated['permissions'] ?? null,
            (bool) ($validated['permissions_present'] ?? false)
        );

        return redirect()->back()
            ->with('status', 'User roles and permissions updated.');
    }

    public function updateStatus(UserStatusUpdateRequest $request, User $user): RedirectResponse
    {
        $this->userService->updateStatus($user, $request->validated('status'));

        return redirect()->back()
            ->with('status', $request->validated('status') ? 'User enabled.' : 'User disabled.');
    }
}
