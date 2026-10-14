<?php

namespace App\Http\Resources;

use App\Models\AuditTrail;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/**
 * @mixin AuditTrail
 */
class AuditTrailResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $old = $this->old_values ?? [];
        $new = $this->new_values ?? [];
        $fields = array_values(array_unique([...array_keys($old), ...array_keys($new)]));

        return [
            'id' => $this->id,
            'created_at' => $this->created_at?->copy()->timezone('Asia/Manila')->toIso8601String(),
            'event' => $this->event ?? 'request',
            'action' => $this->action,
            'user' => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name ?: $this->user->username, 'username' => $this->user->username] : null,
            'entity' => $this->entity?->only(['id', 'code', 'name']),
            'subject' => [
                'type' => $this->subject_type,
                'type_label' => $this->subject_type ? self::typeLabel($this->subject_type) : null,
                'id' => $this->subject_id,
                'label' => $this->subject_label,
            ],
            'changes' => collect($fields)->map(fn (string $f) => [
                'field' => $f,
                'label' => Str::headline($f),
                'from' => $old[$f] ?? null,
                'to' => $new[$f] ?? null,
            ])->values(),
            'description' => $this->description,
            'source' => $this->source ?? 'web',
            'batch_id' => $this->batch_id,
            'request' => [
                'route' => $this->route_name,
                'method' => $this->method,
                'status' => $this->status_code,
                'url' => $this->url,
                'ip' => $this->ip_address,
                'user_agent' => $this->user_agent,
                'payload' => $this->request_payload,
            ],
        ];
    }

    /** App\Models\JournalEntry -> "Journal Entry"; Spatie\...\Role -> "Role" */
    public static function typeLabel(string $class): string
    {
        return Str::headline(class_basename($class));
    }
}
