<?php

namespace App\Http\Requests\Settings;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The personal details a user keeps up to date themselves. They are saved to the login (Users) and to every employee
 * record linked to it (Employee Directory); username, role, position and employment stay with the administrators.
 */
class ProfileUpdateRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<int, \Illuminate\Contracts\Validation\Rule|array<mixed>|string>>
     */
    public function rules(): array
    {
        $user = $this->user();
        $isEmployee = Employee::query()->withoutGlobalScope('entity')->where('user_id', $user->id)->exists();

        return [
            'firstname' => ['required', 'string', 'max:100'],
            'middlename' => ['nullable', 'string', 'max:100'],
            'lastname' => ['required', 'string', 'max:100'],
            'email' => [
                'nullable',
                'string',
                'email',
                'max:150',
                Rule::unique(User::class)->ignore($user->id),
            ],
            'address' => ['nullable', 'string', 'max:255'],
            'sex' => ['nullable', 'string', 'max:50'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            // An employee record refuses a birth date too recent for someone working (RA 9231).
            'birthdate' => ['nullable', 'date', ...($isEmployee ? ['before_or_equal:'.now()->subYears(Employee::MIN_WORKING_AGE)->toDateString()] : [])],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'remove_avatar' => ['nullable', 'boolean'],
            // Kept on the employee record only.
            'civil_status' => ['nullable', 'string', 'in:single,married,widowed,separated,solo_parent'],
            'emergency_contact_name' => ['nullable', 'string', 'max:150'],
            'emergency_contact_relationship' => ['nullable', 'string', 'max:50'],
            'emergency_contact_phone' => ['nullable', 'string', 'max:50'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'avatar.max' => 'The photo must not be larger than 2 MB.',
            'avatar.mimes' => 'The photo must be a JPG, PNG or WebP image.',
            'birthdate.before_or_equal' => 'You must be at least '.Employee::MIN_WORKING_AGE.' years old (RA 9231).',
            'email.unique' => 'This email already belongs to another user.',
        ];
    }
}
