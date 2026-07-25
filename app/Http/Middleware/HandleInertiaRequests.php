<?php

namespace App\Http\Middleware;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Middleware;
use Spatie\Permission\Models\Role;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user() ? array_merge(
                    $request->user()->toArray(),
                    [
                        'avatar' => $request->user()->avatar
                            ? asset('storage/'.$request->user()->avatar)
                            : null,
                        'position' => $request->user()->position,
                        'roles' => $request->user()->getRoleNames()->values()->all(),
                        'permissions' => $request->user()->getAllPermissions()->pluck('name')->values()->all(),
                    ]
                ) : null,
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
            'userCount' => $request->user() ? User::query()->count() : 0,
            'roleCount' => $request->user() ? Role::query()->count() : 0,
            'journalEntryCount' => $request->user() ? $this->journalEntryCount() : 0,
            'syncExceptionCount' => $request->user() ? $this->syncExceptionCount() : 0,
        ];
    }

    private function journalEntryCount(): int
    {
        try {
            if (! Schema::hasTable('journal_entries')) {
                return 0;
            }

            return (int) DB::table('journal_entries')
                ->whereIn('status', ['draft', 'pending'])
                ->count();
        } catch (\Throwable) {
            return 0;
        }
    }

    private function syncExceptionCount(): int
    {
        try {
            if (! Schema::hasTable('sync_documents')) {
                return 0;
            }

            return (int) DB::table('sync_documents')
                ->where('status', 'failed')
                ->count();
        } catch (\Throwable) {
            return 0;
        }
    }
}
