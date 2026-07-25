<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;

class PermissionUpdateRequest extends FormRequest
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
        /** @var Permission|string|int|null $permission */
        $permission = $this->route('permission');
        $permissionId = $permission instanceof Permission ? $permission->id : $permission;

        return [
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('permissions', 'name')->ignore($permissionId),
            ],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['string', 'exists:roles,name'],
        ];
    }
}
