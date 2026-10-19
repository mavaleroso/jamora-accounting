<?php

namespace App\Support;

use Illuminate\Contracts\Database\Query\Builder;

/**
 * Records created from another system (optical-new users) mark the text fields it doesn't provide with "-".
 * Wherever the app checks for a missing value (government IDs, names), "-" counts as missing.
 */
final class MissingValue
{
    public const MARK = '-';

    public static function is(mixed $value): bool
    {
        return blank($value) || trim((string) $value) === self::MARK;
    }

    /**
     * OR-where the column is NULL, empty or "-".
     */
    public static function orWhereMissing(Builder $query, string $column): Builder
    {
        return $query->orWhereNull($column)->orWhereIn($column, ['', self::MARK]);
    }
}
