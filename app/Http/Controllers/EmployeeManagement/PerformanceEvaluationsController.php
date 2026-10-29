<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\PerformanceEvaluation;
use App\Models\User;
use App\Services\People\EmployeeResolver;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Performance reviews (Employee Handbook, Performance Evaluations). Reviewers (evaluations.manage) write a review as a
 * draft, then share it; the employee sees their shared reviews here and acknowledges each one, with comments if they
 * wish. Nobody reviews themselves, and a reviewer who is also an employee does not see drafts about themselves.
 *
 * Reviews are looked up inside the current company (route model binding runs before the company is resolved).
 */
class PerformanceEvaluationsController extends Controller
{
    public function __construct(protected EmployeeResolver $employeeResolver) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = (int) $entityContext->id();
        $user = $request->user();
        $self = $this->employeeResolver->forUser($user, $entityId);
        $canManage = $this->canManage($user);
        abort_unless($canManage || $self, 403);

        $evaluations = PerformanceEvaluation::query()
            ->with(['employee:id,entity_id,employee_code,firstname,middlename,lastname,avatar,position', 'evaluator:id,firstname,lastname'])
            ->where('entity_id', $entityId)
            ->when(! $canManage, fn ($q) => $q->where('employee_id', $self->id)->where('status', '!=', PerformanceEvaluation::STATUS_DRAFT))
            ->when($canManage && $self, fn ($q) => $q->where(fn ($w) => $w->where('employee_id', '!=', $self->id)->orWhere('status', '!=', PerformanceEvaluation::STATUS_DRAFT)))
            ->orderByDesc('review_date')
            ->orderByDesc('id')
            ->get();

