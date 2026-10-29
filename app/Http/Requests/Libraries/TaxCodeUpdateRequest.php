<?php

namespace App\Http\Requests\Libraries;

use App\Support\EntityContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TaxCodeUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('rate_percent') && ! $this->has('rate')) {
            $this->merge([
                'rate' => round((float) $this->input('rate_percent') / 100, 4),
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $taxCode = $this->route('taxCode');

        return [
            'code' => [
                'required',
                'string',
                'max:50',
                Rule::unique('tax_codes', 'code')->where('entity_id', app(EntityContext::class)->id())->ignore($taxCode?->id),
            ],
            'name' => ['required', 'string', 'max:255'],
            'rate' => ['required', 'numeric', 'min:0', 'max:1'],
            'type' => ['required', 'string', 'max:50'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'is_active' => ['boolean'],
        ];
    }
}
