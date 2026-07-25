<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditTrailResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user' => $this->whenLoaded('user', function () {
                return [
                    'id' => $this->user?->id,
                    'name' => $this->user?->name ?? $this->user?->username,
                    'username' => $this->user?->username,
                ];
            }),
            'action' => $this->action,
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'route_name' => $this->route_name,
            'method' => $this->method,
            'url' => $this->url,
            'ip_address' => $this->ip_address,
            'user_agent' => $this->user_agent,
            'request_payload' => $this->request_payload,
            'description' => $this->description,
            'created_at' => optional($this->created_at)
                ?->copy()
                ->timezone('Asia/Manila')
                ->toIso8601String(),
        ];
    }
}
