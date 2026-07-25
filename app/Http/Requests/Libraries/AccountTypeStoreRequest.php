<?php

namespace App\Http\Requests\Libraries;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AccountTypeStoreRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255', 'unique:account_types,name'],
            'classification' => ['required', 'string', Rule::in(['asset', 'liability', 'equity', 'revenue', 'expense'])],
            'normal_balance' => ['required', 'string', Rule::in(['debit', 'credit'])],
            'statement' => ['required', 'string', Rule::in(['BS', 'IS'])],
        ];
    }
}
