<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\ShiftTemplate;
use App\Services\People\AttendanceCalculator;
use App\Services\People\WorkSchedule;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Libraries › Shifts: the current company's shift library. Shifts are offered when rostering a day; the company
 * default is the shift every employee works unless the roster sets another. Changing the hours of a shift in use
 * recalculates the time records payroll has not locked yet; published roster days keep the hours they were given.
 */
class ShiftsController extends Controller
{
    public function __construct(protected AttendanceCalculator $attendanceCalculator) {}

    public function index(EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();

        $shifts = ShiftTemplate::query()
            ->withCount(['employees', 'rosters'])
            ->orderByDesc('is_default')
            ->orderByDesc('is_active')
            ->orderBy('start_time')
            ->orderBy('name')
            ->get()
            ->map(fn (ShiftTemplate $s) => [
                ...$s->only(['id', 'code', 'name', 'start_time', 'end_time', 'break_minutes', 'grace_minutes', 'color', 'is_active', 'is_default']),
                'net_hours' => $s->net_hours,
                'employees_count' => $s->employees_count,
                'rosters_count' => $s->rosters_count,
            ]);

        return Inertia::render('libraries/shifts/page', [
            'shifts' => $shifts,
            'company' => $entityContext->current()?->only(['id', 'name']),
            // The shift in force when the library has no default yet.
            'defaultShift' => ShiftTemplate::defaultShift($entityId),
            // Active employees without a shift of their own: they work the company default.
            'followersCount' => Employee::query()->where('is_active', true)->whereNull('default_shift_template_id')->count(),
            'presetBreakMinutes' => WorkSchedule::presetBreakMinutes(),
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = (int) $entityContext->id();
        $data = $this->validated($request, $entityId);

        $shift = DB::transaction(function () use ($data, $entityId) {
            $shift = ShiftTemplate::query()->create([...$data, 'entity_id' => $entityId]);
            if ($shift->is_default) {
                $this->makeDefault($shift);
            }

            return $shift;
        });

        $note = $shift->is_default ? $this->applyToSchedules($shift, true) : '';

        return back()->with('status', "Shift {$shift->name} added.{$note}");
    }

    public function update(Request $request, EntityContext $entityContext, int $shift): RedirectResponse
    {
        $shift = $this->find($entityContext, $shift);
        $data = $this->validated($request, (int) $entityContext->id(), $shift);

        if ($shift->is_default && ! $data['is_default']) {
            throw ValidationException::withMessages(['is_default' => 'Make another shift the company default instead.']);
        }
        if ($shift->is_active && ! $data['is_active'] && ($used = $shift->employees()->count()) > 0) {
            throw ValidationException::withMessages(['is_active' => "{$used} ".str('employee')->plural($used).' work this shift. Give them another shift first.']);
        }

        $becomesDefault = ! $shift->is_default && $data['is_default'];
        $shift->fill($data);
        $hoursChanged = $shift->isDirty(['start_time', 'end_time', 'break_minutes', 'grace_minutes']);

        DB::transaction(function () use ($shift, $becomesDefault) {
            $shift->save();
            if ($becomesDefault) {
                $this->makeDefault($shift);
            }
        });

        $note = $hoursChanged || $becomesDefault ? $this->applyToSchedules($shift, $shift->is_default) : '';

        return back()->with('status', "Shift {$shift->name} saved.{$note}");
    }

    public function destroy(EntityContext $entityContext, int $shift): RedirectResponse
    {
        $shift = $this->find($entityContext, $shift);
        if ($shift->is_default) {
            throw ValidationException::withMessages(['shift' => 'The company default shift can’t be deleted. Make another shift the default first.']);
        }
        if (($used = $shift->employees()->count()) > 0) {
            throw ValidationException::withMessages(['shift' => "{$used} ".str('employee')->plural($used).' work this shift, so it can’t be deleted.']);
        }

        // Roster days made with it keep their own name and hours.
        $shift->delete();

        return back()->with('status', "Shift {$shift->name} deleted.");
    }

    /**
     * @return array{code: string, name: string, start_time: string, end_time: string, break_minutes: int, grace_minutes: int, color: string|null, is_active: bool, is_default: bool}
     */
    protected function validated(Request $request, int $entityId, ?ShiftTemplate $shift = null): array
    {
        $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:30', 'regex:/^[A-Za-z0-9_-]+$/', Rule::unique('shift_templates', 'code')->where('entity_id', $entityId)->ignore($shift?->id)],
            'name' => ['required', 'string', 'max:100'],
            'start_time' => ['required', 'date_format:H:i,H:i:s'],
            'end_time' => ['required', 'date_format:H:i,H:i:s'],
            'break_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'grace_minutes' => ['required', 'integer', 'min:0', 'max:60'],
            'color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'is_active' => ['boolean'],
            'is_default' => ['boolean'],
        ], [
            'code.regex' => 'Use letters, numbers, dashes or underscores only, e.g. MID-1019.',
            'code.unique' => 'Another shift of this company already uses this code.',
            'color.regex' => 'Pick one of the colours.',
        ]);

        $start = Carbon::parse($data['start_time']);
        $end = Carbon::parse($data['end_time']);
        if ($start->format('H:i') === $end->format('H:i')) {
            throw ValidationException::withMessages(['end_time' => 'The shift must end at a different time than it starts.']);
        }
        if ($end->lte($start)) {
            $end->addDay(); // overnight shift
        }
        if ((int) $data['break_minutes'] >= $start->diffInMinutes($end)) {
            throw ValidationException::withMessages(['break_minutes' => 'The unpaid break must be shorter than the shift.']);
        }

        $isDefault = (bool) ($data['is_default'] ?? false);
        if ($isDefault && ! ($data['is_active'] ?? true)) {
            throw ValidationException::withMessages(['is_active' => 'The company default shift must stay active.']);
        }

        return [
            'code' => $data['code'],
            'name' => $data['name'],
            'start_time' => $start->format('H:i:s'),
            'end_time' => Carbon::parse($data['end_time'])->format('H:i:s'),
            'break_minutes' => (int) $data['break_minutes'],
            'grace_minutes' => (int) $data['grace_minutes'],
            'color' => $data['color'] ?? null,
            'is_active' => (bool) ($data['is_active'] ?? true),
            'is_default' => $isDefault,
        ];
    }

