<?php

namespace App\Http\Requests\Libraries;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CostCenterUpdateRequest extends FormRequest
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
        $costCenter = $this->route('costCenter');

        return [
            'code' => [
                'required',
                'string',
                'max:50',
                Rule::unique('cost_centers', 'code')->ignore($costCenter?->id),
            ],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ];
    }
}
