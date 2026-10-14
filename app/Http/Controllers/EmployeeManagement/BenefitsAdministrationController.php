<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\BenefitProgram;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Services\People\BenefitCalculator;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Benefits Administration: company benefit programs and who is enrolled in them.
 *
 * SSS, PhilHealth and Pag-IBIG are computed by payroll for every employee — they are shown here as a
 * preview only. Company programs reach the payslip through active enrollments, per the program's
 * payroll_mode (see BenefitProgram). All amounts are per month.
 */
class BenefitsAdministrationController extends Controller
{
    public function __construct(protected BenefitCalculator $benefitCalculator) {}

    public function index(EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $today = Carbon::today();

        $employees = Employee::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->where('employment_status', 'active')
            ->orderBy('lastname')
            ->get();

        $enrollments = EmployeeBenefit::query()
            ->with('program')
            ->whereIn('employee_id', $employees->pluck('id'))
            ->whereHas('program', fn ($q) => $q->where('payroll_mode', '!=', BenefitProgram::MODE_STATUTORY))
            ->get();

        $programs = BenefitProgram::query()
            ->applicableTo($entityId)
            ->orderByRaw("case when payroll_mode = 'statutory' then 0 else 1 end")
            ->orderBy('name')
            ->get();

        $current = $enrollments->filter(fn (EmployeeBenefit $b) => $b->isEffectiveOn($today));
        $byEmployee = $employees->keyBy('id');

        return Inertia::render('employee-management/benefits/page', [
            'today' => $today->toDateString(),
            'programs' => $programs->map(function (BenefitProgram $p) use ($current, $enrollments) {
                $live = $current->where('benefit_program_id', $p->id);

                return [
                    ...$p->only(['id', 'code', 'name', 'category', 'contribution_basis', 'payroll_mode', 'description', 'is_taxable', 'is_active']),
                    'default_employee_share' => (float) $p->default_employee_share,
                    'default_employer_share' => (float) $p->default_employer_share,
                    'employee_rate' => (float) $p->employee_rate,
                    'employer_rate' => (float) $p->employer_rate,
                    'is_global' => $p->entity_id === null,
                    'enrolled' => $live->count(),
                    'enrollments_total' => $enrollments->where('benefit_program_id', $p->id)->count(),
                    'monthly_employee' => round((float) $live->sum('employee_share'), 2),
                    'monthly_employer' => round((float) $live->sum('employer_share'), 2),
                ];
            })->values(),
            'enrollments' => $enrollments
                ->sortBy(fn (EmployeeBenefit $b) => [$byEmployee[$b->employee_id]->lastname ?? '', $b->program->name])
                ->map(fn (EmployeeBenefit $b) => [
                    'id' => $b->id,
                    'employee_id' => $b->employee_id,
                    'program_id' => $b->benefit_program_id,
                    'employee_share' => (float) $b->employee_share,
                    'employer_share' => (float) $b->employer_share,
                    'participation_status' => $b->participation_status,
                    'status' => $this->status($b, $today),
                    'effective_date' => $b->effective_date?->toDateString(),
                    'end_date' => $b->end_date?->toDateString(),
                    'notes' => $b->notes,
                ])->values(),
            'employees' => $employees->map(function (Employee $e) {
                $monthly = $e->monthlyRate();
                $sss = $this->benefitCalculator->computeSss($monthly);
                $ph = $this->benefitCalculator->computePhilHealth($monthly);
                $hdmf = $this->benefitCalculator->computePagIbig($monthly);

                return [
                    ...$e->only(['id', 'employee_code', 'firstname', 'lastname', 'name', 'avatar_url', 'position', 'department', 'pay_type']),
                    'basic_pay' => (float) $e->basic_pay,
                    'monthly_rate' => round($monthly, 2),
                    'statutory' => [
                        'sss' => ['employee' => (float) $sss['employee_share'], 'employer' => round($sss['employer_share'] - ($sss['ec'] ?? 0), 2), 'ec' => (float) ($sss['ec'] ?? 0), 'msc' => $sss['msc'] ?? null],
                        'philhealth' => ['employee' => (float) $ph['employee_share'], 'employer' => (float) $ph['employer_share']],
                        'pagibig' => ['employee' => (float) $hdmf['employee_share'], 'employer' => (float) $hdmf['employer_share']],
                    ],
                    'missing_ids' => collect(['sss_number' => 'SSS', 'philhealth_number' => 'PhilHealth', 'pagibig_number' => 'Pag-IBIG', 'tin' => 'TIN'])
                        ->filter(fn ($label, $field) => blank($e->{$field}))
                        ->values(),
                ];
            })->values(),
            'categories' => BenefitProgram::CATEGORIES,
        ]);
    }

