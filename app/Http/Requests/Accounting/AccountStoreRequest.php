<?php

namespace App\Http\Requests\Accounting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AccountStoreRequest extends FormRequest
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
            'code' => ['required', 'string', 'max:50', 'unique:accounts,code'],
            'name' => ['required', 'string', 'max:255'],
            'account_type_id' => ['required', 'integer', 'exists:account_types,id'],
            'parent_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'is_postable' => ['boolean'],
            'is_active' => ['boolean'],
            'cash_flow_section' => ['nullable', 'string', Rule::in(['operating', 'investing', 'financing'])],
            'description' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
