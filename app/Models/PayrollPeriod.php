<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A pay period (cut-off). Status mirrors its active run: open -> processing -> posted -> paid.
 */
class PayrollPeriod extends Model
{
    use BelongsToEntity;

    public const FREQUENCY_SEMI_MONTHLY = 'semi_monthly';

    public const FREQUENCY_MONTHLY = 'monthly';

    protected $fillable = [
        'entity_id', 'code', 'frequency', 'start_date', 'end_date', 'pay_date', 'status',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'pay_date' => 'date',
        ];
    }

    public function isSemiMonthly(): bool
    {
        return $this->frequency !== self::FREQUENCY_MONTHLY;
    }

    /** The 16th–end cut-off of a semi-monthly payroll. */
    public function isSecondCutoff(): bool
    {
        return $this->isSemiMonthly() && $this->start_date->day > 15;
    }

    /** Pay periods per month: 2 for semi-monthly, 1 for monthly. */
    public function periodsPerMonth(): int
    {
        return $this->isSemiMonthly() ? 2 : 1;
    }

    public function runs(): HasMany
    {
        return $this->hasMany(PayrollRun::class);
    }

    /** The run that counts for this period (any run that is not voided). */
    public function activeRun(): HasOne
    {
        return $this->hasOne(PayrollRun::class)->where('status', '!=', PayrollRun::STATUS_VOID)->latestOfMany();
    }
}
