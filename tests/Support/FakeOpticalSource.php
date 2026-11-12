<?php

namespace Tests\Support;

use App\Services\Optical\OpticalSource;
use ArrayAccess;
use RuntimeException;

/**
 * A stand-in optical POS for tests of the booking rules: it hands out whatever records a test puts in it, in full
 * on every read (it ignores "since"), which also proves documents are idempotent.
 *
 *   $pos['orders'] = [...]; $pos['payments'] = [...]; $pos['inventory/receipts'] = [...];
 *   $pos['inventory/movements'] = [...]; $pos['clients'], $pos['suppliers'], $pos['users'], $pos['services']
 *
 * OpticalDatabaseTest covers reading the real thing.
 *
 * @implements ArrayAccess<string, list<array<string, mixed>>>
 */
class FakeOpticalSource implements ArrayAccess, OpticalSource
{
    protected const KEYS = ['receipts' => 'inventory/receipts', 'movements' => 'inventory/movements'];

    /** @var array<string, list<array<string, mixed>>> */
    public array $records = [];

    public bool $configured = true;

    /** The POS can't be read: streams fail and passwords can't be checked. */
    public bool $down = false;

    /** @var array<int, string> POS user id => password */
    public array $passwords = [];

    /** @var list<array{0: int, 1: string}> every password check asked of the POS */
    public array $passwordChecks = [];

    /** @var array<string, mixed> */
    public array $stock = [];

    /** Microseconds each record takes to read (to try time limits). */
    public int $delay = 0;

    /** @var list<array{0: string, 1: array<string, mixed>}> every stream read, with its filters */
    public array $reads = [];

    public function isConfigured(): bool
    {
        return $this->configured;
    }

    public function problem(): ?string
    {
        return match (true) {
            ! $this->configured => 'The optical POS database is not configured.',
            $this->down => 'The optical POS database cannot be read: connection refused',
            default => null,
        };
    }

    public function label(): ?string
    {
        return $this->configured ? 'optical-test on 127.0.0.1' : null;
    }

    public function each(string $stream, array $filters, callable $callback, ?callable $afterPage = null): int
    {
        $this->reads[] = [$stream, $filters];
        $this->failWhenDown();

        $count = 0;
        foreach (array_values($this->records[self::KEYS[$stream] ?? $stream] ?? []) as $record) {
            $count++;
            if ($this->delay > 0) {
                usleep($this->delay);
            }
            if ($callback($record) === false) {
                return $count;
            }
        }

        if ($afterPage) {
            $afterPage();
        }

        return $count;
    }

    public function ordersById(array $ids): array
    {
        return $this->byId('orders', $ids);
    }

    public function paymentsById(array $ids): array
    {
        return $this->byId('payments', $ids);
    }

    public function stockSummary(): array
    {
        $this->failWhenDown();

        return $this->stock;
    }

    public function services(): array
    {
        $this->failWhenDown();

        return array_values($this->records['services'] ?? []);
    }

    public function passwordMatches(int $opticalUserId, string $password): ?bool
    {
        $this->passwordChecks[] = [$opticalUserId, $password];

        return $this->down ? null : ($this->passwords[$opticalUserId] ?? null) === $password;
    }

    public function offsetExists(mixed $offset): bool
    {
        return isset($this->records[$offset]);
    }

    public function offsetGet(mixed $offset): mixed
    {
        return $this->records[$offset] ?? [];
    }

    public function offsetSet(mixed $offset, mixed $value): void
    {
        $this->records[$offset] = $value;
    }

    public function offsetUnset(mixed $offset): void
    {
        unset($this->records[$offset]);
    }

    /**
     * @param  list<int>  $ids
     * @return list<array<string, mixed>>
     */
    protected function byId(string $key, array $ids): array
    {
        $this->failWhenDown();
        $ids = array_map('intval', $ids);

        return array_values(array_filter($this->records[$key] ?? [], fn (array $r) => in_array((int) $r['id'], $ids, true)));
    }

    protected function failWhenDown(): void
    {
        if ($this->down) {
            throw new RuntimeException('SQLSTATE[HY000] [2002] Connection refused');
        }
    }
}
