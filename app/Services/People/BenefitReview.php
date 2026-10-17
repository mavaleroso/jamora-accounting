<?php

namespace App\Services\People;

use App\Models\Employee;
use App\Models\EmployeeBenefit;
use Carbon\Carbon;

/**
 * Enrollment shares are fixed amounts that only HR changes. A salary change does not touch them; it
 * flags the enrollments whose share was worked out from salary (percent-of-basic programs) so HR can
 * review them in Benefits Administration.
 */
class BenefitReview
{
    public function __construct(protected BenefitCalculator $calculator) {}

    /**
     * Flag the employee's current enrollments whose salary-based share no longer matches the program
     * rate. Returns how many were flagged.
     */
    public function afterSalaryChange(Employee $employee, float $oldMonthly): int
    {
        $newMonthly = $employee->monthlyRate();
        if (round($newMonthly, 2) === round($oldMonthly, 2)) {
            return 0;
        }

        $today = Carbon::today();
        $flagged = 0;

        $enrollments = EmployeeBenefit::query()
            ->with('program')
            ->where('employee_id', $employee->id)
            ->where(fn ($q) => $q->whereNull('end_date')->orWhereDate('end_date', '>=', $today))
            ->whereHas('program', fn ($q) => $q->where('contribution_basis', 'percent_of_basic'))
            ->get();

        foreach ($enrollments as $enrollment) {
            $suggested = $this->calculator->computeShares($enrollment->program, $newMonthly);
            if (round($suggested['employee_share'], 2) === round((float) $enrollment->employee_share, 2)
                && round($suggested['employer_share'], 2) === round((float) $enrollment->employer_share, 2)) {
                continue;
            }

            $enrollment->update([
                'review_flagged_at' => now(),
                'review_note' => sprintf(
                    'Monthly salary changed on %s from ₱%s to ₱%s.',
                    $today->format('M j, Y'),
                    number_format($oldMonthly, 2),
                    number_format($newMonthly, 2),
                ),
            ]);
            $flagged++;
        }

        return $flagged;
    }
}
