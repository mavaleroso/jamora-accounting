<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\RoleEnum;
use App\Support\MissingValue;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasRoles, Notifiable;

    /** The companies (entities) the user was given access to. An Admin opens every company regardless. */
    public function entities(): BelongsToMany
    {
        return $this->belongsToMany(Entity::class)
            ->withPivot('is_default')
            ->withTimestamps();
    }

    /**
     * The active companies the user can open: every one for an Admin (the owner), else those they were given. The
     * company switcher, the current company and the all-company pages (Employee Directory, Bank Accounts) all use this.
     *
     * @return Builder<Entity>
     */
    public function accessibleEntities(): Builder
    {
        $query = Entity::query()->where('entities.is_active', true);

        return $this->hasRole(RoleEnum::Admin->value)
            ? $query
            : $query->whereIn('entities.id', $this->entities()->pluck('entities.id'));
    }

    public function canOpenEntity(int $entityId): bool
    {
        return $this->accessibleEntities()->whereKey($entityId)->exists();
    }

    /**
     * Companies whose employees the Employee Directory lists: every active company for the Admin and the Accountant,
     * who keep all the companies' employee records; the companies they can open for everyone else. The company
     * switcher still follows accessibleEntities().
     */
    public function directoryEntities(): Builder
    {
        return $this->hasAnyRole([RoleEnum::Admin->value, RoleEnum::Accountant->value])
            ? Entity::query()->where('entities.is_active', true)
            : $this->accessibleEntities();
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }

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
    protected $appends = ['name'];

    /**
     * Get the display name (firstname + lastname, or username).
     */
    public function getNameAttribute(): string
    {
        $parts = array_filter([
            $this->firstname,
            $this->middlename,
            $this->lastname,
        ], fn ($part) => ! MissingValue::is($part));

        return trim(implode(' ', $parts)) ?: (string) $this->username;
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
            'birthdate' => 'date',
            'date_started' => 'date',
            'status' => 'boolean',
        ];
    }
}
