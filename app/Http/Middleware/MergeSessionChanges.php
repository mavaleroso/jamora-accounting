<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Saves only what this request changed in the session, on top of what the session holds by then.
 *
 * A session is read when a request starts and written back whole when it ends. Several requests are often in flight
 * at once (a page still loading, a prefetch, deferred figures, the optical check and its progress polling), so one
 * that started earlier and ends later would write back the session as it was at its start, undoing what a quicker
 * request saved in between: the admin/employee view or the company just switched to would flip back.
 *
 * Here the session is read again once the request has been handled, and only the keys this request itself added,
 * changed or removed are applied to it.
 */
class MergeSessionChanges
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->hasSession()) {
            return $next($request);
        }

        $session = $request->session();
        $id = $session->getId();
        $before = $session->all();

        $response = $next($request);

        // A new session id (sign-in, sign-out) is a new session: there is nothing saved under it to merge with.
        if ($session->getId() !== $id) {
            return $response;
        }

        $after = $session->all();
        $session->start(); // reads the saved session over the one in memory

        foreach ($after as $key => $value) {
            if (! array_key_exists($key, $before) || $before[$key] !== $value) {
                $session->put($key, $value);
            }
        }
        foreach (array_diff_key($before, $after) as $key => $_) {
            $session->forget($key);
        }

        return $response;
    }
}
