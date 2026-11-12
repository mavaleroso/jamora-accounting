<?php

namespace App\Http\Middleware;

use App\Services\Optical\OpticalSyncService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps the books level with the optical POS while people use accounting, with no scheduler needed:
 *
 *  - before a page is built, payments and orders that changed in the POS are booked, so the page already shows them
 *    (throttled by optical.auto_refresh_seconds, bounded by optical.auto_refresh_budget_seconds);
 *  - after the page has been sent, staff and stock are checked (optical.auto_refresh_slow_seconds), where nobody waits.
 *
 * Neither ever fails the page. Both stand aside while a scheduler is running.
 */
class KeepOpticalCurrent
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($this->applies($request)) {
            app(OpticalSyncService::class)->catchUp(budgetSeconds: max(1, (int) config('optical.auto_refresh_budget_seconds', 3)));
        }

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        if ($this->applies($request)) {
            app(OpticalSyncService::class)->catchUp(budgetSeconds: max(1, (int) config('optical.background_budget_seconds', 20)), slow: true);
        }
    }

    protected function applies(Request $request): bool
    {
        return $request->isMethod('GET') && $request->user() !== null && (int) config('optical.auto_refresh_seconds') > 0;
    }
}