    /**
     * Enroll one or more employees in a company program. Shares left blank are computed per employee
     * from the program defaults (fixed amounts or % of the monthly-equivalent rate).
     */
    public function enroll(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $data = $request->validate([
            'employee_ids' => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer', 'exists:employees,id'],
            'benefit_program_id' => ['required', 'exists:benefit_programs,id'],
            'employee_share' => ['nullable', 'numeric', 'min:0'],
            'employer_share' => ['nullable', 'numeric', 'min:0'],
            'participation_status' => ['nullable', Rule::in(['active', 'pending', 'waived'])],
            'effective_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:effective_date'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [
            'employee_ids.required' => 'Pick at least one employee.',
        ]);

        $program = $this->companyProgram((int) $data['benefit_program_id'], $entityContext->id());
        if (! $program->is_active) {
            throw ValidationException::withMessages(['benefit_program_id' => "{$program->name} is archived. Restore it before enrolling employees."]);
        }

        $employees = Employee::query()->where('entity_id', $entityContext->id())->whereIn('id', $data['employee_ids'])->get();

        foreach ($employees as $employee) {
            $computed = $this->benefitCalculator->computeShares($program, $employee->monthlyRate());

            EmployeeBenefit::query()->updateOrCreate(
                ['employee_id' => $employee->id, 'benefit_program_id' => $program->id],
                [
                    'employee_share' => $data['employee_share'] ?? $computed['employee_share'],
                    'employer_share' => $data['employer_share'] ?? $computed['employer_share'],
                    'payroll_treatment' => $program->payroll_mode,
                    'participation_status' => $data['participation_status'] ?? 'active',
                    'effective_date' => $data['effective_date'] ?? now()->toDateString(),
                    'end_date' => $data['end_date'] ?? null,
                    'notes' => $data['notes'] ?? null,
                ]
            );
        }

        $n = $employees->count();

        return redirect()->back()->with('status', "{$n} employee".($n === 1 ? '' : 's')." enrolled in {$program->name}.");
    }

    public function updateEnrollment(Request $request, EmployeeBenefit $employeeBenefit, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($employeeBenefit, $entityContext->id());

        $data = $request->validate([
            'employee_share' => ['required', 'numeric', 'min:0'],
            'employer_share' => ['required', 'numeric', 'min:0'],
            'participation_status' => ['required', Rule::in(['active', 'pending', 'waived'])],
            'effective_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:effective_date'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $employeeBenefit->update($data);

        return redirect()->back()->with('status', 'Enrollment updated.');
    }

    /**
     * Stop an enrollment from a date (it stays on record for history).
     */
    public function endEnrollment(Request $request, EmployeeBenefit $employeeBenefit, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($employeeBenefit, $entityContext->id());

        $data = $request->validate([
            'end_date' => ['required', 'date', ...($employeeBenefit->effective_date ? ['after_or_equal:'.$employeeBenefit->effective_date->toDateString()] : [])],
        ], [
            'end_date.after_or_equal' => 'The end date cannot be before the enrollment started.',
        ]);

        $employeeBenefit->update(['end_date' => $data['end_date']]);

        return redirect()->back()->with('status', 'Enrollment ends on '.Carbon::parse($data['end_date'])->format('M j, Y').'.');
    }

    public function destroyEnrollment(EmployeeBenefit $employeeBenefit, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($employeeBenefit, $entityContext->id());
        $employeeBenefit->delete();

        return redirect()->back()->with('status', 'Enrollment removed.');
    }

    public function storeProgram(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $data = $this->validateProgram($request);

        $program = BenefitProgram::query()->create([...$data, 'entity_id' => $entityContext->id(), 'is_active' => true]);

        return redirect()->back()->with('status', "{$program->name} created. Enroll employees to start applying it.");
    }

    public function updateProgram(Request $request, BenefitProgram $benefitProgram, EntityContext $entityContext): RedirectResponse
    {
        $program = $this->companyProgram($benefitProgram->id, $entityContext->id());
        $program->update($this->validateProgram($request, $program));

        return redirect()->back()->with('status', "{$program->name} updated. Existing enrollments keep their amounts.");
    }

    /**
     * Archive (stops applying to payroll, no new enrollments) or restore a program.
     */
    public function toggleProgram(BenefitProgram $benefitProgram, EntityContext $entityContext): RedirectResponse
    {
        $program = $this->companyProgram($benefitProgram->id, $entityContext->id());
        $program->update(['is_active' => ! $program->is_active]);

        return redirect()->back()->with('status', $program->is_active ? "{$program->name} restored." : "{$program->name} archived — it no longer applies to payroll.");
    }

    // -----------------------------------------------------------------------------------------

    /**
     * @return array<string, mixed>
     */
    private function validateProgram(Request $request, ?BenefitProgram $program = null): array
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'alpha_dash', Rule::unique('benefit_programs', 'code')->ignore($program?->id)],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', Rule::in(BenefitProgram::CATEGORIES)],
            'payroll_mode' => ['required', Rule::in(BenefitProgram::PAYROLL_MODES)],
            'contribution_basis' => ['required', Rule::in(['fixed', 'percent_of_basic'])],
            'default_employee_share' => ['nullable', 'numeric', 'min:0'],
            'default_employer_share' => ['nullable', 'numeric', 'min:0'],
            'employee_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'employer_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'is_taxable' => ['boolean'],
            'description' => ['nullable', 'string', 'max:500'],
        ]);

