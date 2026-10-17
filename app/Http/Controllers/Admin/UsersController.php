<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UserRbacUpdateRequest;
use App\Http\Requests\Admin\UserStatusUpdateRequest;
use App\Http\Requests\Admin\UserStoreRequest;
use App\Http\Requests\Admin\UserUpdateRequest;
use App\Models\User;
use App\Services\Admin\UserService;
use App\Support\PermissionCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class UsersController extends Controller
{
    /** A session touched within this many minutes counts as "online now". */
    private const ONLINE_MINUTES = 5;

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
        $filters = [
            'role' => $request->filled('role') ? (string) $request->get('role') : null,
            'status' => in_array($request->get('status'), ['active', 'disabled'], true) ? $request->get('status') : null,
            'sort' => in_array($request->get('sort'), ['newest', 'oldest', 'name'], true) ? $request->get('sort') : 'newest',
        ];

        $paginator = $this->userService->getUsersPaginated($page, $pageSize, $search !== '' ? $search : null, $filters);
        $lastSeen = $this->lastSeen(collect($paginator->items())->pluck('id')->all());

        $users = collect($paginator->items())
            ->map(fn (User $user) => array_merge(
                $user->toArray(),
                [
                    'roles' => $user->roles->pluck('name')->values()->all(),
                    'permissions' => $user->permissions->pluck('name')->values()->all(),
                    'avatar_url' => $user->avatar ? Storage::disk('public')->url($user->avatar) : null,
                    'last_seen_at' => $lastSeen[$user->id] ?? null,
                ]
            ))
            ->values()
            ->all();

        $roles = Role::query()
            ->with('permissions:id,name')
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => [
                'name' => $role->name,
                'description' => $role->description ?: PermissionCatalog::roleDescription($role->name),
                'permissions' => $role->permissions->pluck('name')->values()->all(),
                'usersCount' => $role->users_count,
            ])
            ->all();

        $permissions = Permission::query()->orderBy('name')->pluck('name')
            ->map(fn (string $name) => PermissionCatalog::describe($name))
            ->values()
            ->all();

        return Inertia::render('admin/users/page', [
            'users' => $users,
            'totalUsers' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
            'filters' => $filters,
            'summary' => $this->summary(),
            'currentUserId' => $request->user()?->id,
            'roles' => $roles,
            'permissions' => $permissions,
            'modules' => PermissionCatalog::modules(),
        ]);
    }

    public function store(UserStoreRequest $request): RedirectResponse
    {
        $data = collect($request->validated())->except('avatar')->all();

        if ($request->hasFile('avatar')) {
            $data['avatar'] = $request->file('avatar')->store('avatars', 'public');
        }

        $user = $this->userService->create($data);

        return redirect()->back()
            ->with('status', "User {$user->name} created.");
    }

    public function update(UserUpdateRequest $request, User $user): RedirectResponse
    {
        $data = collect($request->validated())->except('avatar')->all();
        $this->guardSelfLockout($request, $user, (string) $data['role'], $data['permissions'] ?? []);

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
        $this->guardSelfLockout($request, $user, (string) $validated['role'], $validated['permissions'] ?? []);

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
        if (! $request->validated('status') && $request->user()?->is($user)) {
            throw ValidationException::withMessages(['status' => 'You cannot disable your own account.']);
        }

        $this->userService->updateStatus($user, $request->validated('status'));

        return redirect()->back()
            ->with('status', $request->validated('status') ? "{$user->name} enabled." : "{$user->name} disabled.");
    }

    // -----------------------------------------------------------------------------------------

    /**
     * Admins editing themselves must keep the access needed to manage users and roles.
     *
     * @param  array<int, string>  $direct
     */
    private function guardSelfLockout(Request $request, User $user, string $role, array $direct): void
    {
        if (! $request->user()?->is($user) || ! $user->can('admin.users.manage')) {
            return;
        }

        $rolePermissions = Role::findByName($role, 'web')->permissions->pluck('name')->all();
        $missing = array_diff(PermissionCatalog::ADMIN_LOCKED, [...$rolePermissions, ...$direct]);

        if ($missing !== []) {
            throw ValidationException::withMessages([
                'role' => 'You cannot remove your own access to manage users and roles. Ask another administrator to change your access.',
            ]);
        }
    }

    /** @return array{total: int, active: int, disabled: int, twoFactor: int, online: int} */
    private function summary(): array
    {
        $counts = User::query()
            ->selectRaw('count(*) as total')
            ->selectRaw('sum(case when status = 1 then 1 else 0 end) as active')
            ->selectRaw('sum(case when two_factor_confirmed_at is not null then 1 else 0 end) as two_factor')
            ->first();

        $online = $this->usesDatabaseSessions()
            ? DB::table(config('session.table', 'sessions'))
                ->whereNotNull('user_id')
                ->where('last_activity', '>=', now()->subMinutes(self::ONLINE_MINUTES)->getTimestamp())
                ->distinct()
                ->count('user_id')
            : 0;

        $total = (int) $counts->total;
        $active = (int) $counts->active;

        return [
            'total' => $total,
            'active' => $active,
            'disabled' => $total - $active,
            'twoFactor' => (int) $counts->two_factor,
            'online' => $online,
        ];
    }

    /**
     * Last request time per user, from the database session store.
     *
     * @param  array<int, int>  $ids
     * @return array<int, string>
     */
    private function lastSeen(array $ids): array
    {
        if ($ids === [] || ! $this->usesDatabaseSessions()) {
            return [];
        }

        return DB::table(config('session.table', 'sessions'))
            ->whereIn('user_id', $ids)
            ->groupBy('user_id')
            ->selectRaw('user_id, max(last_activity) as last_activity')
            ->pluck('last_activity', 'user_id')
            ->map(fn ($ts) => Carbon::createFromTimestamp((int) $ts)->toIso8601String())
            ->all();
    }

    private function usesDatabaseSessions(): bool
    {
        return config('session.driver') === 'database';
    }
}
