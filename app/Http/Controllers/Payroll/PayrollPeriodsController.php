<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\PayrollPeriod;
use App\Services\Payroll\PayrollService;
use App\Services\People\AttendanceCalculator;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Pay periods. Usually generated per month (1–15 and 16–end for semi-monthly, or the whole month);
 * a custom range can be added for off-cycle payrolls (final pay, special runs).
 */
class PayrollPeriodsController extends Controller
{
    /**
     * Periods are managed from the Payroll page.
     */
    public function index(Request $request): RedirectResponse
    {
        return redirect()->route('payroll.runs.index', array_filter(['year' => $request->query('year')]));
    }

    /**
     * Create the standard cut-offs of one or more months.
     */
    public function generate(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
            'months' => ['nullable', 'integer', 'min:1', 'max:12'],
            'frequency' => ['required', Rule::in([PayrollPeriod::FREQUENCY_SEMI_MONTHLY, PayrollPeriod::FREQUENCY_MONTHLY])],
            'first_pay_day' => ['nullable', 'integer', 'min:0', 'max:31'],
            'second_pay_day' => ['nullable', 'integer', 'min:0', 'max:31'],
        ]);

        $payDays = config('people.payroll.pay_days');
        $firstPay = (int) ($data['first_pay_day'] ?? $payDays['first']);
        $secondPay = (int) ($data['second_pay_day'] ?? $payDays['second']);
        $created = 0;
        $skipped = 0;
        $entityId = app(EntityContext::class)->id();
        $isHoliday = fn (Carbon $date) => app(AttendanceCalculator::class)->holidayFor($entityId, $date) !== null;

        for ($i = 0; $i < ($data['months'] ?? 1); $i++) {
            $month = Carbon::createFromFormat('Y-m-d', $data['month'].'-01')->addMonthsNoOverflow($i);
            $ranges = $data['frequency'] === PayrollPeriod::FREQUENCY_MONTHLY
                ? [[$month->copy(), $month->copy()->endOfMonth(), $month->format('Y-m'), $secondPay]]
                : [
                    [$month->copy(), $month->copy()->day(15), $month->format('Y-m').'-1', $firstPay],
                    [$month->copy()->day(16), $month->copy()->endOfMonth(), $month->format('Y-m').'-2', $secondPay],
                ];

            foreach ($ranges as [$start, $end, $suffix, $payDay]) {
                if ($this->overlaps($start, $end)) {
                    $skipped++;

                    continue;
                }

                PayrollPeriod::query()->create([
                    'code' => 'PP-'.$suffix,
                    'frequency' => $data['frequency'],
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'pay_date' => PayrollService::payDay($end, $payDay, $isHoliday)->toDateString(),
                    'status' => 'open',
                ]);
                $created++;
            }
        }

        $message = $created ? "{$created} pay period(s) created." : 'No new pay periods — they already exist.';
        if ($created && $skipped) {
            $message .= " {$skipped} skipped because they overlap existing periods.";
        }

        return redirect()->route('payroll.runs.index', ['year' => substr($data['month'], 0, 4)])->with('status', $message);
    }

    /**
     * A custom (off-cycle) period.
     */
    public function store(Request $request): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('payroll_periods', 'code')->where('entity_id', $entityId)],
            'frequency' => ['nullable', Rule::in([PayrollPeriod::FREQUENCY_SEMI_MONTHLY, PayrollPeriod::FREQUENCY_MONTHLY])],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'pay_date' => ['nullable', 'date', 'after_or_equal:end_date'],
        ], [
            'pay_date.after_or_equal' => 'Pay day cannot be before the cut-off ends.',
        ]);

        if ($this->overlaps(Carbon::parse($data['start_date']), Carbon::parse($data['end_date']))) {
            throw ValidationException::withMessages(['start_date' => 'This range overlaps an existing pay period.']);
        }

        PayrollPeriod::query()->create([
            ...$data,
            'frequency' => $data['frequency'] ?? PayrollPeriod::FREQUENCY_SEMI_MONTHLY,
            'status' => 'open',
        ]);

        return redirect()->back()->with('status', "Pay period {$data['code']} created.");
    }

    /**
     * Change a period's dates (e.g. a cut-off that does not follow the calendar halves). Only
     * before a payroll is computed for it.
     */
    public function update(Request $request, PayrollPeriod $payrollPeriod): RedirectResponse
    {
        if ($payrollPeriod->activeRun()->exists()) {
            throw ValidationException::withMessages(['status' => 'This period already has a payroll. Void the draft first.']);
        }

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('payroll_periods', 'code')->where('entity_id', $payrollPeriod->entity_id)->ignore($payrollPeriod->id)],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'pay_date' => ['nullable', 'date', 'after_or_equal:end_date'],
        ], [
            'pay_date.after_or_equal' => 'Pay day cannot be before the cut-off ends.',
        ]);

        if ($this->overlaps(Carbon::parse($data['start_date']), Carbon::parse($data['end_date']), $payrollPeriod->id)) {
            throw ValidationException::withMessages(['start_date' => 'This range overlaps another pay period.']);
        }

        $payrollPeriod->update($data);

        return redirect()->back()->with('status', "Pay period {$data['code']} updated.");
    }

    public function destroy(PayrollPeriod $payrollPeriod): RedirectResponse
    {
        if ($payrollPeriod->activeRun()->exists()) {
            throw ValidationException::withMessages(['status' => 'This period already has a payroll. Void the draft first.']);
        }

        $payrollPeriod->delete();

        return redirect()->back()->with('status', "Pay period {$payrollPeriod->code} removed.");
    }

    private function overlaps(Carbon $start, Carbon $end, ?int $exceptId = null): bool
    {
        return PayrollPeriod::query()
            ->whereDate('start_date', '<=', $end->toDateString())
            ->whereDate('end_date', '>=', $start->toDateString())
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))
            ->exists();
    }
}