        // An allowance is paid by the company only.
        $earning = $data['payroll_mode'] === BenefitProgram::MODE_EARNING;

        return [
            ...$data,
            'code' => strtoupper($data['code']),
            'default_employee_share' => $earning ? 0 : ($data['default_employee_share'] ?? 0),
            'default_employer_share' => $data['default_employer_share'] ?? 0,
            'employee_rate' => $earning ? 0 : ($data['employee_rate'] ?? 0),
            'employer_rate' => $data['employer_rate'] ?? 0,
            'is_taxable' => $earning && ($data['is_taxable'] ?? false),
        ];
    }

    /**
     * A non-statutory program visible to the entity.
     */
    private function companyProgram(int $id, ?int $entityId): BenefitProgram
    {
        $program = BenefitProgram::query()->applicableTo($entityId)->findOrFail($id);

        if ($program->payroll_mode === BenefitProgram::MODE_STATUTORY || $program->isStatutory()) {
            throw ValidationException::withMessages([
                'benefit_program_id' => "{$program->name} is computed by payroll for every employee — no enrollment or changes needed here.",
            ]);
        }

        return $program;
    }

    private function assertEntity(EmployeeBenefit $enrollment, ?int $entityId): void
    {
        abort_unless($enrollment->employee()->where('entity_id', $entityId)->exists(), 404);
    }

    /**
     * active | scheduled (starts later) | ended | pending | waived
     */
    private function status(EmployeeBenefit $b, Carbon $today): string
    {
        if ($b->end_date && $b->end_date->lt($today)) {
            return 'ended';
        }
        if ($b->participation_status !== 'active') {
            return $b->participation_status;
        }

        return $b->effective_date && $b->effective_date->gt($today) ? 'scheduled' : 'active';
    }
}
