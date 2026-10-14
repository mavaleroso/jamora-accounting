<?php

namespace App\Services\People;

/**
 * Effective work schedule of an employee for a given date.
 */
final class WorkSchedule
{
    public function __construct(
        public readonly ?int $rosterId,
        public readonly string $shiftName,
        public readonly ?string $start,
        public readonly ?string $end,
        public readonly int $breakMinutes,
        public readonly int $graceMinutes,
        public readonly bool $isRestDay,
        public readonly string $source, // roster | template | default
    ) {}

    public function toArray(): array
    {
        return [
            'roster_id' => $this->rosterId,
            'shift_name' => $this->shiftName,
            'start' => $this->start,
            'end' => $this->end,
            'break_minutes' => $this->breakMinutes,
            'grace_minutes' => $this->graceMinutes,
            'is_rest_day' => $this->isRestDay,
            'source' => $this->source,
        ];
    }
}

