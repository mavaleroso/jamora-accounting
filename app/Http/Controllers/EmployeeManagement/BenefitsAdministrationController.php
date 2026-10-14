<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\BenefitProgram;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Services\People\BenefitCalculator;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BenefitsAdministrationController extends Controller
{
    public function __construct(protected BenefitCalculator $benefitCalculator) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $tab = $request->get('tab', 'enrollments');

        $programs = BenefitProgram::query()
            ->applicableTo($entityId)
            ->where('is_active', true)
            ->orderBy('category')
            ->orderBy('name')
            ->get();

        $employees = Employee::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->with(['benefits.program'])
            ->orderBy('lastname')
            ->get();

        $enrollments = EmployeeBenefit::query()
            ->with(['employee:id,entity_id,employee_code,firstname,lastname,position,basic_pay', 'program:id,code,name,category,contribution_basis'])
            ->whereHas('employee', fn ($q) => $q->where('entity_id', $entityId))
            ->orderBy('employee_id')
            ->get()
            ->map(fn ($b) => [
                'id' => $b->id,
                'employee_id' => $b->employee_id,
                'employee_name' => $b->employee?->name,
                'employee_code' => $b->employee?->employee_code,
                'basic_pay' => (float) ($b->employee?->basic_pay ?? 0),
                'program_id' => $b->benefit_program_id,
                'program_code' => $b->program?->code,
                'program_name' => $b->program?->name,
                'category' => $b->program?->category,
                'contribution_basis' => $b->program?->contribution_basis,
                'employee_share' => (float) $b->employee_share,
                'employer_share' => (float) $b->employer_share,
                'total_contribution' => (float) ($b->employee_share + $b->employer_share),
                'payroll_treatment' => $b->payroll_treatment,
                'participation_status' => $b->participation_status,
                'effective_date' => $b->effective_date?->format('Y-m-d'),
                'end_date' => $b->end_date?->format('Y-m-d'),
            ]);

        $totalEmployerExpense = (float) $enrollments->where('participation_status', 'active')->sum('employer_share');
        $totalEmployeeDeductions = (float) $enrollments->where('participation_status', 'active')->sum('employee_share');
        $totalContributions = (float) ($totalEmployerExpense + $totalEmployeeDeductions);

        return Inertia::render('employee-management/benefits/page', [
            'tab' => $tab,
            'programs' => $programs,
            'employees' => $employees,
            'enrollments' => $enrollments,
            'totals' => [
                'totalEmployerExpense' => $totalEmployerExpense,
                'totalEmployeeDeductions' => $totalEmployeeDeductions,
                'totalContributions' => $totalContributions,
            ],
            'summary' => [
                'totalEmployerExpense' => $totalEmployerExpense,
                'totalEmployeeDeductions' => $totalEmployeeDeductions,
                'totalContributions' => $totalContributions,
                'totalPrograms' => $programs->count(),
            ],
        ]);
    }

    public function enroll(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'benefit_program_id' => ['required', 'exists:benefit_programs,id'],
            'employee_share' => ['nullable', 'numeric', 'min:0'],
            'employer_share' => ['nullable', 'numeric', 'min:0'],
            'payroll_treatment' => ['nullable', 'string'],
            'participation_status' => ['nullable', 'in:active,waived,pending'],
            'effective_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:effective_date'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $program = BenefitProgram::findOrFail($validated['benefit_program_id']);
        $employee = Employee::findOrFail($validated['employee_id']);

        // Auto-calculate statutory contributions if not manually specified
        $eeShare = $validated['employee_share'] ?? null;
        $erShare = $validated['employer_share'] ?? null;

        if ($eeShare === null || $erShare === null) {
            $computed = $this->benefitCalculator->computeShares($program, (float) $employee->basic_pay);
            $eeShare = $eeShare ?? $computed['employee_share'];
            $erShare = $erShare ?? $computed['employer_share'];
        }

        EmployeeBenefit::updateOrCreate(
            [
                'employee_id' => $validated['employee_id'],
                'benefit_program_id' => $validated['benefit_program_id'],
            ],
            [
                'employee_share' => $eeShare,
                'employer_share' => $erShare,
                'payroll_treatment' => $validated['payroll_treatment'] ?? 'standard',
                'participation_status' => $validated['participation_status'] ?? 'active',
                'effective_date' => $validated['effective_date'] ?? now()->toDateString(),
                'end_date' => $validated['end_date'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]
        );

        return redirect()->back()->with('status', 'Employee benefit enrollment saved.');
    }

    public function store(Request $request): RedirectResponse
    {
        return $this->enroll($request);
    }

    public function storeProgram(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:benefit_programs,code'],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string'],
            'contribution_basis' => ['nullable', 'string', 'in:fixed,percent_of_basic,statutory_sss,statutory_philhealth,statutory_pagibig'],
            'employee_rate' => ['nullable', 'numeric', 'min:0'],
            'employer_rate' => ['nullable', 'numeric', 'min:0'],
            'employee_share_default' => ['nullable', 'numeric', 'min:0'],
            'employer_share_default' => ['nullable', 'numeric', 'min:0'],
            'default_employee_share' => ['nullable', 'numeric', 'min:0'],
            'default_employer_share' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string', 'max:500'],
        ]);

        BenefitProgram::create([
            'entity_id' => $entityContext->id(),
            'code' => strtoupper($validated['code']),
            'name' => $validated['name'],
            'category' => $validated['category'],
            'contribution_basis' => $validated['contribution_basis'] ?? 'fixed',
            'employee_rate' => $validated['employee_rate'] ?? 0,
            'employer_rate' => $validated['employer_rate'] ?? 0,
            'default_employee_share' => $validated['employee_share_default'] ?? $validated['default_employee_share'] ?? 0,
            'default_employer_share' => $validated['employer_share_default'] ?? $validated['default_employer_share'] ?? 0,
            'description' => $validated['description'] ?? null,
            'is_active' => true,
        ]);

        return redirect()->back()->with('status', 'Benefit program created successfully.');
    }
}
