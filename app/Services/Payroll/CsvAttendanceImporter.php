<?php

namespace App\Services\Payroll;

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

class CsvAttendanceImporter
{
    /**
     * CSV columns: employee_code, work_date, time_in, time_out, regular_hours, ot_hours, tardiness_minutes, is_absent
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
            $employee = Employee::query()->where('employee_code', $code)->first();
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

            DtrEntry::query()->updateOrCreate(
                [
                    'employee_id' => $employee->id,
                    'work_date' => $workDate,
                ],
                [
                    'entity_id' => $entityId,
                    'payroll_period_id' => $payrollPeriodId,
                    'time_in' => $data['time_in'] ?? null,
                    'time_out' => $data['time_out'] ?? null,
                    'regular_hours' => (float) ($data['regular_hours'] ?? 0),
                    'ot_hours' => (float) ($data['ot_hours'] ?? 0),
                    'tardiness_minutes' => (float) ($data['tardiness_minutes'] ?? 0),
                    'is_absent' => filter_var($data['is_absent'] ?? false, FILTER_VALIDATE_BOOLEAN),
                    'source' => 'csv',
                ]
            );
            $imported++;
        }

        fclose($handle);

        return compact('imported', 'skipped', 'errors');
    }
}
