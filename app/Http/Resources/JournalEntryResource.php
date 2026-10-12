<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class JournalEntryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'entry_no' => $this->entry_no,
            'journal_id' => $this->journal_id,
            'journal' => $this->whenLoaded('journal', function () {
                return [
                    'id' => $this->journal?->id,
                    'code' => $this->journal?->code,
                    'name' => $this->journal?->name,
                    'type' => $this->journal?->type,
                ];
            }),
            'accounting_period_id' => $this->accounting_period_id,
            'entry_date' => $this->entry_date?->toDateString(),
            'reference' => $this->reference,
            'memo' => $this->memo,
            'status' => $this->status,
            'total_debit' => (float) $this->total_debit,
            'total_credit' => (float) $this->total_credit,
            'source_system' => $this->source_system,
            'prepared_by' => $this->prepared_by,
            'posted_by' => $this->posted_by,
            'posted_at' => $this->posted_at
                ?->copy()
                ?->timezone('Asia/Manila')
                ?->toIso8601String(),
            'voided_by' => $this->voided_by,
            'voided_at' => $this->voided_at
                ?->copy()
                ?->timezone('Asia/Manila')
                ?->toIso8601String(),
            'prepared_by_user' => $this->whenLoaded('preparedByUser', function () {
                return [
                    'id' => $this->preparedByUser?->id,
                    'name' => $this->preparedByUser?->name ?? $this->preparedByUser?->username,
                ];
            }),
            'posted_by_user' => $this->whenLoaded('postedByUser', function () {
                return [
                    'id' => $this->postedByUser?->id,
                    'name' => $this->postedByUser?->name ?? $this->postedByUser?->username,
                ];
            }),
            'voided_by_user' => $this->whenLoaded('voidedByUser', function () {
                return [
                    'id' => $this->voidedByUser?->id,
                    'name' => $this->voidedByUser?->name ?? $this->voidedByUser?->username,
                ];
            }),
            'lines' => $this->whenLoaded('lines', function () {
                return $this->lines->map(fn ($line) => [
                    'id' => $line->id,
                    'line_no' => $line->line_no,
                    'account_id' => $line->account_id,
                    'account' => $line->relationLoaded('account') && $line->account ? [
                        'id' => $line->account->id,
                        'code' => $line->account->code,
                        'name' => $line->account->name,
                    ] : null,
                    'debit' => (float) $line->debit,
                    'credit' => (float) $line->credit,
                    'memo' => $line->memo,
                    'cost_center_id' => $line->cost_center_id,
                    'cost_center' => $line->relationLoaded('costCenter') && $line->costCenter ? [
                        'id' => $line->costCenter->id,
                        'code' => $line->costCenter->code,
                        'name' => $line->costCenter->name,
                    ] : null,
                ])->values()->all();
            }),
            'created_at' => $this->created_at
                ?->copy()
                ?->timezone('Asia/Manila')
                ?->toIso8601String(),
            'updated_at' => $this->updated_at
                ?->copy()
                ?->timezone('Asia/Manila')
                ?->toIso8601String(),
        ];
    }
}
