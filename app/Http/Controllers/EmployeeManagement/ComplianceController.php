<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\ComplianceItem;
use App\Services\People\ComplianceCalendar;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ComplianceController extends Controller
{
    public function __construct(protected ComplianceCalendar $complianceCalendar) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $category = $request->get('category');
        $status = $request->get('status');
        $period = $request->get('period');

        $query = ComplianceItem::query()
            ->with([
                'preparedByUser:id,firstname,lastname',
                'submittedByUser:id,firstname,lastname',
                'verifiedByUser:id,firstname,lastname',
            ])
            ->where('entity_id', $entityId)
            ->orderBy('due_date');

        if ($category) {
            $query->where('category', $category);
        }

        if ($status) {
            $query->where('status', $status);
        }

        if ($period) {
            $query->where('period', $period);
        }

        $items = $query->get()->map(fn (ComplianceItem $item) => [
            'id' => $item->id,
            'title' => $item->title,
            'form_code' => $item->form_code,
            'agency' => $item->agency,
            'category' => $item->category,
            'frequency' => $item->frequency,
            'period' => $item->period,
            'due_date' => $item->due_date?->format('Y-m-d'),
            'owner_role' => $item->owner_role,
            'status' => $item->status,
            'is_overdue' => $item->isOverdue(),
            'reference_no' => $item->reference_no,
            'amount' => (float) ($item->amount ?? 0),
            'notes' => $item->notes,
            'evidence_file' => $item->evidence_file,
            'prepared_by' => $item->preparedByUser?->name,
            'prepared_at' => $item->prepared_at?->format('M d, Y h:i A'),
            'submitted_by' => $item->submittedByUser?->name,
            'submitted_at' => $item->submitted_at?->format('M d, Y h:i A'),
            'verified_by' => $item->verifiedByUser?->name,
            'verified_at' => $item->verified_at?->format('M d, Y h:i A'),
        ]);

        $summary = [
            'total' => $items->count(),
            'pending' => $items->where('status', 'pending')->count(),
            'prepared' => $items->where('status', 'prepared')->count(),
            'submitted' => $items->where('status', 'submitted')->count(),
            'verified' => $items->where('status', 'verified')->count(),
            'overdue' => $items->where('is_overdue', true)->count(),
        ];

        return Inertia::render('employee-management/compliance/page', [
            'items' => $items,
            'summary' => $summary,
            'filters' => [
                'category' => $category,
                'status' => $status,
                'period' => $period,
            ],
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'form_code' => ['nullable', 'string', 'max:50'],
            'agency' => ['nullable', 'string', 'max:50'],
            'category' => ['required', 'string', 'in:statutory_tax,statutory_payroll,local_government,regulatory'],
            'frequency' => ['nullable', 'string'],
            'period' => ['required', 'string', 'max:100'],
            'due_date' => ['required', 'date'],
            'owner_role' => ['required', 'string', 'max:100'],
            'status' => ['required', 'in:pending,prepared,submitted,verified'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        ComplianceItem::create([
            'entity_id' => $entityId,
            ...$validated,
            'verified_by' => $validated['status'] === 'verified' ? $request->user()?->id : null,
            'verified_at' => $validated['status'] === 'verified' ? now() : null,
        ]);

        return redirect()->back()->with('status', 'Compliance item created successfully.');
    }

    /**
     * Advance status through the orderly lifecycle: pending -> prepared -> submitted -> verified
     */
    public function updateStatus(Request $request, ComplianceItem $complianceItem, EntityContext $entityContext): RedirectResponse
    {
        if ($complianceItem->entity_id !== $entityContext->id()) {
            abort(403);
        }

        $validated = $request->validate([
            'status' => ['required', 'in:prepared,submitted,verified'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
            'evidence' => ['nullable', 'file', 'max:10240'], // 10MB
        ]);

        $user = $request->user();
        $targetStatus = $validated['status'];

        $evidencePath = $complianceItem->evidence_file;
        if ($request->hasFile('evidence')) {
            $evidencePath = $request->file('evidence')->store('compliance-evidence', 'public');
        }

        $update = [
            'status' => $targetStatus,
            'reference_no' => $validated['reference_no'] ?? $complianceItem->reference_no,
            'amount' => isset($validated['amount']) ? (float) $validated['amount'] : $complianceItem->amount,
            'notes' => $validated['notes'] ?? $complianceItem->notes,
            'evidence_file' => $evidencePath,
        ];

        if ($targetStatus === 'prepared') {
            $update['prepared_by'] = $user?->id;
            $update['prepared_at'] = now();
        } elseif ($targetStatus === 'submitted') {
            $update['submitted_by'] = $user?->id;
            $update['submitted_at'] = now();
        } elseif ($targetStatus === 'verified') {
            $update['verified_by'] = $user?->id;
            $update['verified_at'] = now();
        }

        $complianceItem->update($update);

        return redirect()->back()->with('status', "Compliance item marked as {$targetStatus}.");
    }

    public function verify(Request $request, ComplianceItem $complianceItem, EntityContext $entityContext): RedirectResponse
    {
        return $this->updateStatus($request->merge(['status' => 'verified']), $complianceItem, $entityContext);
    }

    /**
     * Generate standard statutory calendar for a given period (e.g. October 2026).
     */
    public function generateCalendar(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $period = $request->input('period', Carbon::now()->format('F Y'));

        $res = $this->complianceCalendar->generateForPeriod($entityId, $period);

        return redirect()->back()->with('status', "Statutory calendar generated for {$period}: {$res['created']} items created, {$res['existing']} already existed.");
    }
}
