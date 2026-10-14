<?php

namespace App\Services\Payroll;

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Services\People\AttendanceCalculator;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;

class CsvAttendanceImporter
{
    public function __construct(protected AttendanceCalculator $attendanceCalculator) {}

    /**
     * CSV columns: employee_code, work_date, time_in, time_out, break_out, break_in, regular_hours, ot_hours, tardiness_minutes, is_absent
     *
     * @return array{imported:int, skipped:int, errors:array<int, string>}
     */
    public function import(UploadedFile $file, ?int $payrollPeriodId = null): array
    {
        $handle = fopen($file->getRealPath(), 'r');
        if ($handle === false) {
            return ['imported' => 0, 'skipped' => 0, 'errors' => ['Unable to read file.']];
        }

        $header = fgetcsv($handle);
        $imported = 0;
        $skipped = 0;
        $errors = [];
        $entityId = app(EntityContext::class)->id();

        $rowNum = 1;
        while (($row = fgetcsv($handle)) !== false) {
            $rowNum++;
            $data = array_combine($header ?: [], $row);
            if ($data === false) {
                $skipped++;
                $errors[] = "Row {$rowNum}: invalid columns";
                continue;
            }

            $code = trim((string) ($data['employee_code'] ?? ''));
            $employee = Employee::query()->withoutEntityScope()->where('employee_code', $code)->first();
            if (! $employee) {
                $skipped++;
                $errors[] = "Row {$rowNum}: employee {$code} not found";
                continue;
            }

            try {
                $workDate = Carbon::parse($data['work_date'] ?? '')->toDateString();
            } catch (\Throwable) {
                $skipped++;
                $errors[] = "Row {$rowNum}: invalid work_date";
                continue;
            }

            $dtr = DtrEntry::query()->withoutEntityScope()->firstOrNew([
                'employee_id' => $employee->id,
                'work_date' => $workDate,
            ]);

            if ($dtr->isLocked()) {
                $skipped++;
                $errors[] = "Row {$rowNum}: date {$workDate} for {$code} is already locked by payroll.";
                continue;
            }

            $dtr->entity_id = $entityId ?? $employee->entity_id;
            $dtr->payroll_period_id = $payrollPeriodId ?? $dtr->payroll_period_id;
            $dtr->time_in = ! empty($data['time_in']) ? Carbon::parse($data['time_in'])->format('H:i:s') : null;
            $dtr->time_out = ! empty($data['time_out']) ? Carbon::parse($data['time_out'])->format('H:i:s') : null;
            $dtr->break_out = ! empty($data['break_out']) ? Carbon::parse($data['break_out'])->format('H:i:s') : null;
            $dtr->break_in = ! empty($data['break_in']) ? Carbon::parse($data['break_in'])->format('H:i:s') : null;
            $dtr->source = 'csv';

            // Recompute schedule, tardiness, undertime, regular, night diff and day type
            $this->attendanceCalculator->compute($dtr, $employee)->save();
            $imported++;
        }

        fclose($handle);

        return compact('imported', 'skipped', 'errors');
    }
}
