<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PostingRule extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id',
        'event',
        'name',
        'debit_account_id',
        'credit_account_id',
        'condition',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'condition' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** Event prefix of a rule that gives one optical service its own revenue account. */
    public const SERVICE_EVENT_PREFIX = 'sale_service:';

    /**
     * The event of the revenue rule for an optical service fee (by its optical-new id), or null without one.
     */
    public static function serviceEvent(mixed $opticalServiceId): ?string
    {
        return filled($opticalServiceId) && is_numeric($opticalServiceId) ? self::SERVICE_EVENT_PREFIX.(int) $opticalServiceId : null;
    }

    public function isServiceRevenueRule(): bool
    {
        return str_starts_with((string) $this->event, self::SERVICE_EVENT_PREFIX);
    }

    public function debitAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'debit_account_id');
    }

    public function creditAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'credit_account_id');
    }
}