        return Inertia::render('employee-management/performance/page', [
            'canManage' => $canManage,
            'selfId' => $self?->id,
            'today' => Carbon::today()->toDateString(),
            'reviewTypes' => PerformanceEvaluation::REVIEW_TYPES,
            'criteria' => collect(PerformanceEvaluation::CRITERIA)->map(fn ($c, $key) => ['key' => $key, 'label' => $c[0], 'hint' => $c[1]])->values(),
            'evaluations' => $evaluations->map(fn (PerformanceEvaluation $e) => $this->present($e, $user, $self, $canManage))->values(),
            'employees' => $canManage
                ? Employee::query()->where('entity_id', $entityId)->where('is_active', true)
                    ->when($self, fn ($q) => $q->where('id', '!=', $self->id))
                    ->orderBy('lastname')
                    ->get(['id', 'employee_code', 'firstname', 'middlename', 'lastname', 'avatar', 'position', 'hire_date', 'regularization_date'])
                : [],
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = (int) $entityContext->id();
        $data = $this->validated($request, $entityId);

        $evaluation = PerformanceEvaluation::create([
            ...$data,
            'entity_id' => $entityId,
            'evaluator_id' => $request->user()->id,
            'overall_rating' => PerformanceEvaluation::overall($data['ratings']),
            'status' => PerformanceEvaluation::STATUS_DRAFT,
        ]);

        return redirect()->back()->with('status', "Draft review saved for {$evaluation->employee->name}. Share it when it is ready.");
    }

    public function update(Request $request, EntityContext $entityContext, int $id): RedirectResponse
    {
        $evaluation = $this->find($id, $entityContext);
        $this->assertDraft($evaluation);
        $data = $this->validated($request, (int) $entityContext->id());

        $evaluation->update([...$data, 'overall_rating' => PerformanceEvaluation::overall($data['ratings'])]);

        return redirect()->back()->with('status', 'Draft review updated.');
    }

    /**
     * Show the review to the employee. Every criterion must be rated first.
     */
    public function share(EntityContext $entityContext, int $id): RedirectResponse
    {
        $evaluation = $this->find($id, $entityContext);
        $this->assertDraft($evaluation);

        $missing = collect(PerformanceEvaluation::CRITERIA)->keys()->reject(fn ($key) => isset(($evaluation->ratings ?? [])[$key]));
        if ($missing->isNotEmpty()) {
            throw ValidationException::withMessages(['ratings' => 'Rate every criterion before sharing: '.$missing->map(fn ($k) => PerformanceEvaluation::CRITERIA[$k][0])->join(', ').'.']);
        }

        $evaluation->update(['status' => PerformanceEvaluation::STATUS_SHARED, 'shared_at' => now()]);

        return redirect()->back()->with('status', "Review shared with {$evaluation->employee->name}. They can now read and acknowledge it.");
    }

    public function destroy(EntityContext $entityContext, int $id): RedirectResponse
    {
        $evaluation = $this->find($id, $entityContext);
        $this->assertDraft($evaluation);
        $evaluation->delete();

        return redirect()->back()->with('status', 'Draft review deleted.');
    }

    /**
     * The employee confirms they have read a shared review, optionally with their own comments.
     */
    public function acknowledge(Request $request, EntityContext $entityContext, int $id): RedirectResponse
    {
        $evaluation = $this->find($id, $entityContext);
        $self = $this->employeeResolver->forUser($request->user(), (int) $entityContext->id());
        abort_unless($self && $self->id === $evaluation->employee_id, 403);

        if ($evaluation->status !== PerformanceEvaluation::STATUS_SHARED) {
            throw ValidationException::withMessages(['status' => 'Only a shared review waiting for you can be acknowledged.']);
        }

        $comments = $request->validate(['employee_comments' => ['nullable', 'string', 'max:2000']])['employee_comments'] ?? null;
        $evaluation->update([
            'status' => PerformanceEvaluation::STATUS_ACKNOWLEDGED,
            'employee_comments' => filled($comments) ? trim($comments) : null,
            'acknowledged_at' => now(),
        ]);

        return redirect()->back()->with('status', 'Review acknowledged. Thank you.');
    }

    // -----------------------------------------------------------------------------------------

    private function canManage(?User $user): bool
    {
        return $this->employeeResolver->may($user, 'evaluations.manage');
    }

    private function find(int $id, EntityContext $entityContext): PerformanceEvaluation
    {
        return PerformanceEvaluation::query()->where('entity_id', $entityContext->id())->findOrFail($id);
    }

    private function assertDraft(PerformanceEvaluation $evaluation): void
    {
        if (! $evaluation->isDraft()) {
            throw ValidationException::withMessages(['status' => 'This review has been shared with the employee and can no longer change.']);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, int $entityId): array
    {
        $self = $this->employeeResolver->forUser($request->user(), $entityId);
        $keys = array_keys(PerformanceEvaluation::CRITERIA);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('entity_id', $entityId)],
            'review_type' => ['required', Rule::in(array_keys(PerformanceEvaluation::REVIEW_TYPES))],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'review_date' => ['required', 'date'],
            'ratings' => ['nullable', 'array:'.implode(',', $keys)],
            'ratings.*' => ['nullable', 'integer', 'between:1,5'],
            'standards' => ['nullable', 'string', 'max:5000'],
            'strengths' => ['nullable', 'string', 'max:5000'],
            'improvements' => ['nullable', 'string', 'max:5000'],
            'goals' => ['nullable', 'string', 'max:5000'],
        ], [
            'employee_id.exists' => 'Choose an employee of this company.',
            'period_end.after_or_equal' => 'The review period cannot end before it starts.',
            'ratings.*.between' => 'Ratings run from 1 to 5.',
        ]);

        if ($self && (int) $data['employee_id'] === $self->id) {
            throw ValidationException::withMessages(['employee_id' => 'You cannot review yourself.']);
        }

        $data['ratings'] = collect($keys)->mapWithKeys(fn ($k) => [$k => isset($data['ratings'][$k]) ? (int) $data['ratings'][$k] : null])->all();

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(PerformanceEvaluation $e, User $user, ?Employee $self, bool $canManage): array
    {
        $own = $self && $self->id === $e->employee_id;

        return [
            ...$e->only(['id', 'employee_id', 'review_type', 'ratings', 'standards', 'strengths', 'improvements', 'goals', 'status', 'employee_comments']),
            'employee' => $e->employee,
            'evaluator' => $e->evaluator?->name,
            'period_start' => $e->period_start?->toDateString(),
            'period_end' => $e->period_end?->toDateString(),
            'review_date' => $e->review_date?->toDateString(),
            'overall_rating' => $e->overall_rating !== null ? (float) $e->overall_rating : null,
            'shared_at' => $e->shared_at?->toIso8601String(),
            'acknowledged_at' => $e->acknowledged_at?->toIso8601String(),
            'can' => [
                'edit' => $canManage && ! $own && $e->isDraft(),
                'acknowledge' => $own && $e->status === PerformanceEvaluation::STATUS_SHARED,
            ],
        ];
    }
}
