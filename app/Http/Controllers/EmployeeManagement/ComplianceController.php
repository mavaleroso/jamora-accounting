<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\ComplianceItem;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ComplianceController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $category = $request->get('category');
        $status = $request->get('status');
        $period = $request->get('period');

        $query = ComplianceItem::query()
            ->with('verifiedByUser:id,firstname,lastname')
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
            'category' => $item->category,
            'period' => $item->period,
            'due_date' => $item->due_date?->format('Y-m-d'),
            'owner_role' => $item->owner_role,
            'status' => $item->status,
            'reference_no' => $item->reference_no,
            'amount' => (float) ($item->amount ?? 0),
            'notes' => $item->notes,
            'verified_by' => $item->verifiedByUser?->name,
            'verified_at' => $item->verified_at?->format('M d, Y h:i A'),
        ]);

        $summary = [
            'total' => $items->count(),
            'pending' => $items->where('status', 'pending')->count(),
            'prepared' => $items->where('status', 'prepared')->count(),
            'submitted' => $items->where('status', 'submitted')->count(),
            'verified' => $items->where('status', 'verified')->count(),
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
            'category' => ['required', 'string', 'in:statutory_tax,statutory_payroll,local_government,regulatory'],
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

    public function verify(Request $request, ComplianceItem $complianceItem): RedirectResponse
    {
        $data = [
            'status' => 'verified',
            'verified_by' => $request->user()?->id,
            'verified_at' => now(),
        ];

        if ($request->filled('reference_no')) {
            $data['reference_no'] = $request->input('reference_no');
        }
        if ($request->filled('amount')) {
            $data['amount'] = (float) $request->input('amount');
        }
        if ($request->filled('notes')) {
            $data['notes'] = $request->input('notes');
        }

        $complianceItem->update($data);

        return redirect()->back()->with('status', 'Compliance item verified.');
    }
}
