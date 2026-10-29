<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A periodic performance review (Employee Handbook, Performance Evaluations). The evaluator rates the employee on each
 * criterion (1–5) against the period's standards and records strengths, problems to resolve and growth goals.
 * Workflow: draft (evaluator only, editable) -> shared (the employee sees it) -> acknowledged (the employee has read
 * it, with optional comments). A shared review is no longer edited.
 */
class PerformanceEvaluation extends Model
{
    use BelongsToEntity;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_SHARED = 'shared';

    public const STATUS_ACKNOWLEDGED = 'acknowledged';

    public const REVIEW_TYPES = [
        'probationary' => 'Probationary review',
        'periodic' => 'Periodic review',
        'special' => 'Special review',
    ];

    /** criterion key => [label, what is looked at] — from the handbook's standards of work and conduct. */
    public const CRITERIA = [
        'quality' => ['Quality of work', 'Accuracy and care in recording, ordering, handling and dispensing products.'],
        'customer_service' => ['Customer service', 'Courtesy, promptness and the “Company experience” for every customer.'],
        'attendance' => ['Attendance & punctuality', 'Reports on time, ready to work; follows the absence and leave rules.'],
        'teamwork' => ['Teamwork', 'Works well with co-workers and supervisors; covers when needed.'],
        'compliance' => ['Policies & conduct', 'Follows company policies, the uniform and grooming rules and the Code of Conduct.'],
        'initiative' => ['Initiative & growth', 'Takes on work without being asked; learns and improves.'],
    ];

    protected $fillable = [
        'entity_id', 'employee_id', 'evaluator_id', 'review_type', 'period_start', 'period_end', 'review_date',
        'ratings', 'overall_rating', 'standards', 'strengths', 'improvements', 'goals',
        'status', 'shared_at', 'employee_comments', 'acknowledged_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date:Y-m-d',
            'period_end' => 'date:Y-m-d',
            'review_date' => 'date:Y-m-d',
            'ratings' => 'array',
            'overall_rating' => 'decimal:2',
            'shared_at' => 'datetime',
            'acknowledged_at' => 'datetime',
        ];
    }

    /**
     * The average of the criteria rated, to two decimals; null when none is rated.
     *
     * @param  array<string, int|null>  $ratings
     */
    public static function overall(array $ratings): ?float
    {
        $rated = array_filter($ratings, fn ($r) => $r !== null);

        return $rated === [] ? null : round(array_sum($rated) / count($rated), 2);
    }

    public function isDraft(): bool
    {
        return $this->status === self::STATUS_DRAFT;
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function evaluator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'evaluator_id');
    }
}
