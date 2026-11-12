<?php

namespace App\Services\Optical;

use Carbon\CarbonInterface;

/**
 * Where accounting reads the optical POS from. The application reads optical-new's database (OpticalDatabase).
 *
 * Streams hand out plain records, oldest change first:
 *
 *   users, clients, suppliers   the POS's staff, wholesale clients and suppliers
 *   payments                    order payments, each with a snapshot of its order
 *   orders                      orders (open, completed and deleted) with their line items
 *   receipts                    supplier deliveries: stock grouped by supplier and delivery receipt, at decoded cost
 *   movements                   stock tagged sold, defective, expired or returned, one record per item and event
 */
interface OpticalSource
{
    public const STREAMS = ['users', 'clients', 'suppliers', 'payments', 'orders', 'receipts', 'movements'];

    /** Whether a source is set up at all (it may still be unreachable). */
    public function isConfigured(): bool;

    /** Why the source can't be read right now, or null when it can. */
    public function problem(): ?string;

    /** A short name for the source, for the screens (e.g. the database and its server). */
    public function label(): ?string;

    /**
     * Call $callback for every record of a stream, oldest change first, and $afterPage after each batch. Either may
     * return false to stop reading.
     *
     * @param  array{since?: CarbonInterface|null, from?: string|null}  $filters  since: only records changed at or
     *                                                                            after it; from: only stock dated on or after this day (Y-m-d)
     * @param  callable(array<string, mixed>): mixed  $callback
     * @param  (callable(): mixed)|null  $afterPage
     * @return int records handed out
     */
    public function each(string $stream, array $filters, callable $callback, ?callable $afterPage = null): int;

    /**
     * @param  list<int>  $ids
     * @return list<array<string, mixed>>
     */
    public function ordersById(array $ids): array;

    /**
     * @param  list<int>  $ids
     * @return list<array<string, mixed>>
     */
    public function paymentsById(array $ids): array;

    /**
     * Stock on hand right now: counts and value by type, and every brand/code/category group with its low-stock flag.
     *
     * @return array<string, mixed>
     */
    public function stockSummary(): array;

    /**
     * The service fee library, deleted services included (old orders still carry them).
     *
     * @return list<array{id: int, name: string, billed_by: string|null, is_active: bool}>
     */
    public function services(): array;

    /**
     * Whether the password is the POS user's, or null when the POS can't be read.
     */
    public function passwordMatches(int $opticalUserId, string $password): ?bool;
}
