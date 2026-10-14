<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One payroll computation for a pay period. Lifecycle (App\Services\Payroll\PayrollService):
 *   draft (recomputable, adjustable) -> approved (cut-off timesheets locked) -> posted (journal entry)
 *   -> paid (released, payment entry). A draft can be voided; an approved run can be returned to draft.
 */
class PayrollRun extends Model
{
    use BelongsToEntity;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_POSTED = 'posted';

    public const STATUS_PAID = 'paid';

    public const STATUS_VOID = 'void';

    /** Runs whose payslips employees may see. */
    public const RELEASED_STATUSES = [self::STATUS_POSTED, self::STATUS_PAID];

    protected $fillable = [
        'entity_id', 'payroll_period_id', 'run_no', 'status', 'headcount',
        'gross_total', 'deduction_total', 'net_total', 'employer_total', 'warnings', 'notes',
        'journal_entry_id', 'computed_by', 'computed_at', 'approved_by', 'approved_at',
        'posted_by', 'posted_at', 'paid_by', 'paid_at', 'paid_on', 'bank_account_id',
        'payment_journal_entry_id', 'voided_at',
    ];

    protected function casts(): array
    {
        return [
            'gross_total' => 'decimal:2',
            'deduction_total' => 'decimal:2',
            'net_total' => 'decimal:2',
            'employer_total' => 'decimal:2',
            'warnings' => 'array',
            'computed_at' => 'datetime',
            'approved_at' => 'datetime',
            'posted_at' => 'datetime',
            'paid_at' => 'datetime',
            'paid_on' => 'date',
            'voided_at' => 'datetime',
        ];
    }

    public function isDraft(): bool
    {
        return $this->status === self::STATUS_DRAFT;
    }

    public function period(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class, 'payroll_period_id');
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }

    public function adjustments(): HasMany
    {
        return $this->hasMany(PayrollAdjustment::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function paymentJournalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'payment_journal_entry_id');
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function computer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'computed_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by');
    }
}
