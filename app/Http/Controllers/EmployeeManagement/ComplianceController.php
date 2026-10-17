<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\ComplianceItem;
use App\Services\People\ComplianceCalendar;
use App\Support\EntityContext;
use App\Support\PrivateFiles;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Statutory compliance calendar. Each filing moves pending -> prepared -> submitted -> verified one step
 * at a time. Submitting records the filing reference and date (late filings stay flagged); a different
 * person verifies, or returns it for correction. Payroll-driven filings show what posted payroll says.
 */
class ComplianceController extends Controller
{
    public const CATEGORIES = ['statutory_tax', 'statutory_payroll', 'local_government', 'regulatory'];

    public function __construct(protected ComplianceCalendar $complianceCalendar) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = (int) $entityContext->id();
        $user = $request->user();

        // The calendar never goes missing: this month's and last month's obligations always exist.
        $this->complianceCalendar->ensureRecent($entityId);

        $items = ComplianceItem::query()
            ->with(['preparedByUser:id,firstname,lastname', 'submittedByUser:id,firstname,lastname', 'verifiedByUser:id,firstname,lastname'])
            ->where('entity_id', $entityId)
            ->orderBy('due_date')
            ->get();

        // Payroll amounts per covered month, computed once per month.
        $payroll = $items->map(fn (ComplianceItem $i) => $i->period)->unique()
            ->mapWithKeys(fn (string $period) => [$period => ($start = $this->periodStart($period)) ? $this->complianceCalendar->payrollAmounts($entityId, $start) : []]);

