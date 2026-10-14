<?php

namespace App\Services\People;

use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\ShiftRoster;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Filing, review and withdrawal of day-level employee requests (see AttendanceRequest for the types).
 * Shared by Time & Attendance and Employee Requests so both enforce the same rules.
 */
class AttendanceRequestService
{
    private const PUNCHES = ['time_in', 'break_out', 'break_in', 'time_out'];

    public function __construct(protected AttendanceCalculator $attendanceCalculator) {}

    /**
     * Validation rules for filing. Type-specific checks that need the schedule or DTR run in file().
     */
    public function rules(): array
    {
        return [
            'request_type' => ['required', Rule::in(AttendanceRequest::TYPES)],
            'work_date' => ['required', 'date'],
            'dtr_entry_id' => ['nullable', 'exists:dtr_entries,id'],
            'requested_time_in' => ['nullable', 'date_format:H:i'],
            'requested_break_out' => ['nullable', 'date_format:H:i'],
            'requested_break_in' => ['nullable', 'date_format:H:i'],
            'requested_time_out' => ['nullable', 'date_format:H:i'],
            'requested_ot_hours' => ['nullable', 'required_if:request_type,overtime', 'numeric', 'min:0.5', 'max:12'],
            'destination' => ['nullable', 'required_if:request_type,official_business', 'string', 'max:255'],
            'requested_rest_day' => ['nullable', 'boolean'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'requested_ot_hours.required_if' => 'Enter how many overtime hours you plan to work.',
            'destination.required_if' => 'Where will you be? e.g. client site, supplier, government office.',
        ];
    }

    public function file(Employee $employee, array $data, ?User $filedBy = null): AttendanceRequest
    {
        $type = $data['request_type'];
        $date = Carbon::parse($data['work_date'])->startOfDay();
        $dateStr = $date->toDateString();
        $today = Carbon::today();

        $times = collect(self::PUNCHES)->mapWithKeys(fn ($k) => [
            "requested_{$k}" => filled($data["requested_{$k}"] ?? null) ? Carbon::parse($data["requested_{$k}"])->format('H:i:s') : null,
        ]);

        $dtr = DtrEntry::query()
            ->withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->whereDate('work_date', $dateStr)
            ->first();

        $this->attendanceCalculator->assertEditable($dtr, 'work_date');

        $restDay = false;

        switch ($type) {
            case AttendanceRequest::TYPE_CORRECTION:
                $this->assertNotFuture($date, $today);
                if ($times->filter()->isEmpty()) {
                    throw ValidationException::withMessages(['requested_time_in' => 'Enter at least one corrected time.']);
                }
                break;

            case AttendanceRequest::TYPE_OVERTIME:
                // Pre-approval: filed before the work is rendered. Payable OT is still capped at
                // the OT actually rendered when the day is computed (AttendanceCalculator::syncApprovedOt).
                $this->assertNotPast($date, $today, 'Overtime must be filed in advance — for today or a later day.');
                break;

            case AttendanceRequest::TYPE_OFFICIAL_BUSINESS:
                $this->assertWindow($times['requested_time_in'], $times['requested_time_out'], 'Enter when you leave for and return from the official business.');
                $times = $times->only(['requested_time_in', 'requested_time_out']);
                break;

            case AttendanceRequest::TYPE_UNDERTIME:
                $this->assertNotPast($date, $today, 'Undertime must be filed before you leave — for today or a later day.');
                if (! $times['requested_time_out']) {
                    throw ValidationException::withMessages(['requested_time_out' => 'Enter the time you need to leave.']);
                }
                if ($date->isSameDay($today) && $times['requested_time_out'] <= Carbon::now()->format('H:i:s')) {
                    throw ValidationException::withMessages(['requested_time_out' => 'That time has already passed. Undertime must be filed before you leave.']);
                }
                $schedule = $this->attendanceCalculator->scheduleFor($employee, $date);
                if ($schedule->isRestDay || ! $schedule->end) {
                    throw ValidationException::withMessages(['work_date' => 'You are not scheduled to work on this day.']);
                }
                if ($times['requested_time_out'] >= $schedule->end) {
                    throw ValidationException::withMessages([
                        'requested_time_out' => 'Your shift ends at '.Carbon::parse($schedule->end)->format('g:i A').'. Undertime must be earlier than that.',
                    ]);
                }
                $times = $times->only(['requested_time_out']);
                break;

            case AttendanceRequest::TYPE_SCHEDULE_CHANGE:
                $this->assertNotPast($date, $today, 'A change of schedule must be filed on or before the day itself.');
                $restDay = (bool) ($data['requested_rest_day'] ?? false);
                if ($restDay) {
                    $times = collect();
                } else {
                    $this->assertWindow($times['requested_time_in'], $times['requested_time_out'], 'Enter the new shift start and end.', allowOvernight: true);
                    $times = $times->only(['requested_time_in', 'requested_time_out']);
                }
                break;
        }

        $duplicate = AttendanceRequest::query()
            ->withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->whereDate('work_date', $dateStr)
            ->where('request_type', $type)
            ->where('status', 'pending')
            ->exists();

        if ($duplicate) {
            $label = strtolower(AttendanceRequest::LABELS[$type]);
            throw ValidationException::withMessages(['work_date' => "There is already a pending {$label} request for this day."]);
        }

        return AttendanceRequest::create([
            'entity_id' => $employee->entity_id,
            'employee_id' => $employee->id,
            'dtr_entry_id' => $dtr?->id ?? ($data['dtr_entry_id'] ?? null),
            'request_type' => $type,
            'work_date' => $dateStr,
            ...array_fill_keys(array_map(fn ($k) => "requested_{$k}", self::PUNCHES), null),
            ...$times->all(),
            'requested_ot_hours' => $type === AttendanceRequest::TYPE_OVERTIME ? $data['requested_ot_hours'] : null,
            'destination' => $type === AttendanceRequest::TYPE_OFFICIAL_BUSINESS ? $data['destination'] : null,
            'requested_rest_day' => $restDay,
            'reason' => $data['reason'],
            'status' => 'pending',
            'filed_by' => $filedBy?->id,
        ]);
    }

    /**
     * Approve or reject a pending request and apply its effect on the time record / roster.
     */
    public function review(AttendanceRequest $request, User $reviewer, string $status, ?string $remarks = null): AttendanceRequest
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['status' => "This request was already {$request->status}."]);
        }

        $employee = $request->employee;
        if ($employee?->user_id && $employee->user_id === $reviewer->id) {
            throw ValidationException::withMessages(['approver' => 'You cannot review your own request.']);
        }

        return DB::transaction(function () use ($request, $reviewer, $status, $remarks, $employee) {
            $dtr = DtrEntry::query()
                ->withoutEntityScope()
                ->where('employee_id', $employee->id)
                ->whereDate('work_date', $request->work_date)
                ->first();

            if ($status === 'approved') {
                $this->attendanceCalculator->assertEditable($dtr, 'status');
            }

            $request->fill([
                'status' => $status,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'review_remarks' => $remarks,
            ]);
            if ($dtr) {
                $request->dtr_entry_id ??= $dtr->id;
            }
            // Saved before applying: payable OT and the daily close read approved requests.
            $request->save();

            if ($status === 'approved') {
                $this->apply($request, $employee, $dtr, $reviewer);
            }

            return $request->fresh();
        });
    }

    public function cancel(AttendanceRequest $request): AttendanceRequest
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'Only pending requests can be cancelled.']);
        }

        $request->update(['status' => 'cancelled']);

        return $request;
    }

    protected function apply(AttendanceRequest $request, Employee $employee, ?DtrEntry $dtr, User $reviewer): void
    {
        $date = $request->work_date->toDateString();

        switch ($request->request_type) {
            case AttendanceRequest::TYPE_CORRECTION:
                $dtr ??= new DtrEntry([
                    'entity_id' => $request->entity_id,
                    'employee_id' => $employee->id,
                    'work_date' => $date,
                ]);
                foreach (self::PUNCHES as $field) {
                    if ($request->{"requested_{$field}"}) {
                        $dtr->{$field} = $request->{"requested_{$field}"};
                    }
                }
                $dtr->source = $dtr->source ?: 'correction';
                $dtr->notes = trim(($dtr->notes ?? '')." [Correction approved: {$request->reason}]");
                $this->attendanceCalculator->compute($dtr, $employee)->save();
                $request->update(['dtr_entry_id' => $request->dtr_entry_id ?? $dtr->id]);
                break;

            case AttendanceRequest::TYPE_OVERTIME:
                // No record means no OT rendered, so there is nothing to pay — don't create an empty day.
                if ($dtr) {
                    $this->attendanceCalculator->syncApprovedOt($dtr);
                    $dtr->notes = trim(($dtr->notes ?? '')." [OT approved: {$request->requested_ot_hours} hrs]");
                    $dtr->save();
                }
                break;

            case AttendanceRequest::TYPE_OFFICIAL_BUSINESS:
                // Future days are filled by the daily close once the day has passed.
                if ($request->work_date->lte(Carbon::today())) {
                    $dtr = $this->attendanceCalculator->applyOfficialBusiness($dtr, $employee, $request);
                    $dtr->save();
                    $request->update(['dtr_entry_id' => $dtr->id]);
                }
                break;

            case AttendanceRequest::TYPE_UNDERTIME:
                // Authorised early out: undertime is still deducted (Art. 88), only the record is annotated.
                if ($dtr) {
                    $leaveAt = Carbon::parse($request->requested_time_out)->format('g:i A');
                    $dtr->notes = trim(($dtr->notes ?? '')." [Undertime approved: out at {$leaveAt}]");
                    $dtr->save();
                }
                break;

            case AttendanceRequest::TYPE_SCHEDULE_CHANGE:
                $current = $this->attendanceCalculator->scheduleFor($employee, $date);
                $roster = ShiftRoster::query()
                    ->withoutEntityScope()
                    ->where('employee_id', $employee->id)
                    ->whereDate('roster_date', $date)
                    ->first() ?? new ShiftRoster(['employee_id' => $employee->id, 'roster_date' => $date]);

                $roster->fill([
                    'entity_id' => $request->entity_id,
                    'shift_name' => $request->requested_rest_day ? 'Rest Day (change of schedule)' : 'Change of schedule',
                    'shift_start' => $request->requested_rest_day ? null : $request->requested_time_in,
                    'shift_end' => $request->requested_rest_day ? null : $request->requested_time_out,
                    'break_minutes' => $current->breakMinutes,
                    'grace_minutes' => $current->graceMinutes,
                    'is_rest_day' => (bool) $request->requested_rest_day,
                    'status' => ShiftRoster::STATUS_PUBLISHED,
                    'published_at' => now(),
                    'published_by' => $reviewer->id,
                    'notes' => "Approved change of schedule request #{$request->id}: {$request->reason}",
                ])->save();

                if ($dtr) {
                    $this->attendanceCalculator->compute($dtr, $employee)->save();
                }
                break;
        }
    }

    private function assertNotFuture(Carbon $date, Carbon $today): void
    {
        if ($date->gt($today)) {
            throw ValidationException::withMessages(['work_date' => 'You can only file this for today or past days.']);
        }
    }

    private function assertNotPast(Carbon $date, Carbon $today, string $message): void
    {
        if ($date->lt($today)) {
            throw ValidationException::withMessages(['work_date' => $message]);
        }
    }

    private function assertWindow(?string $from, ?string $to, string $missingMessage, bool $allowOvernight = false): void
    {
        if (! $from || ! $to) {
            throw ValidationException::withMessages(['requested_time_in' => $missingMessage]);
        }
        if (! $allowOvernight && $to <= $from) {
            throw ValidationException::withMessages(['requested_time_out' => 'The end time must be later than the start time.']);
        }
        if ($to === $from) {
            throw ValidationException::withMessages(['requested_time_out' => 'The start and end time cannot be the same.']);
        }
    }
}
