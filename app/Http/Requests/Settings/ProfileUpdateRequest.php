<?php

namespace App\Http\Requests\Settings;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProfileUpdateRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<int, \Illuminate\Contracts\Validation\Rule|array<mixed>|string>>
     */
    public function rules(): array
    {
        $userId = $this->user()->id;

        return [
            'firstname' => ['required', 'string', 'max:255'],
            'middlename' => ['nullable', 'string', 'max:255'],
            'lastname' => ['required', 'string', 'max:255'],
            'email' => [
                'nullable',
                'string',
                'email',
                'max:255',
                Rule::unique(User::class)->ignore($userId),
            ],
            'address' => ['nullable', 'string', 'max:500'],
            'sex' => ['nullable', 'string', 'max:50'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'birthdate' => ['nullable', 'date'],
            'date_started' => ['nullable', 'date'],
            'avatar' => ['nullable', 'image', 'max:2048'],
        ];
    }
}
