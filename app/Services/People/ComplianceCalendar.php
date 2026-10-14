<?php

namespace App\Services\People;

use App\Models\ComplianceItem;
use Carbon\Carbon;

/**
 * Generates statutory and regulatory compliance obligations for a given period (e.g. September 2026).
 */
class ComplianceCalendar
{
    /**
     * Generate compliance items for an entity and period (format "Month Year", e.g. "October 2026").
     *
     * @return array{created: int, existing: int}
     */
    public function generateForPeriod(int $entityId, string $periodString): array
    {
        $periodDate = Carbon::parse('first day of '.$periodString);
        $month = (int) $periodDate->month;
        $year = (int) $periodDate->year;
        $isQuarterEnd = in_array($month, [3, 6, 9, 12], true);
        $isYearEnd = ($month === 12);

        $templates = config('people.compliance_calendar', []);
        $created = 0;
        $existing = 0;

        foreach ($templates as $tpl) {
            $when = $tpl['when'] ?? 'monthly';

            if ($when === 'quarter_end' && ! $isQuarterEnd) {
                continue;
            }
            if ($when === 'year_end' && ! $isYearEnd) {
                continue;
            }
            if ($when === 'monthly_non_quarter' && $isQuarterEnd) {
                continue;
            }

            // Calculate due date [month_offset, day]
            [$monthOffset, $day] = $tpl['due'];
            $dueMonth = $periodDate->copy()->addMonths($monthOffset);
            if ($day === 0) {
                $dueDate = $dueMonth->endOfMonth()->toDateString();
            } else {
                $dueDate = $dueMonth->copy()->day(min($day, $dueMonth->daysInMonth))->toDateString();
            }

            $item = ComplianceItem::withoutEntityScope()
                ->where('entity_id', $entityId)
                ->where('form_code', $tpl['form_code'])
                ->where('period', $periodString)
                ->first();

            if ($item) {
                $existing++;

                continue;
            }

            ComplianceItem::create([
                'entity_id' => $entityId,
                'title' => $tpl['title'],
                'form_code' => $tpl['form_code'],
                'agency' => $tpl['agency'] ?? null,
                'category' => $tpl['category'],
                'frequency' => $tpl['frequency'] ?? 'monthly',
                'period' => $periodString,
                'due_date' => $dueDate,
                'owner_role' => $tpl['owner_role'] ?? 'HR / Accounting',
                'status' => 'pending',
            ]);

            $created++;
        }

        return ['created' => $created, 'existing' => $existing];
    }
}

