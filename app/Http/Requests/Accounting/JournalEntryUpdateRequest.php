<?php

namespace App\Http\Requests\Accounting;

use Illuminate\Foundation\Http\FormRequest;

class JournalEntryUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'journal_id' => ['required', 'integer', 'exists:journals,id'],
            'entry_date' => ['required', 'date'],
            'reference' => ['nullable', 'string', 'max:255'],
            'memo' => ['nullable', 'string', 'max:2000'],
            'status' => ['nullable', 'string', 'in:draft,pending'],
            'lines' => ['required', 'array', 'min:2'],
            'lines.*.account_id' => ['required', 'integer', 'exists:accounts,id'],
            'lines.*.debit' => ['required', 'numeric', 'min:0'],
            'lines.*.credit' => ['required', 'numeric', 'min:0'],
            'lines.*.memo' => ['nullable', 'string', 'max:500'],
            'lines.*.cost_center_id' => ['nullable', 'integer', 'exists:cost_centers,id'],
        ];
    }
}
