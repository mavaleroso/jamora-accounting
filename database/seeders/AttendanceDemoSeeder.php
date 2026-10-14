<?php

namespace Database\Seeders;

use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Services\People\AttendanceCalculator;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * Two weeks of realistic punches for the EMP-10xx sample employees (EmployeeDirectorySeeder),
 * so every Time & Attendance view has something to show:
 *  - lates, undertime, overtime (some approved via request), missing check-outs, an outside-geofence punch
 *  - days older than this week approved; this week open for review
 *  - pending correction / OT requests
 *  - today's punches only up to the current time (live board)
 *
 * Deterministic (seeded RNG) and idempotent: it rewrites only the sample employees' records.
 */
class AttendanceDemoSeeder extends Seeder
{
    public function run(AttendanceCalculator $calculator): void
    {
        $entity = Entity::query()->where('code', 'A_JAMORA')->first() ?? Entity::query()->first();
        if (! $entity) {
            return;
        }

        $employees = Employee::query()->withoutGlobalScopes()
            ->where('entity_id', $entity->id)
            ->where('employee_code', 'like', 'EMP-10%')
            ->where('employment_status', 'active')
            ->orderBy('employee_code')
            ->get();

        if ($employees->isEmpty()) {
            $this->command?->warn('Run EmployeeDirectorySeeder first.');

            return;
        }

        $ids = $employees->pluck('id');
        $from = Carbon::today()->subDays(13);
        AttendanceRequest::query()->withoutGlobalScopes()->whereIn('employee_id', $ids)->whereDate('work_date', '>=', $from)->delete();
        DtrEntry::query()->withoutGlobalScopes()->whereIn('employee_id', $ids)->whereDate('work_date', '>=', $from)->delete();

        mt_srand(20261014);
        $now = Carbon::now();
        $weekStart = Carbon::today()->startOfWeek();
        $approver = \App\Models\User::query()->orderBy('id')->value('id');

        for ($date = $from->copy(); $date->lte(Carbon::today()); $date->addDay()) {
            $isToday = $date->isToday();

            foreach ($employees as $i => $employee) {
                if ($employee->hire_date && $employee->hire_date->gt($date)) {
                    continue;
                }

                $schedule = $calculator->scheduleFor($employee, $date);
                if ($schedule->isRestDay || ! $schedule->start) {
                    continue;
                }

                $roll = mt_rand(1, 100);
                if ($roll <= 4 && ! $isToday) {
                    continue; // no-show -> daily close marks absent
                }

                $start = Carbon::parse($date->toDateString().' '.$schedule->start);
                $end = Carbon::parse($date->toDateString().' '.$schedule->end);

                $in = $start->copy()->addMinutes($roll <= 18 ? mt_rand(8, 45) : -mt_rand(0, 15));
                $breakOut = $start->copy()->addHours(4)->addMinutes(mt_rand(-10, 20));
                $breakIn = $breakOut->copy()->addMinutes(mt_rand(50, 72));
                $out = $end->copy()->addMinutes(match (true) {
                    $roll > 88 => mt_rand(45, 150), // overtime
                    $roll > 82 => -mt_rand(20, 60), // undertime
                    default => mt_rand(0, 12),
                });

                $skipBreak = $roll % 17 === 0;
                $forgotOut = ! $isToday && $roll % 23 === 0;

                // Today: only what has happened by now
                $punches = [
                    'time_in' => $in,
                    'break_out' => $skipBreak ? null : $breakOut,
                    'break_in' => $skipBreak ? null : $breakIn,
                    'time_out' => $forgotOut ? null : $out,
                ];
                if ($isToday) {
                    if ($i % 7 === 3) {
                        continue; // a few haven't arrived yet
                    }
                    $punches = array_map(fn ($t) => $t && $t->lte($now) ? $t : null, $punches);
                    if (! $punches['time_in']) {
                        continue;
                    }
                    if (! $punches['break_out']) {
                        $punches['break_in'] = null;
                    }
                }

                $outside = $roll === 50;
                $dtr = new DtrEntry([
                    'entity_id' => $entity->id,
                    'employee_id' => $employee->id,
                    'work_date' => $date->toDateString(),
                    'source' => $i % 3 === 0 ? 'biometric' : 'web_geofence',
                    'location_status' => $outside ? 'out_of_bounds' : 'verified',
                    'distance_meters' => $outside ? mt_rand(420, 900) : mt_rand(5, 120),
                    'status' => DtrEntry::STATUS_OPEN,
                ]);
                foreach ($punches as $field => $time) {
                    $dtr->{$field} = $time?->format('H:i:s');
                }
                if ($skipBreak && $punches['time_out']) {
                    $dtr->notes = 'Working lunch — walk-in patients.';
                }

                $calculator->compute($dtr, $employee);

                // Older weeks are reviewed; their OT was approved through an OT request (the only way OT becomes payable).
                if ($date->lt($weekStart) && $dtr->attendance_status !== 'incomplete') {
                    if ((float) $dtr->ot_hours > 0) {
                        $this->fileRequest([
                            'entity_id' => $entity->id,
                            'employee_id' => $employee->id,
                            'request_type' => AttendanceRequest::TYPE_OVERTIME,
                            'work_date' => $date->toDateString(),
                            'requested_ot_hours' => $dtr->ot_hours,
                            'reason' => 'Extended clinic hours for scheduled patients.',
                            'status' => 'approved',
                            'reviewed_by' => $approver,
                            'reviewed_at' => $date->copy()->addDay()->setTime(9, 30),
                            'created_at' => $date->copy()->setTime(19, 0),
                        ]);
                        $calculator->syncApprovedOt($dtr);
                    }
                    $dtr->status = DtrEntry::STATUS_APPROVED;
                    $dtr->approved_by = $approver;
                    $dtr->approved_at = $date->copy()->addDays(2)->setTime(10, 0);
                }

                $dtr->save();
            }

            if (! $isToday) {
                $calculator->closeDay($entity->id, $date);
            }
        }

        $this->seedRequests($ids->all());

        $this->command?->info('Seeded attendance for '.$employees->count().' employees since '.$from->toDateString().'.');
    }

