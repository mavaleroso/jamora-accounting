<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\PayrollRun;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PeopleReportsController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();

        $employees = Employee::query()->where('entity_id', $entityId)->get();
        $totalHeadcount = $employees->count();
        $regularCount = $employees->where('employment_status', 'regular')->count();
        $probationaryCount = $employees->where('employment_status', 'probationary')->count();

        // By department
        $byDepartment = $employees->groupBy(fn ($e) => $e->department ?: 'General')->map->count();

        // Leave metrics
        $leaves = LeaveRequest::query()->where('entity_id', $entityId)->get();
        $leavesByType = $leaves->groupBy('leave_type')->map(fn ($group) => [
            'count' => $group->count(),
            'total_days' => $group->sum('days_count'),
        ]);

        // Attendance stats for current month
        $startOfMonth = Carbon::now()->startOfMonth();
        $dtrStats = DtrEntry::query()
            ->where('entity_id', $entityId)
            ->where('work_date', '>=', $startOfMonth)
            ->get();

        $totalTardyMinutes = $dtrStats->sum('tardiness_minutes');
        $totalOtHours = $dtrStats->sum('ot_hours');
        $absencesCount = $dtrStats->where('is_absent', true)->count();

        // Monthly estimated payroll cost
        $totalMonthlyBasic = $employees->sum('basic_pay');

        return Inertia::render('employee-management/reports/page', [
            'headcount' => [
                'total' => $totalHeadcount,
                'regular' => $regularCount,
                'probationary' => $probationaryCount,
                'byDepartment' => $byDepartment,
            ],
            'leaves' => [
                'totalRequests' => $leaves->count(),
                'approvedCount' => $leaves->where('status', 'approved')->count(),
                'byType' => $leavesByType,
            ],
            'attendance' => [
                'totalTardyMinutes' => (int) $totalTardyMinutes,
                'totalOtHours' => (float) $totalOtHours,
                'absencesCount' => $absencesCount,
            ],
            'payrollCost' => [
                'estimatedMonthlyBasic' => (float) $totalMonthlyBasic,
            ],
        ]);
    }
}

