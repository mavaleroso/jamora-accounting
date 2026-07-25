<?php

namespace App\Http\Requests\Libraries;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class JournalStoreRequest extends FormRequest
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
            'code' => ['required', 'string', 'max:50', 'unique:journals,code'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'max:50'],
            'sequence_prefix' => ['required', 'string', 'max:20'],
            'default_account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'next_sequence' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
