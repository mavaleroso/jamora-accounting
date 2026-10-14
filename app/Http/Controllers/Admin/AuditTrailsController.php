<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditTrailResource;
use App\Models\AuditTrail;
use App\Models\Entity;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Read-only view of the audit trail: filter by date, user, action, record type, branch and record,
 * open a change to see its field-by-field diff, and export what is filtered.
 */
class AuditTrailsController extends Controller
{
    /** Times are stored in UTC and shown / filtered in Philippine time. */
    private const TZ = 'Asia/Manila';

    public function index(Request $request): Response
    {
        $filters = $this->filters($request);
        $perPage = max(10, min(100, (int) $request->query('per_page', 25)));

        $paginator = $this->query($filters)->with(['user:id,firstname,lastname,username', 'entity:id,code,name'])
            ->paginate($perPage)
            ->withQueryString();

        $today = Carbon::today(self::TZ)->utc(); // start of today, Manila time
        $week = AuditTrail::query()->where('created_at', '>=', $today->copy()->subDays(6))->selectRaw('event, count(*) as n')->groupBy('event')->pluck('n', 'event');

        return Inertia::render('admin/audit-trails/page', [
            'filters' => $filters,
            'items' => AuditTrailResource::collection(collect($paginator->items()))->toArray($request),
            'pagination' => [
                'page' => $paginator->currentPage(),
                'lastPage' => $paginator->lastPage(),
                'perPage' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'summary' => [
                'today' => AuditTrail::query()->where('created_at', '>=', $today)->count(),
                'usersToday' => AuditTrail::query()->where('created_at', '>=', $today)->whereNotNull('user_id')->distinct()->count('user_id'),
                'week' => [
                    'created' => (int) ($week['created'] ?? 0),
                    'updated' => (int) ($week['updated'] ?? 0),
                    'deleted' => (int) ($week['deleted'] ?? 0),
                    'other' => (int) ($week['request'] ?? 0) + (int) ($week['restored'] ?? 0),
                ],
            ],
            'options' => [
                'users' => User::query()->whereIn('id', AuditTrail::query()->whereNotNull('user_id')->distinct()->select('user_id'))
                    ->orderBy('firstname')->get(['id', 'firstname', 'lastname', 'username'])
                    ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name ?: $u->username]),
                'types' => AuditTrail::query()->whereNotNull('subject_type')->distinct()->orderBy('subject_type')->pluck('subject_type')
                    ->map(fn (string $t) => ['value' => $t, 'label' => AuditTrailResource::typeLabel($t)])->sortBy('label')->values(),
                'entities' => Entity::query()->orderBy('name')->get(['id', 'code', 'name']),
            ],
            'subject' => $filters['subject_type'] && $filters['subject_id']
                ? AuditTrail::query()->where('subject_type', $filters['subject_type'])->where('subject_id', $filters['subject_id'])->latest('id')->value('subject_label')
                : null,
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $this->filters($request);
        $name = 'audit-trail-'.now()->format('Ymd-His').'.csv';

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['When', 'User', 'Branch', 'Action', 'Record type', 'Record', 'Record ID', 'Field', 'Before', 'After', 'Source', 'Route', 'IP address', 'Batch']);
            $this->query($filters)->with(['user:id,firstname,lastname,username', 'entity:id,code'])->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $row) {
                    $base = [
                        $row->created_at?->timezone(self::TZ)->format('Y-m-d H:i:s'),
                        $row->user?->name ?? 'System',
                        $row->entity?->code,
                        $row->event,
                        $row->subject_type ? AuditTrailResource::typeLabel($row->subject_type) : '',
                        $row->subject_label ?? $row->description,
                        $row->subject_id,
                    ];
                    $tail = [$row->source, $row->route_name, $row->ip_address, $row->batch_id];
                    $fields = array_unique([...array_keys($row->old_values ?? []), ...array_keys($row->new_values ?? [])]);

                    if ($fields === []) {
                        fputcsv($out, [...$base, '', '', '', ...$tail]);

                        continue;
                    }
                    foreach ($fields as $field) {
                        $fmt = fn ($v) => is_array($v) ? json_encode($v) : (is_bool($v) ? ($v ? 'true' : 'false') : $v);
                        fputcsv($out, [...$base, $field, $fmt($row->old_values[$field] ?? null), $fmt($row->new_values[$field] ?? null), ...$tail]);
                    }
                }
            });
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv']);
    }

    // -----------------------------------------------------------------------------------------

    /**
     * @return array{search: string, event: ?string, user_id: ?int, subject_type: ?string, subject_id: ?string, entity_id: ?int, batch_id: ?string, from: ?string, to: ?string}
     */
    private function filters(Request $request): array
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:200'],
            'event' => ['nullable', 'in:created,updated,deleted,restored,request'],
            'user_id' => ['nullable', 'integer'],
            'subject_type' => ['nullable', 'string', 'max:255'],
            'subject_id' => ['nullable', 'string', 'max:100'],
            'entity_id' => ['nullable', 'integer'],
            'batch_id' => ['nullable', 'uuid'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        return [
            'search' => trim((string) ($data['search'] ?? '')),
            'event' => $data['event'] ?? null,
            'user_id' => isset($data['user_id']) ? (int) $data['user_id'] : null,
            'subject_type' => $data['subject_type'] ?? null,
            'subject_id' => $data['subject_id'] ?? null,
            'entity_id' => isset($data['entity_id']) ? (int) $data['entity_id'] : null,
            'batch_id' => $data['batch_id'] ?? null,
            'from' => $data['from'] ?? null,
            'to' => $data['to'] ?? null,
        ];
    }

    private function query(array $f): Builder
    {
        return AuditTrail::query()
            ->when($f['event'], fn ($q, $v) => $q->where('event', $v))
            ->when($f['user_id'], fn ($q, $v) => $q->where('user_id', $v))
            ->when($f['subject_type'], fn ($q, $v) => $q->where('subject_type', $v))
            ->when($f['subject_id'], fn ($q, $v) => $q->where('subject_id', $v))
            ->when($f['entity_id'], fn ($q, $v) => $q->where('entity_id', $v))
            ->when($f['batch_id'], fn ($q, $v) => $q->where('batch_id', $v))
            ->when($f['from'], fn ($q, $v) => $q->where('created_at', '>=', Carbon::parse($v, self::TZ)->startOfDay()->utc()))
            ->when($f['to'], fn ($q, $v) => $q->where('created_at', '<=', Carbon::parse($v, self::TZ)->endOfDay()->utc()))
            ->when($f['search'] !== '', function ($q) use ($f) {
                $term = '%'.Str::lower($f['search']).'%';
                $q->where(fn ($w) => $w
                    ->whereRaw('lower(subject_label) like ?', [$term])
                    ->orWhereRaw('lower(description) like ?', [$term])
                    ->orWhereRaw('lower(route_name) like ?', [$term])
                    ->orWhere('subject_id', $f['search'])
                    ->orWhere('ip_address', 'like', $term)
                    ->orWhereHas('user', fn ($u) => $u->whereRaw('lower(username) like ?', [$term])
                        ->orWhereRaw('lower(firstname) like ?', [$term])
                        ->orWhereRaw('lower(lastname) like ?', [$term])));
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }
}
