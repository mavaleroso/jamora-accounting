<?php

namespace App\Http\Middleware;

use App\Support\Audit\AuditLogger;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Opens an audit batch for the request (so every change it makes is grouped), and afterwards records
 * write requests that changed no model through Eloquent. Model changes themselves are recorded by
 * AuditLogger's Eloquent listeners.
 */
class AuditTrailMiddleware
{
    public function __construct(private AuditLogger $audit) {}

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $this->audit->beginBatch($request);

        $response = $next($request);

        $this->audit->finishRequest($request, $response);

        return $response;
    }
}
