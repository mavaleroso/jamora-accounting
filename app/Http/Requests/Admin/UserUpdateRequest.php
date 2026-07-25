<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserUpdateRequest extends FormRequest
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
        $user = $this->route('user');

        return [
            'role' => ['required', 'string', 'exists:roles,name'],
            'permissions_present' => ['nullable', 'boolean'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
            'username' => [
                'required',
                'string',
                'max:255',
                Rule::unique(User::class)->ignore($user),
            ],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique(User::class)->ignore($user),
            ],
            'password' => ['nullable', 'string', Password::defaults()],
            'firstname' => ['required', 'string', 'max:255'],
            'middlename' => ['nullable', 'string', 'max:255'],
            'lastname' => ['required', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:500'],
            'sex' => ['required', 'string', 'max:50'],
            'contact_number' => ['required', 'string', 'max:50'],
            'birthdate' => ['required', 'date'],
            'position' => ['required', 'string', 'max:255'],
            'date_started' => ['required', 'date'],
            'avatar' => ['nullable', 'image', 'max:2048'],
        ];
    }
}
