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
        // The employee's preset break for the day; null when none is set or it does not fit the day's shift.
        public readonly ?string $breakStart = null,
        public readonly ?string $breakEnd = null,
    ) {}

    /**
     * Length of every preset break: exactly one hour by company policy.
     */
    public static function presetBreakMinutes(): int
    {
        return (int) config('people.timekeeping.preset_break_minutes', 60);
    }

    /**
     * The break window [start, end] (H:i:s) when a break of the given length starting at $breakStart lies wholly
     * within the shift; null otherwise. Handles overnight shifts.
     *
     * @return array{0: string, 1: string}|null
     */
    public static function fitBreak(?string $breakStart, ?string $shiftStart, ?string $shiftEnd, int $breakMinutes): ?array
    {
        if (blank($breakStart) || blank($shiftStart) || blank($shiftEnd) || $breakMinutes <= 0) {
            return null;
        }

        $start = self::minutes($shiftStart);
        $end = self::minutes($shiftEnd);
        if ($end <= $start) {
            $end += 1440;
        }
        $from = self::minutes($breakStart);
        if ($from < $start) {
            $from += 1440;
        }
        $to = $from + $breakMinutes;

        return $to <= $end ? [self::clock($from), self::clock($to)] : null;
    }

    /**
     * Whether a break begun at $breakOut strays from the preset break start by more than the tolerance.
     */
    public function isOffBreakSchedule(?string $breakOut): bool
    {
        if ($this->breakStart === null || blank($breakOut)) {
            return false;
        }

        $diff = abs(self::minutes($breakOut) - self::minutes($this->breakStart));

        return min($diff, 1440 - $diff) > (int) config('people.timekeeping.break_tolerance_minutes', 15);
    }

    public function toArray(): array
    {
        return [
            'roster_id' => $this->rosterId,
            'shift_name' => $this->shiftName,
            'start' => $this->start,
            'end' => $this->end,
            'break_minutes' => $this->breakMinutes,
            'break_start' => $this->breakStart,
            'break_end' => $this->breakEnd,
            'grace_minutes' => $this->graceMinutes,
            'is_rest_day' => $this->isRestDay,
            'source' => $this->source,
        ];
    }

    private static function minutes(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time) + [1 => 0]);

        return $h * 60 + $m;
    }

    private static function clock(int $minutes): string
    {
        $minutes %= 1440;

        return sprintf('%02d:%02d:00', intdiv($minutes, 60), $minutes % 60);
    }
}
