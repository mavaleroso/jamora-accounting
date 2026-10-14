<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShiftRoster extends Model
{
    use BelongsToEntity;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PUBLISHED = 'published';

    protected $fillable = [
        'entity_id',
        'employee_id',
        'shift_template_id',
        'roster_date',
        'shift_name',
        'shift_start',
        'shift_end',
        'break_minutes',
        'grace_minutes',
        'is_rest_day',
        'status',
        'published_at',
        'published_by',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'roster_date' => 'date',
            'is_rest_day' => 'boolean',
            'break_minutes' => 'integer',
            'grace_minutes' => 'integer',
            'published_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(ShiftTemplate::class, 'shift_template_id');
    }

    public function publisher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'published_by');
    }
}
