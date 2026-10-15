<?php

namespace App\Http\Requests\Accounting;

use App\Services\Accounting\CashMovementService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class JournalEntryStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'journal_id' => ['required', 'integer', 'exists:journals,id'],
            'entry_date' => ['required', 'date'],
            'reference' => ['nullable', 'string', 'max:255'],
            'memo' => ['nullable', 'string', 'max:2000'],
            'status' => ['nullable', 'string', 'in:draft,pending'],
            'lines' => ['required', 'array', 'min:2'],
            'lines.*.account_id' => ['required', 'integer', 'exists:accounts,id'],
            'lines.*.debit' => ['required', 'numeric', 'min:0'],
            'lines.*.credit' => ['required', 'numeric', 'min:0'],
            'lines.*.memo' => ['nullable', 'string', 'max:500'],
            'lines.*.cost_center_id' => ['nullable', 'integer', 'exists:cost_centers,id'],
        ];
    }

    /**
     * Manual journals are for non-cash adjustments only (depreciation, accruals, reclassifications). Cash and
     * bank movements go through Cash & Bank Records, invoices, deposits or bills so the bank register and
     * reconciliation stay complete.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            $cashIds = app(CashMovementService::class)->cashAccountIds();
            foreach ((array) $this->input('lines', []) as $i => $line) {
                if (in_array((int) ($line['account_id'] ?? 0), $cashIds, true)) {
                    $validator->errors()->add("lines.{$i}.account_id", 'Cash and bank accounts cannot be used in a manual journal. Record the movement in Cash & Bank Records.');
                }
            }
        }];
    }
}
