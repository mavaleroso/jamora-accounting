<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Services\People\PeopleAnalytics;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * People Reports & Analytics: workforce, attendance, leave and payroll cost for a period.
 * Pay figures (payroll cost, leave liability) are shown only to users who can view payroll.
 */
class PeopleReportsController extends Controller
{
    public const PRESETS = [
        'this_month' => 'This month',
        'last_month' => 'Last month',
        'this_quarter' => 'This quarter',
        'last_quarter' => 'Last quarter',
        'ytd' => 'Year to date',
        'last_12' => 'Last 12 months',
        'custom' => 'Custom range',
    ];

    public function index(Request $request, EntityContext $entityContext): Response
    {
        [$from, $to, $filters] = $this->filters($request);
        $entityId = (int) $entityContext->id();
        $canSeePay = (bool) $request->user()?->can('payroll.view');
        $analytics = new PeopleAnalytics($entityId, $from, $to, $filters['department']);

        return Inertia::render('employee-management/reports/page', [
            'filters' => $filters,
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'presets' => collect(self::PRESETS)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            'departments' => PeopleAnalytics::departments($entityId),
            'canSeePay' => $canSeePay,
            'today' => Carbon::today()->toDateString(),
            'workforce' => $analytics->workforce(),
            'attendance' => $analytics->attendance(),
            'leave' => $analytics->leave($canSeePay),
            'payroll' => $canSeePay ? $analytics->payroll() : null,
        ]);
    }

    /**
     * CSV of one report section for the same filters.
     */
    public function export(Request $request, EntityContext $entityContext): StreamedResponse
    {
        $section = $request->validate(['section' => ['required', Rule::in(['workforce', 'attendance', 'leave', 'payroll'])]])['section'];
        $canSeePay = (bool) $request->user()?->can('payroll.view');
        abort_if($section === 'payroll' && ! $canSeePay, 403);

        [$from, $to, $filters] = $this->filters($request);
        $analytics = new PeopleAnalytics((int) $entityContext->id(), $from, $to, $filters['department']);

        [$header, $rows] = match ($section) {
            'workforce' => [
                ['Department', 'Active headcount', 'Regular'],
                collect($analytics->workforce()['byDepartment'])->map(fn ($r) => [$r['department'], $r['count'], $r['regular']]),
            ],
            'attendance' => [
                ['Employee code', 'Employee', 'Department', 'Days worked', 'Absences', 'Late (times)', 'Late (min)', 'Undertime (min)', 'OT rendered (h)', 'OT approved (h)', 'Night diff (h)', 'Leave days', 'Attendance rate %'],
                collect($analytics->attendance()['byEmployee'])->map(fn ($r) => [
                    $r['code'], $r['name'], $r['department'], $r['daysWorked'], $r['absences'], $r['lateCount'], $r['lateMinutes'],
                    $r['undertimeMinutes'], $r['otRendered'], $r['otApproved'], $r['nightDiffHours'], $r['leaveDays'], $r['rate'],
                ]),
            ],
            'leave' => [
                ['Leave type', 'Employees', 'Entitled', 'Used', 'Available', ...($canSeePay ? ['Value of unused (PHP)'] : [])],
                collect($analytics->leave($canSeePay)['balances'])->map(fn ($r) => [$r['type'], $r['employees'], $r['entitled'], $r['used'], $r['available'], ...($canSeePay ? [$r['value']] : [])]),
            ],
            'payroll' => [
                ['Department', 'Employees', 'Gross pay', 'Overtime & night diff', 'Employer contributions', 'Employee contributions', 'Withholding tax', 'Net pay', '13th month accrual'],
                collect($analytics->payroll()['byDepartment'])->map(fn ($r) => [
                    $r['department'], $r['employees'], $r['gross'], $r['overtime'], $r['employer'], $r['employeeContributions'], $r['tax'], $r['net'], $r['thirteenth'],
                ]),
            ],
        };

        $name = "people-{$section}-{$from->toDateString()}-to-{$to->toDateString()}.csv";

        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $header);
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv']);
    }

    /**
     * @return array{0: Carbon, 1: Carbon, 2: array{preset: string, from: ?string, to: ?string, department: ?string}}
     */
    private function filters(Request $request): array
    {
        $data = $request->validate([
            'preset' => ['nullable', Rule::in(array_keys(self::PRESETS))],
            'from' => ['nullable', 'date_format:Y-m'],
            'to' => ['nullable', 'date_format:Y-m'],
            'department' => ['nullable', 'string', 'max:100'],
        ]);

        $preset = $data['preset'] ?? 'this_month';
        $today = Carbon::today();

        [$from, $to] = match ($preset) {
            'last_month' => [$today->copy()->subMonthNoOverflow()->startOfMonth(), $today->copy()->subMonthNoOverflow()->endOfMonth()],
            'this_quarter' => [$today->copy()->firstOfQuarter(), $today->copy()->lastOfQuarter()],
            'last_quarter' => [$today->copy()->subQuarterNoOverflow()->firstOfQuarter(), $today->copy()->subQuarterNoOverflow()->lastOfQuarter()],
            'ytd' => [$today->copy()->startOfYear(), $today->copy()],
            'last_12' => [$today->copy()->subMonthsNoOverflow(11)->startOfMonth(), $today->copy()->endOfMonth()],
            'custom' => [
                Carbon::createFromFormat('Y-m-d', ($data['from'] ?? $today->format('Y-m')).'-01')->startOfDay(),
                Carbon::createFromFormat('Y-m-d', ($data['to'] ?? $data['from'] ?? $today->format('Y-m')).'-01')->endOfMonth()->startOfDay(),
            ],
            default => [$today->copy()->startOfMonth(), $today->copy()->endOfMonth()],
        };
        if ($to->lt($from)) {
            [$from, $to] = [$to->copy()->startOfMonth(), $from->copy()->endOfMonth()->startOfDay()];
        }

        return [$from->startOfDay(), $to->startOfDay(), [
            'preset' => $preset,
            'from' => $from->format('Y-m'),
            'to' => $to->format('Y-m'),
            'department' => $data['department'] ?? null,
        ]];
    }
}
