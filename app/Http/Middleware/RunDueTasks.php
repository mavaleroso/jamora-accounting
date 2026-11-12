<?php

namespace App\Http\Middleware;

use App\Services\DueTasks;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Does the housekeeping a scheduler would (closing finished attendance days, the compliance calendar) after a page
 * has been sent, so nobody waits on it and the app needs no scheduler. Checked at most every few minutes.
 */
class RunDueTasks
{
    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        if (! config('people.due_tasks_on_visits', true)) {
            return;
        }

        try {
            app(DueTasks::class)->run();
        } catch (Throwable $e) {
            report($e);
        }
    }
}