        return Inertia::render('employee-management/compliance/page', [
            'today' => Carbon::today()->toDateString(),
            'currentUserId' => $user?->id,
            'can' => [
                'manage' => (bool) $user?->can('compliance.manage'),
                'verify' => (bool) $user?->can('compliance.verify'),
            ],
            'categories' => self::CATEGORIES,
            'periods' => $items->sortByDesc(fn (ComplianceItem $i) => $i->periodStart()?->timestamp ?? 0)->pluck('period')->unique()->values(),
            'items' => $items->map(fn (ComplianceItem $item) => [
                ...$item->only(['id', 'title', 'form_code', 'agency', 'category', 'frequency', 'period', 'owner_role', 'status', 'reference_no', 'notes']),
                'due_date' => $item->due_date?->toDateString(),
                'amount' => $item->amount !== null ? (float) $item->amount : null,
                'evidence_url' => $item->evidence_file ? route('employee-management.compliance.evidence', $item->id) : null,
                'is_overdue' => $item->isOverdue(),
                'is_late' => $item->isLate(),
                'days_late' => $item->daysLate(),
                'payroll' => $payroll[$item->period][$item->form_code] ?? null,
                'prepared' => $this->stamp($item->preparedByUser?->name, $item->prepared_by, $item->prepared_at),
                'submitted' => $this->stamp($item->submittedByUser?->name, $item->submitted_by, $item->submitted_at),
                'verified' => $this->stamp($item->verifiedByUser?->name, $item->verified_by, $item->verified_at),
            ])->values(),
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'form_code' => ['nullable', 'string', 'max:50'],
            'agency' => ['nullable', 'string', 'max:50'],
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'frequency' => ['nullable', Rule::in(['monthly', 'quarterly', 'annual', 'one_time'])],
            'period' => ['required', 'string', 'max:100'],
            'due_date' => ['required', 'date'],
            'owner_role' => ['required', 'string', 'max:100'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        // New items always start at the beginning of the workflow.
        ComplianceItem::create([...$validated, 'entity_id' => $entityContext->id(), 'status' => 'pending']);

        return redirect()->back()->with('status', "“{$validated['title']}” added to the calendar.");
    }

    /**
     * Prepare or submit — the next step only.
     */
    public function updateStatus(Request $request, ComplianceItem $complianceItem, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($complianceItem, $entityContext);

        $target = $request->validate(['status' => ['required', Rule::in(['prepared', 'submitted'])]])['status'];
        $this->assertNext($complianceItem, $target);

        $validated = $request->validate([
            'reference_no' => [$target === 'submitted' ? 'required' : 'nullable', 'string', 'max:100'],
            'filed_on' => [$target === 'submitted' ? 'required' : 'nullable', 'date', 'before_or_equal:today'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
            'evidence' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:10240'],
        ], [
            'reference_no.required' => 'Enter the confirmation / reference number of the filing or payment.',
            'filed_on.before_or_equal' => 'The filing date cannot be in the future.',
        ]);

        $update = [
            'status' => $target,
            'amount' => array_key_exists('amount', $validated) && $validated['amount'] !== null ? (float) $validated['amount'] : $complianceItem->amount,
            'reference_no' => $validated['reference_no'] ?? $complianceItem->reference_no,
            'notes' => $validated['notes'] ?? $complianceItem->notes,
        ];
        if ($request->hasFile('evidence')) {
            $update['evidence_file'] = $request->file('evidence')->store('compliance-evidence', PrivateFiles::DISK);
        }

        if ($target === 'prepared') {
            $update += ['prepared_by' => $request->user()?->id, 'prepared_at' => now()];
        } else {
            // The actual filing date counts for lateness, not the day it was recorded here.
            $filedOn = Carbon::parse($validated['filed_on']);
            $update += ['submitted_by' => $request->user()?->id, 'submitted_at' => $filedOn->isToday() ? now() : $filedOn->setTime(12, 0)];
        }

        $complianceItem->update($update);

        $message = $target === 'prepared' ? 'marked prepared' : 'recorded as filed'.($complianceItem->fresh()->isLate() ? ' — after the due date' : '');

        return redirect()->back()->with('status', "{$complianceItem->title} {$message}.");
    }

    /**
     * The proof of filing / working file of an item, for people with compliance access to the branch.
     */
    public function evidence(ComplianceItem $complianceItem, EntityContext $entityContext): StreamedResponse
    {
        $this->assertEntity($complianceItem, $entityContext);
        abort_unless($complianceItem->evidence_file, 404);

        return PrivateFiles::response($complianceItem->evidence_file);
    }

    /**
     * Second-person sign-off on a submitted filing.
     */
    public function verify(Request $request, ComplianceItem $complianceItem, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($complianceItem, $entityContext);
        $this->assertNext($complianceItem, 'verified');

        $userId = $request->user()?->id;
        if (in_array($userId, [$complianceItem->prepared_by, $complianceItem->submitted_by], true)) {
            throw ValidationException::withMessages(['status' => 'You prepared or filed this item — another person must verify it.']);
        }

        $notes = $request->validate(['notes' => ['nullable', 'string', 'max:500']])['notes'] ?? null;

        $complianceItem->update([
            'status' => 'verified',
            'verified_by' => $userId,
            'verified_at' => now(),
            'notes' => $notes ?: $complianceItem->notes,
        ]);

        return redirect()->back()->with('status', "{$complianceItem->title} verified.");
    }

    /**
     * Send a submitted filing back to "prepared" with the reason (wrong amount, missing proof...).
     */
    public function returnForCorrection(Request $request, ComplianceItem $complianceItem, EntityContext $entityContext): RedirectResponse
    {
        $this->assertEntity($complianceItem, $entityContext);
        if ($complianceItem->status !== 'submitted') {
            throw ValidationException::withMessages(['status' => 'Only a submitted filing can be returned.']);
        }

        $reason = $request->validate(['reason' => ['required', 'string', 'max:300']])['reason'];

        $complianceItem->update([
            'status' => 'prepared',
            'submitted_by' => null,
            'submitted_at' => null,
            'notes' => trim(($complianceItem->notes ? $complianceItem->notes."\n" : '').'Returned by '.$request->user()?->name.' on '.now()->format('M j, Y').': '.$reason),
        ]);

        return redirect()->back()->with('status', "{$complianceItem->title} returned for correction.");
    }

    /**
     * Create the standard obligations for a month ("October 2026").
     */
    public function generateCalendar(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $data = $request->validate(['period' => ['nullable', 'string', 'max:30'], 'month' => ['nullable', 'date_format:Y-m']]);
        $period = isset($data['month'])
            ? Carbon::createFromFormat('Y-m-d', $data['month'].'-01')->format('F Y')
            : ($data['period'] ?? Carbon::now()->format('F Y'));

        if (! $this->periodStart($period)) {
            throw ValidationException::withMessages(['period' => 'Use a month like “October 2026”.']);
        }

        $res = $this->complianceCalendar->generateForPeriod((int) $entityContext->id(), $period);

        return redirect()->back()->with('status', "{$period}: {$res['created']} obligation(s) added, {$res['existing']} already on the calendar.");
    }

    // -----------------------------------------------------------------------------------------

    private function assertEntity(ComplianceItem $item, EntityContext $entityContext): void
    {
        abort_unless($item->entity_id === $entityContext->id(), 403);
    }

    private function assertNext(ComplianceItem $item, string $target): void
    {
        if ($item->nextStatus() !== $target) {
            $next = $item->nextStatus();
            throw ValidationException::withMessages([
                'status' => $next ? "This item is {$item->status}; the next step is “{$next}”." : 'This item is already verified.',
            ]);
        }
    }

    private function periodStart(string $period): ?Carbon
    {
        return (new ComplianceItem(['period' => $period]))->periodStart();
    }

    /** @return array{by: ?string, by_id: ?int, at: ?string}|null */
    private function stamp(?string $name, ?int $id, ?Carbon $at): ?array
    {
        return $at ? ['by' => $name, 'by_id' => $id, 'at' => $at->toIso8601String()] : null;
    }
}
