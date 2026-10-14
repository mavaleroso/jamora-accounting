<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Benefit / contribution program. entity_id = null means the program is shared by all entities
 * (e.g. SSS, PhilHealth, Pag-IBIG).
 *
 * contribution_basis: fixed | percent_of_basic | statutory_sss | statutory_philhealth | statutory_pagibig
 */
class BenefitProgram extends Model
{
    protected $fillable = [
        'entity_id',
        'code',
        'name',
        'category',
        'contribution_basis',
        'description',
        'default_employee_share',
        'default_employer_share',
        'employee_rate',
        'employer_rate',
        'is_taxable',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'default_employee_share' => 'decimal:2',
            'default_employer_share' => 'decimal:2',
            'employee_rate' => 'float',
            'employer_rate' => 'float',
            'is_taxable' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function scopeApplicableTo(Builder $query, ?int $entityId): Builder
    {
        return $query->where(function (Builder $q) use ($entityId) {
            $q->whereNull('entity_id');
            if ($entityId !== null) {
                $q->orWhere('entity_id', $entityId);
            }
        });
    }

    public function isStatutory(): bool
    {
        return str_starts_with((string) $this->contribution_basis, 'statutory_');
    }

    public function employeeBenefits(): HasMany
    {
        return $this->hasMany(EmployeeBenefit::class);
    }
}
