<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\PayrollPeriod;
use App\Services\Payroll\CsvAttendanceImporter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DtrController extends Controller
{
    public function __construct(protected CsvAttendanceImporter $importer) {}

    public function index(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));
        $periodId = $request->get('payroll_period_id');

        $query = DtrEntry::query()
            ->with('employee:id,employee_code,firstname,lastname')
            ->orderByDesc('work_date');

        if ($periodId) {
            $query->where('payroll_period_id', $periodId);
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('payroll/dtr/page', [
            'entries' => $paginator->items(),
            'totalEntries' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'payrollPeriodId' => $periodId ? (int) $periodId : null,
            'periods' => PayrollPeriod::query()->orderByDesc('start_date')->get(['id', 'code', 'start_date', 'end_date']),
            'employees' => Employee::query()->where('is_active', true)->orderBy('employee_code')->get(['id', 'employee_code', 'firstname', 'lastname']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'payroll_period_id' => ['nullable', 'integer', 'exists:payroll_periods,id'],
            'work_date' => ['required', 'date'],
            'time_in' => ['nullable', 'string'],
            'time_out' => ['nullable', 'string'],
            'regular_hours' => ['nullable', 'numeric', 'min:0'],
            'ot_hours' => ['nullable', 'numeric', 'min:0'],
            'tardiness_minutes' => ['nullable', 'numeric', 'min:0'],
            'is_absent' => ['boolean'],
            'notes' => ['nullable', 'string'],
        ]);

        $data['is_absent'] = (bool) ($data['is_absent'] ?? false);
        $data['source'] = 'manual';

        DtrEntry::query()->updateOrCreate(
            [
                'employee_id' => $data['employee_id'],
                'work_date' => $data['work_date'],
            ],
            $data
        );

        return redirect()->back()->with('status', 'DTR entry saved.');
    }

    public function import(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt'],
            'payroll_period_id' => ['nullable', 'integer', 'exists:payroll_periods,id'],
        ]);

        $result = $this->importer->import(
            $data['file'],
            isset($data['payroll_period_id']) ? (int) $data['payroll_period_id'] : null
        );

        $message = "Imported {$result['imported']} row(s), skipped {$result['skipped']}.";
        if (! empty($result['errors'])) {
            return redirect()->back()
                ->with('status', $message)
                ->with('error', implode(' ', array_slice($result['errors'], 0, 5)));
        }

        return redirect()->back()->with('status', $message);
    }
}
