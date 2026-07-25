<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, TwoFactorAuthenticatable, HasRoles;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'username',
        'email',
        'password',
        'firstname',
        'middlename',
        'lastname',
        'avatar',
        'address',
        'sex',
        'contact_number',
        'birthdate',
        'position',
        'date_started',
        'status',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'remember_token',
    ];

    /**
     * The accessors to append to the model's array form.
     *
     * @var list<string>
     */
    protected $appends = ['name', 'two_factor_enabled'];

    /**
     * Get the display name (firstname + lastname, or username).
     */
    public function getNameAttribute(): string
    {
        $parts = array_filter([
            $this->firstname,
            $this->middlename,
            $this->lastname,
        ]);

        return trim(implode(' ', $parts)) ?: (string) $this->username;
    }

    /**
     * Whether the user has two-factor authentication enabled.
     */
    public function getTwoFactorEnabledAttribute(): bool
    {
        return ! is_null($this->two_factor_confirmed_at);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
            'birthdate' => 'date',
            'date_started' => 'date',
            'status' => 'boolean',
        ];
    }
}
