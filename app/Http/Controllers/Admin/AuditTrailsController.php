<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditTrailResource;
use App\Models\AuditTrail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AuditTrailsController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 20);
        $pageSize = max(1, min(100, $pageSize));

        $query = AuditTrail::query()->with('user')->orderByDesc('created_at')->orderByDesc('id');
        $paginator = $query->paginate($pageSize);
        $resource = AuditTrailResource::collection(collect($paginator->items()))->toArray($request);

        return Inertia::render('admin/audit-trails/page', [
            'auditTrails' => $resource,
            'total' => $paginator->total(),
            'pageSize' => $pageSize,
        ]);
    }

    public function list(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['required', 'integer', 'min:1'],
            'per_page' => ['required', 'integer', 'min:1', 'max:100'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $query = AuditTrail::query()->with('user')->orderByDesc('created_at')->orderByDesc('id');

        $search = isset($validated['search']) ? trim($validated['search']) : '';
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $term = '%' . $search . '%';
                $q->where('action', 'like', $term)
                    ->orWhere('route_name', 'like', $term)
                    ->orWhere('subject_type', 'like', $term)
                    ->orWhere('subject_id', 'like', $term)
                    ->orWhere('method', 'like', $term)
                    ->orWhere('url', 'like', $term)
                    ->orWhere('ip_address', 'like', $term)
                    ->orWhere('description', 'like', $term)
                    ->orWhereHas('user', function ($q2) use ($term) {
                        $q2->where('username', 'like', $term)
                            ->orWhere('firstname', 'like', $term)
                            ->orWhere('lastname', 'like', $term);
                    });
            });
        }

        $paginator = $query->paginate(
            (int) $validated['per_page'],
            ['*'],
            'page',
            (int) $validated['page']
        );
        $resource = AuditTrailResource::collection(collect($paginator->items()))->toArray($request);

        return response()->json([
            'audit_trails' => $resource,
            'total' => $paginator->total(),
        ]);
    }
}