    /**
     * Bypasses mass assignment so the demo can back-date created_at.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function fileRequest(array $attributes): void
    {
        (new AttendanceRequest)->forceFill($attributes)->save();
    }

    /**
     * Pending requests that match real gaps in this week's records.
     *
     * @param  array<int, int>  $employeeIds
     */
    private function seedRequests(array $employeeIds): void
    {
        $open = DtrEntry::query()->withoutGlobalScopes()
            ->whereIn('employee_id', $employeeIds)
            ->where('status', DtrEntry::STATUS_OPEN)
            ->whereDate('work_date', '<', Carbon::today())
            ->orderBy('work_date')
            ->get();

        $filed = 0;

        foreach ($open->where('attendance_status', 'incomplete')->take(3) as $dtr) {
            $this->fileRequest([
                'entity_id' => $dtr->entity_id,
                'employee_id' => $dtr->employee_id,
                'dtr_entry_id' => $dtr->id,
                'request_type' => AttendanceRequest::TYPE_CORRECTION,
                'work_date' => $dtr->work_date,
                'requested_time_out' => $dtr->scheduled_out,
                'reason' => 'Forgot to check out — left right at end of shift.',
                'status' => 'pending',
                'created_at' => Carbon::parse($dtr->work_date)->addDay()->setTime(9, 12),
            ]);
            $filed++;
        }

        foreach ($open->filter(fn ($d) => (float) $d->ot_hours > 0)->take(3) as $dtr) {
            $this->fileRequest([
                'entity_id' => $dtr->entity_id,
                'employee_id' => $dtr->employee_id,
                'dtr_entry_id' => $dtr->id,
                'request_type' => AttendanceRequest::TYPE_OVERTIME,
                'work_date' => $dtr->work_date,
                'requested_ot_hours' => $dtr->ot_hours,
                'reason' => 'Stayed to finish a rush lens order for a same-day pickup.',
                'status' => 'pending',
                'created_at' => Carbon::parse($dtr->work_date)->setTime(20, 5),
            ]);
            $filed++;
        }

        $late = $open->filter(fn ($d) => (float) $d->tardiness_minutes > 0)->first();
        if ($late) {
            $this->fileRequest([
                'entity_id' => $late->entity_id,
                'employee_id' => $late->employee_id,
                'dtr_entry_id' => $late->id,
                'request_type' => AttendanceRequest::TYPE_CORRECTION,
                'work_date' => $late->work_date,
                'requested_time_in' => $late->scheduled_in,
                'reason' => 'Biometric scanner was not reading my finger, I arrived on time.',
                'status' => 'rejected',
                'review_remarks' => 'Branch log shows arrival after shift start.',
                'reviewed_at' => Carbon::parse($late->work_date)->addDay()->setTime(14, 0),
                'created_at' => Carbon::parse($late->work_date)->setTime(10, 0),
            ]);
        }
    }
}
