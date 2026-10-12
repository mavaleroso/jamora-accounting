<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BenefitProgram extends Model
{
    protected $fillable = [
        'code',
        'name',
        'category',
        'description',
        'default_employee_share',
        'default_employer_share',
        'is_taxable',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'default_employee_share' => 'decimal:2',
            'default_employer_share' => 'decimal:2',
            'is_taxable' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function employeeBenefits(): HasMany
    {
        return $this->hasMany(EmployeeBenefit::class);
    }
}

