<?php

namespace App\Http\Requests\Libraries;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AccountTypeUpdateRequest extends FormRequest
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
        $accountType = $this->route('accountType');

        return [
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('account_types', 'name')->ignore($accountType?->id),
            ],
            'classification' => ['required', 'string', Rule::in(['asset', 'liability', 'equity', 'revenue', 'expense'])],
            'normal_balance' => ['required', 'string', Rule::in(['debit', 'credit'])],
            'statement' => ['required', 'string', Rule::in(['BS', 'IS'])],
        ];
    }
}
