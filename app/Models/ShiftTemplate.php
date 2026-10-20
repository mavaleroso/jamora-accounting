<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A shift in a company's shift library (Libraries › Shifts), offered when rostering a day. One shift per company is its
 * default: the shift every employee works unless the roster sets another for the day.
 */
class ShiftTemplate extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'code', 'name', 'start_time', 'end_time',
        'break_minutes', 'grace_minutes', 'color', 'is_active', 'is_default',
    ];

    protected function casts(): array
    {
        return [
            'break_minutes' => 'integer',
            'grace_minutes' => 'integer',
            'is_active' => 'boolean',
            'is_default' => 'boolean',
        ];
    }

    public function rosters(): HasMany
    {
        return $this->hasMany(ShiftRoster::class);
    }

    /** Employees given this shift as their own regular shift (most follow the company default instead). */
    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class, 'default_shift_template_id');
    }

    /**
     * @param  Builder<ShiftTemplate>  $query
     * @return Builder<ShiftTemplate>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Net paid hours of the shift (span less unpaid break). Handles overnight shifts.
     */
    public function getNetHoursAttribute(): float
    {
        $start = strtotime('2000-01-01 '.$this->start_time);
        $end = strtotime('2000-01-01 '.$this->end_time);
        if ($end <= $start) {
            $end += 86400;
        }

        return round(max(0, (($end - $start) / 60) - $this->break_minutes) / 60, 2);
    }

    /** The company's default shift in the library, if it has one. */
    public static function companyDefault(?int $entityId): ?self
    {
        return $entityId === null ? null : static::query()->withoutGlobalScope('entity')
            ->where('entity_id', $entityId)->where('is_default', true)->where('is_active', true)->first();
    }

    /**
     * The shift every employee of the company works unless the roster sets another for the day: its default in the
     * shift library, else config people.default_shift.
     *
     * @return array{id: int|null, name: string, start: string, end: string, break_minutes: int, grace_minutes: int}
     */
    public static function defaultShift(?int $entityId): array
    {
        $template = static::companyDefault($entityId);
        $config = config('people.default_shift');

        return $template ? [
            'id' => $template->id,
            'name' => $template->name,
            'start' => (string) $template->start_time,
            'end' => (string) $template->end_time,
            'break_minutes' => (int) $template->break_minutes,
            'grace_minutes' => (int) $template->grace_minutes,
        ] : [
            'id' => null,
            'name' => (string) $config['name'],
            'start' => (string) $config['start'],
            'end' => (string) $config['end'],
            'break_minutes' => (int) $config['break_minutes'],
            'grace_minutes' => (int) $config['grace_minutes'],
        ];
    }

    /**
     * Give a company a default shift in its library, from config people.default_shift, unless it has one.
     */
    public static function ensureDefault(int $entityId): self
    {
        if ($existing = static::companyDefault($entityId)) {
            return $existing;
        }

        $taken = static::query()->withoutGlobalScope('entity')->where('entity_id', $entityId)->pluck('code')->all();
        $code = collect(['REG', 'REG-2', 'REG-3', 'REG-4'])->first(fn (string $c) => ! in_array($c, $taken, true)) ?? 'REG-'.now()->format('His');
        $config = config('people.default_shift');

        return static::query()->withoutGlobalScope('entity')->create([
            'entity_id' => $entityId,
            'code' => $code,
            'name' => 'Regular Day Shift',
            'start_time' => $config['start'],
            'end_time' => $config['end'],
            'break_minutes' => (int) $config['break_minutes'],
            'grace_minutes' => (int) $config['grace_minutes'],
            'color' => '#3b82f6',
            'is_active' => true,
            'is_default' => true,
        ]);
    }
}
