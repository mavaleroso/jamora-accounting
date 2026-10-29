<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\JournalEntry;
use App\Models\LeaveType;
use App\Models\ShiftTemplate;
use App\Models\SystemSetting;
use App\Services\People\AttendanceCalculator;
use App\Support\EntityContext;
use App\Support\SystemSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin › System Settings: company-wide policy only the owner changes.
 *  - Overtime: the unpaid break between the end of the shift and the start of overtime, and the time of day overtime
 *    stops counting.
 *  - Leave: how many days ahead leave that can be planned must be filed, and which leave types that covers.
 *  - Accounting: whether entries from source documents wait for the owner's approval before they reach the ledger.
 */
class SystemSettingsController extends Controller
{
    public function __construct(protected SystemSettings $settings) {}

    public function index(): Response
    {
        return Inertia::render('admin/system-settings/page', [
            'overtime' => [
                'break_minutes' => $this->settings->overtimeBreakMinutes(),
                'ceiling' => $this->settings->overtimeCeiling(),
                'minimum_minutes' => (int) config('people.timekeeping.ot_minimum_minutes', 30),
                'block_minutes' => (int) config('people.timekeeping.ot_block_minutes', 15),
            ],
            // The current company's default shift (Libraries › Shifts), for the example.
            'defaultShift' => collect(ShiftTemplate::defaultShift(app(EntityContext::class)->id()))->only(['name', 'end'])->all(),
            'leave' => [
                'min_notice_days' => $this->settings->leaveNoticeDays(),
                'long_leave_days' => $this->settings->longLeaveDays(),
                'long_leave_notice_days' => $this->settings->longLeaveNoticeDays(),
                'leave_types' => $this->settings->leaveNoticeTypes(),
                // Each active leave type, with the notice set on the type itself (the longer one applies).
                'types' => LeaveType::query()->where('is_active', true)->orderBy('sort_order')->get(['code', 'name', 'min_notice_days'])
                    ->map(fn (LeaveType $t) => ['code' => $t->code, 'name' => $t->name, 'own_notice_days' => (int) $t->min_notice_days])
                    ->values(),
            ],
            'accounting' => [
                'approve_source_documents' => $this->settings->approveSourceDocuments(),
                // Waiting across every company, so the owner sees what switching off leaves behind.
                'pending_count' => JournalEntry::query()->withoutGlobalScope('entity')->where('status', 'pending')->where('source_system', '!=', 'manual')->count(),
            ],
            'today' => now('Asia/Manila')->toDateString(),
            'lastChange' => [
                'overtime' => $this->lastChange('overtime.'),
                'leave' => $this->lastChange('leave.'),
                'accounting' => $this->lastChange('accounting.'),
            ],
        ]);
    }

    public function update(Request $request, AttendanceCalculator $attendanceCalculator): RedirectResponse
    {
        $validated = $request->validate([
            'overtime_break_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'overtime_ceiling' => ['nullable', 'date_format:H:i'],
        ], [
            'overtime_break_minutes.max' => 'The break before overtime cannot be longer than 4 hours (240 minutes).',
            'overtime_ceiling.date_format' => 'Enter the ceiling as a time of day, e.g. 12:00 AM.',
        ]);

        $changed = $this->settings->put([
            'overtime.break_minutes' => (int) $validated['overtime_break_minutes'],
            'overtime.ceiling' => $validated['overtime_ceiling'] ?? null,
        ], $request->user()?->id);

        if ($changed === []) {
            return back()->with('status', 'Overtime settings saved. Nothing changed.');
        }

        // Records payroll has not locked yet follow the new rule, so one cut-off is never paid on two.
        $recomputed = $attendanceCalculator->recomputeUnlocked();

        return back()->with('status', 'Overtime settings saved. '.($recomputed === 0
            ? 'No open time record needed recalculating.'
            : "{$recomputed} open time ".str('record')->plural($recomputed).' recalculated.'));
    }

    public function updateLeave(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'min_notice_days' => ['required', 'integer', 'min:0', 'max:90'],
            // Left out = unchanged.
            'long_leave_days' => ['nullable', 'integer', 'min:1', 'max:60'],
            'long_leave_notice_days' => ['nullable', 'integer', 'min:0', 'max:120'],
            'leave_types' => ['present', 'array'],
            'leave_types.*' => ['string', Rule::exists('leave_types', 'code')],
        ], [
            'min_notice_days.max' => 'The notice cannot be longer than 90 days.',
            'long_leave_notice_days.max' => 'The notice for long leave cannot be longer than 120 days.',
        ]);

        // Kept in the leave types' own order, so saving the same choice again changes nothing.
        $codes = LeaveType::query()->whereIn('code', $validated['leave_types'])->orderBy('sort_order')->pluck('code')->all();

        $changed = $this->settings->put([
            'leave.min_notice_days' => (int) $validated['min_notice_days'],
            'leave.long_leave_days' => (int) ($validated['long_leave_days'] ?? $this->settings->longLeaveDays()),
            'leave.long_leave_notice_days' => (int) ($validated['long_leave_notice_days'] ?? $this->settings->longLeaveNoticeDays()),
            'leave.notice_leave_types' => $codes,
        ], $request->user()?->id);

        return back()->with('status', $changed === []
            ? 'Leave settings saved. Nothing changed.'
            : 'Leave settings saved. They apply to leave filed from now on; requests already filed are not affected.');
    }

    public function updateAccounting(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'approve_source_documents' => ['required', 'boolean'],
        ]);

        $changed = $this->settings->put([
            'accounting.approve_source_documents' => (bool) $validated['approve_source_documents'],
        ], $request->user()?->id);

        return back()->with('status', match (true) {
            $changed === [] => 'Accounting settings saved. Nothing changed.',
            (bool) $validated['approve_source_documents'] => 'Entries from source documents now wait for approval before they reach the ledger.',
            default => 'Entries from source documents now post as soon as they are recorded. Entries already waiting still need approval.',
        });
    }

    /**
     * When a section's settings were last saved, and by whom.
     *
     * @return array{at: string|null, by: string|null}|null
     */
    protected function lastChange(string $prefix): ?array
    {
        $last = SystemSetting::query()
            ->with('updater')
            ->whereIn('key', array_filter(array_keys(SystemSettings::DEFAULTS), fn (string $key) => str_starts_with($key, $prefix)))
            ->latest('updated_at')
            ->first();

        return $last ? ['at' => $last->updated_at?->toISOString(), 'by' => $last->updater?->name] : null;
    }
}
