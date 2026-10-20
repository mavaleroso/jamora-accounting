<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\People\EmployeeResolver;
use App\Support\EntityContext;
use App\Support\ViewMode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Middleware;
use Spatie\Permission\Models\Role;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function share(Request $request): array
    {
        $entityContext = app(EntityContext::class);
        $user = $request->user();
        $current = $entityContext->current();

        $available = [];
        if ($user) {
            // The company switcher: every company the user can open (an Admin, every one).
            $available = $user->accessibleEntities()->orderBy('entities.name')->get(['entities.id', 'entities.code', 'entities.name']);
        }

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user ? array_merge(
                    $user->toArray(),
                    [
                        'avatar' => $user->avatar
                            ? asset('storage/'.$user->avatar)
                            : null,
                        'position' => $user->position,
                        'roles' => $user->getRoleNames()->values()->all(),
                        'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
                        // Employee record linked to this user in the current branch; personal pages need it.
                        'employee_id' => app(EmployeeResolver::class)->forUser($user, $current?->id)?->id,
                    ]
                ) : null,
                // An Admin who is also an employee: "admin" or "employee", the view in use. Null for everyone else.
                'viewMode' => app(ViewMode::class)->current($user),
            ],
            'entity' => [
                'current' => $current ? [
                    'id' => $current->id,
                    'code' => $current->code,
                    'name' => $current->name,
                ] : null,
                'available' => collect($available)->map(fn ($e) => [
                    'id' => $e->id,
                    'code' => $e->code,
                    'name' => $e->name,
                ])->values()->all(),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'errors' => fn () => collect($request->session()->get('errors')?->getBag('default')->getMessages() ?? [])
                ->map(fn (array $messages) => $messages[0] ?? '')
                ->all(),
            'flash' => fn () => [
                'status' => $request->session()->get('status'),
                'error' => $request->session()->get('error'),
                'openListTab' => $request->session()->get('openListTab'),
            ],
            'userCount' => $user ? User::query()->count() : 0,
            'roleCount' => $user ? Role::query()->count() : 0,
            'journalEntryCount' => $user ? $this->journalEntryCount($current?->id) : 0,
            'syncExceptionCount' => $user ? $this->syncExceptionCount($current?->id) : 0,
        ];
    }

    private function journalEntryCount(?int $entityId): int
    {
        try {
            if (! Schema::hasTable('journal_entries')) {
                return 0;
            }

            $query = DB::table('journal_entries')->whereIn('status', ['draft', 'pending']);
            if ($entityId) {
                $query->where('entity_id', $entityId);
            }

            return (int) $query->count();
        } catch (\Throwable) {
            return 0;
        }
    }

    private function syncExceptionCount(?int $entityId): int
    {
        try {
            if (! Schema::hasTable('sync_documents')) {
                return 0;
            }

            $query = DB::table('sync_documents')->where('status', 'failed');
            if ($entityId) {
                $query->where('entity_id', $entityId);
            }

            return (int) $query->count();
        } catch (\Throwable) {
            return 0;
        }
    }
}
