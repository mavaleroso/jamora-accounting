<?php

namespace App\Services;

use App\Models\Entity;
use App\Models\SystemSetting;
use App\Services\People\AttendanceCalculator;
use App\Services\People\ComplianceCalendar;
use App\Support\EntityContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * The housekeeping a scheduler would do, done whenever it falls due, so the app needs no scheduler (shared
 * hosting): page visits call run() after the page has been sent, and a scheduler, where there is one, calls it too
 * ("housekeeping:run"). Each task is safe to repeat.
 *
 *  - Attendance: every finished day is closed once (absences, unworked holidays, leave, official business), from 01:00
 *    the next morning. Payroll relies on these rows. A day missed because nobody visited is closed on the next visit;
 *    how far it has got is kept in system_settings, so a cleared cache changes nothing.
 *  - Compliance: this month's and last month's statutory filings exist for every active company (checked daily).
 */
class DueTasks
{
    /** system_settings key: the last day attendance was closed for. */
    public const ATTENDANCE_CLOSED_THROUGH = 'automation.attendance_closed_through';

    protected const CHECKED = 'automation.due-tasks-checked';

    protected const COMPLIANCE_CHECKED = 'automation.compliance-checked';

    protected const LOCK = 'automation.due-tasks';

    /** A day is closed from this time the next morning, as the nightly job did. */
    public const CLOSE_AFTER = '01:00';

    public function __construct(
        protected AttendanceCalculator $attendance,
        protected ComplianceCalendar $compliance,
        protected EntityContext $context,
    ) {}

    /**
     * Do what is due.
     *
     * @param  bool  $force  check now, however recently it was checked
     * @param  int  $budgetSeconds  stop closing days after this long; the next call continues
     * @return array{days_closed: list<string>, compliance_created: int|null}|null null when it was checked a moment ago
     *                                                                             or is being done elsewhere
     */
    public function run(bool $force = false, int $budgetSeconds = 20): ?array
    {
        if (! $force && ! Cache::add(self::CHECKED, true, (int) config('people.due_tasks_check_seconds', 600))) {
            return null;
        }

        $lock = Cache::lock(self::LOCK, 600);
        if (! $lock->get()) {
            return null;
        }

        try {
            // Every company is worked through, whichever one the person browsing has open.
            return $this->context->runWithout(fn () => [
                'days_closed' => $this->closeFinishedDays(microtime(true) + $budgetSeconds),
                'compliance_created' => $this->ensureCompliance(),
            ]);
        } finally {
            $lock->release();
        }
    }

    /** The last day attendance has been closed for, or null before the first close. */
    public function closedThrough(): ?string
    {
        $value = SystemSetting::query()->find(self::ATTENDANCE_CLOSED_THROUGH)?->value;

        return is_string($value) && $value !== '' ? $value : null;
    }

    /** The latest day that may be closed now: yesterday once it is past CLOSE_AFTER, else the day before. */
    public function lastClosableDay(): string
    {
        $now = Carbon::now();
        $yesterday = Carbon::yesterday();

        return ($now->format('H:i') >= self::CLOSE_AFTER ? $yesterday : $yesterday->subDay())->toDateString();
    }

    /**
     * Close every finished day not closed yet, oldest first, until the deadline. The first time, only the latest
     * finished day is closed: older days were never closed automatically, and closing them now would mark people
     * absent for days before they used the system.
     *
     * @return list<string> the days closed
     */
    protected function closeFinishedDays(float $deadline): array
    {
        $last = $this->lastClosableDay();
        $through = $this->closedThrough() ?? Carbon::parse($last)->subDay()->toDateString();
        $closed = [];

        for ($day = Carbon::parse($through)->addDay(); $day->toDateString() <= $last; $day->addDay()) {
            if ($closed !== [] && microtime(true) >= $deadline) {
                break;
            }

            $date = $day->toDateString();
            foreach (Entity::query()->where('is_active', true)->get() as $entity) {
                try {
                    $this->attendance->closeDay($entity->id, $date);
                } catch (Throwable $e) {
                    // Retried on the next visit: the day is not marked closed.
                    report($e);

                    return $closed;
                }
            }

            SystemSetting::query()->updateOrCreate(['key' => self::ATTENDANCE_CLOSED_THROUGH], ['value' => $date]);
            $closed[] = $date;
        }

        return $closed;
    }

    /**
     * This month's and last month's compliance items for every active company, once a day.
     *
     * @return int|null items created, or null when already checked today
     */
    protected function ensureCompliance(): ?int
    {
        if (! Cache::add(self::COMPLIANCE_CHECKED, true, Carbon::now()->endOfDay())) {
            return null;
        }

        $created = 0;
        foreach (Entity::query()->where('is_active', true)->get() as $entity) {
            try {
                $created += $this->compliance->ensureRecent($entity->id);
            } catch (Throwable $e) {
                report($e);
                Cache::forget(self::COMPLIANCE_CHECKED);
            }
        }

        return $created;
    }
}