    /**
     * A shift of the current company. Looked up here, not by route model binding: binding runs before the current
     * company is set, so it would find any company's shift.
     */
    protected function find(EntityContext $entityContext, int $id): ShiftTemplate
    {
        return ShiftTemplate::query()->withoutGlobalScope('entity')->where('entity_id', $entityContext->id())->findOrFail($id);
    }

    /** The shift becomes the company default; the previous default stays in the library as an ordinary shift. */
    protected function makeDefault(ShiftTemplate $shift): void
    {
        ShiftTemplate::query()->where('entity_id', $shift->entity_id)->whereKeyNot($shift->id)->where('is_default', true)->update(['is_default' => false]);
    }

    /**
     * Recalculate the open time records of everyone working the shift (for the default, everyone without a shift of
     * their own), and say whose preset break no longer fits its hours.
     */
    protected function applyToSchedules(ShiftTemplate $shift, bool $isDefault): string
    {
        $employees = Employee::query()
            ->withoutGlobalScope('entity')
            ->where('entity_id', $shift->entity_id)
            ->where(fn ($q) => $q->where('default_shift_template_id', $shift->id)->when($isDefault, fn ($q) => $q->orWhereNull('default_shift_template_id')))
            ->get(['id', 'break_start']);

        $recalculated = $this->attendanceCalculator->recomputeUnlocked($employees->pluck('id')->all());

        $offBreak = $shift->break_minutes > 0
            ? $employees->filter(fn (Employee $e) => $e->break_start && ! WorkSchedule::fitBreak($e->break_start, $shift->start_time, $shift->end_time, WorkSchedule::presetBreakMinutes()))->count()
            : $employees->whereNotNull('break_start')->count();

        return ($recalculated ? " {$recalculated} open time ".str('record')->plural($recalculated).' recalculated.' : '')
            .($offBreak ? " The preset break of {$offBreak} ".str('employee')->plural($offBreak).' no longer fits these hours; update it in the Employee Directory.' : '');
    }
}
