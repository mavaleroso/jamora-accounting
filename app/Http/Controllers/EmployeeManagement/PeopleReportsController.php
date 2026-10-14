<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
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

        // Accurate counts by employment_status and employment_type (probationary, regular, etc.)
        $activeCount = $employees->where('employment_status', 'active')->count();
        $inactiveCount = $employees->where('employment_status', 'inactive')->count();
        $separatedCount = $employees->where('employment_status', 'separated')->count();

        $regularCount = $employees->where('employment_type', 'regular')->count();
        $probationaryCount = $employees->where('employment_type', 'probationary')->count();
        $contractualCount = $employees->where('employment_type', 'contractual')->count();

        // By department
        $byDepartment = $employees->groupBy(fn ($e) => $e->department ?: 'General')->map->count();

        // Leave metrics
        $leaves = LeaveRequest::query()->where('entity_id', $entityId)->with('type')->get();
        $leavesByType = $leaves->groupBy(fn ($l) => $l->type?->name ?? $l->leave_type)->map(fn ($group) => [
            'count' => $group->count(),
            'total_days' => (float) $group->sum('days_count'),
        ]);

        // Attendance stats for current month
        $startOfMonth = Carbon::now()->startOfMonth();
        $dtrStats = DtrEntry::query()
            ->where('entity_id', $entityId)
            ->where('work_date', '>=', $startOfMonth)
            ->get();

        $totalTardyMinutes = $dtrStats->sum('tardiness_minutes');
        $totalUndertimeMinutes = $dtrStats->sum('undertime_minutes');
        $totalOtHoursRendered = $dtrStats->sum('ot_hours');
        $totalOtHoursApproved = $dtrStats->sum('ot_hours_approved');
        $absencesCount = $dtrStats->where('is_absent', true)->count();
        $nightDiffHours = $dtrStats->sum('night_diff_hours');

        // Monthly estimated payroll cost (active employees)
        $totalMonthlyBasic = $employees->where('employment_status', 'active')->sum('basic_pay');

        // Leave liability (balances)
        $currentYear = (int) date('Y');
        $leaveLiability = LeaveBalance::where('entity_id', $entityId)
            ->where('year', $currentYear)
            ->get();

        $totalEntitledDays = (float) $leaveLiability->sum('entitled');
        $totalUsedDays = (float) $leaveLiability->sum('used');
        $totalAvailableDays = (float) $leaveLiability->sum('available');

        return Inertia::render('employee-management/reports/page', [
            'headcount' => [
                'total' => $totalHeadcount,
                'active' => $activeCount,
                'inactive' => $inactiveCount,
                'separated' => $separatedCount,
                'regular' => $regularCount,
                'probationary' => $probationaryCount,
                'contractual' => $contractualCount,
                'byDepartment' => $byDepartment,
            ],
            'leaves' => [
                'totalRequests' => $leaves->count(),
                'approvedCount' => $leaves->where('status', 'approved')->count(),
                'byType' => $leavesByType,
                'totalEntitledDays' => $totalEntitledDays,
                'totalUsedDays' => $totalUsedDays,
                'totalAvailableDays' => $totalAvailableDays,
            ],
            'attendance' => [
                'totalTardyMinutes' => (int) $totalTardyMinutes,
                'totalUndertimeMinutes' => (int) $totalUndertimeMinutes,
                'totalOtHoursRendered' => (float) $totalOtHoursRendered,
                'totalOtHoursApproved' => (float) $totalOtHoursApproved,
                'absencesCount' => $absencesCount,
                'nightDiffHours' => (float) $nightDiffHours,
            ],
            'payrollCost' => [
                'estimatedMonthlyBasic' => (float) $totalMonthlyBasic,
            ],
        ]);
    }
}
