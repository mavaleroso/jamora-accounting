<?php

namespace App\Services\Optical;

use App\Jobs\RunOpticalSync;
use App\Models\Entity;
use App\Models\SyncCursor;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Pulls optical-new's accounting API into the books, stream by stream, each from where it last stopped:
 *
 *   users              → logins (a copy of each user) and employee records
 *   clients, suppliers → customer / supplier records
 *   payments           → customer deposits                       (before orders, so sales find their deposits)
 *   orders             → invoices, deposit application, cost of goods sold, reversals
 *   receipts           → inventory received not billed
 *   movements          → write-offs, returns, stock sold without an order
 *
 * Every document is idempotent (payload hash), so overlapping reads and retries are safe. Failed documents are
 * retried at the start of the next run.
 */
class OpticalSyncService
{
    public const STREAMS = ['users', 'clients', 'suppliers', 'payments', 'orders', 'receipts', 'movements'];

    protected const LOCK = 'optical-sync';

    /** Upper bound only: a run whose heartbeat stops for STALE_MINUTES is closed and its lock released. */
    protected const LOCK_SECONDS = 12 * 3600;

    /** A running run touches itself after every page; one silent this long has died (or no worker took a queued one). */
    public const STALE_MINUTES = 15;

    protected SyncRun $run;

    /** @var array<string, array{read: int, booked: int, skipped: int, failed: int, error?: string}> */
    protected array $stats = [];

    /** @var array<int, true> orders to re-read after a payment change reversed their sale */
    protected array $resyncOrders = [];

    public function __construct(
        protected OpticalApiClient $api,
        protected OpticalRouter $router,
        protected OpticalDocuments $documents,
        protected OpticalDepositSync $deposits,
        protected OpticalSaleSync $sales,
        protected OpticalStockSync $stock,
        protected OpticalUserSync $users,
    ) {}

    /**
     * Record a run and hand it to the queue, so a long sync never holds a web request open.
     *
     * @param  array{full?: bool, streams?: list<string>, retry_failed?: bool}  $options
     */
    public function queue(?User $user = null, array $options = []): SyncRun
    {
        if (! $this->api->isConfigured()) {
            throw new RuntimeException('The optical API is not configured: set OPTICAL_API_BASE_URL and OPTICAL_API_TOKEN.');
        }

        if ($this->active()) {
            throw new RuntimeException('An optical sync is already queued or running. Try again when it finishes.');
        }

        $run = SyncRun::query()->create(['started_at' => now(), 'status' => 'queued', 'triggered_by' => $user?->id]);
        RunOpticalSync::dispatch($run->id, $options);

        return $run;
    }

    /**
     * The run that is queued or running, after closing any that stopped without finishing.
     */
    public function active(): ?SyncRun
    {
        $this->closeStaleRuns();

        return SyncRun::query()->whereIn('status', ['queued', 'running'])->latest('id')->first();
    }

    /**
     * @param  array{full?: bool, streams?: list<string>, retry_failed?: bool}  $options
     * @param  SyncRun|null  $run  a queued run to carry out; a new one is recorded otherwise
     */
    public function run(?User $user = null, array $options = [], ?SyncRun $run = null): SyncRun
    {
        if (! $this->api->isConfigured()) {
            throw new RuntimeException('The optical API is not configured: set OPTICAL_API_BASE_URL and OPTICAL_API_TOKEN.');
        }

        $lock = Cache::lock(self::LOCK, self::LOCK_SECONDS);
        if (! $lock->get()) {
            // The lock outlives a process that died mid-run; free it when the run holding it has gone silent.
            $this->closeStaleRuns();
            if (SyncRun::query()->where('status', 'running')->exists()) {
                throw new RuntimeException('An optical sync is already running. Try again when it finishes.');
            }
            $lock->forceRelease();
            if (! $lock->get()) {
                throw new RuntimeException('An optical sync is already running. Try again when it finishes.');
            }
        }

        $this->closeStaleRuns();
        $this->stats = [];
        $this->resyncOrders = [];
        $this->run = $run ?? new SyncRun(['triggered_by' => $user?->id]);
        $this->run->fill(['started_at' => now(), 'status' => 'running'])->save();

        try {
            if ($options['retry_failed'] ?? true) {
                $this->retryFailed();
            }

            $streams = array_values(array_intersect(self::STREAMS, $options['streams'] ?? self::STREAMS));
            foreach ($streams as $stream) {
                $this->stream($stream, (bool) ($options['full'] ?? false));
            }

            $this->resyncPendingOrders();
            $this->refreshStockSummary();
        } finally {
            $this->finish();
            $lock->release();
        }

        return $this->run->fresh();
    }

    /**
     * Keep the stock summary (on hand, value, low stock) fresh for the dashboard and inventory screen.
     */
    protected function refreshStockSummary(): void
    {
        try {
            Cache::put('optical.stock-summary', [...$this->api->stockSummary(), 'read_at' => now()->toIso8601String()], now()->addHours(2));
        } catch (Throwable $e) {
            Log::warning('Optical stock summary could not be read', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Re-process one failed or flagged document.
     */
    public function retry(SyncDocument $document, ?User $user = null): SyncRun
    {
        $this->stats = [];
        $this->resyncOrders = [];
        $this->run = SyncRun::query()->create(['started_at' => now(), 'status' => 'running', 'triggered_by' => $user?->id]);

        try {
            $this->retryDocuments(collect([$document]));
            $this->resyncPendingOrders();
        } finally {
            $this->finish();
        }

        return $this->run->fresh();
    }

    protected function stream(string $stream, bool $full): void
    {
        $cursor = SyncCursor::query()->firstOrCreate(['source_system' => 'optical', 'stream' => $stream]);
        // Users are few and read in full every time, so a user removed from optical-new is noticed.
        $since = $full || ! $cursor->cursor_at || $stream === 'users' ? null : $cursor->cursor_at->copy()->subMinutes((int) config('optical.cursor_overlap_minutes', 10));
        $start = $this->router->startDate();
        $newest = $cursor->cursor_at;

        [$path, $query] = match ($stream) {
            'users' => ['users', []],
            'clients' => ['clients', []],
            'suppliers' => ['suppliers', []],
            'payments' => ['payments', ['include_open' => 1, 'with_deleted' => 1]],
            // Orders completed on or after go-live were updated on or after it too.
            'orders' => ['orders', ['include_open' => 1, 'with_deleted' => 1] + ($since === null && $start ? ['updated_since' => $start] : [])],
            'receipts' => ['inventory/receipts', $start ? ['from' => $start] : []],
            'movements' => ['inventory/movements', $start ? ['from' => $start] : []],
        };

        if ($since !== null) {
            $query['updated_since'] = $since->toIso8601String();
        }
        $query['sort'] = 'updated_at';

        $this->stats[$stream] = ['read' => 0, 'booked' => 0, 'skipped' => 0, 'failed' => 0];
        $seen = [];

        try {
            $this->api->each($path, $query, function (array $record) use ($stream, &$newest, &$seen) {
                $this->stats[$stream]['read']++;
                $seen[] = (int) ($record['id'] ?? 0);
                $this->handle($stream, $record);

                $updated = isset($record['updated_at']) ? Carbon::parse($record['updated_at']) : null;
                if ($updated && (! $newest || $updated->greaterThan($newest))) {
                    $newest = $updated;
                }
            }, function () use ($stream, $cursor, &$newest) {
                // These feeds come oldest change first, so a run that stops resumes after the last finished page.
                // (Clients and suppliers come by name: their cursor only moves once the whole list is read.)
                if (in_array($stream, ['payments', 'orders', 'receipts', 'movements'], true)) {
                    $cursor->update(['cursor_at' => $newest, 'last_run_id' => $this->run->id]);
                }
                $this->heartbeat();
            });

            $cursor->update(['cursor_at' => $newest, 'last_run_id' => $this->run->id]);

            if ($stream === 'users' && $seen !== []) {
                $this->stats['users']['booked'] += $this->users->disableMissing($seen);
            }
        } catch (Throwable $e) {
            // The cursor is not advanced, so the next run reads this stream again from the same point.
            Log::error("Optical sync stream {$stream} failed", ['error' => $e->getMessage()]);
            $this->stats[$stream]['error'] = $e->getMessage();
        }
    }

    /**
     * @param  array<string, mixed>  $record
     * @param  string|null  $statsKey  where the outcome is counted (default: the stream)
     */
    protected function handle(string $stream, array $record, ?string $statsKey = null): void
    {
        $statsKey ??= $stream;

        [$type, $id] = match ($stream) {
            'payments' => [OpticalDepositSync::DOC, $record['id'] ?? null],
            'orders' => [OpticalSaleSync::DOC, $record['id'] ?? null],
            'receipts' => [OpticalStockSync::RECEIPT_DOC, $record['key'] ?? null],
            'movements' => [OpticalStockSync::MOVEMENT_DOC, isset($record['id']) ? "{$record['stock_type']}:{$record['id']}:{$record['event_type']}" : null],
            default => [$stream, $record['id'] ?? null],
        };

        try {
            // Staff, customer and supplier records are kept current; they post nothing themselves.
            $outcome = match ($stream) {
                'users' => $this->users->process($record),
                'clients' => tap('skipped', fn () => $this->router->upsertClient($record)),
                'suppliers' => tap('skipped', fn () => $this->router->vendorFor($record['name'] ?? null, (int) $record['id'], $record)),
                'payments' => $this->payment($record),
                'orders' => $this->sales->process($record),
                'receipts' => $this->stock->receipt($record),
                'movements' => $this->stock->movement($record),
            };

            $this->count($statsKey, $outcome);
        } catch (Throwable $e) {
            $this->count($statsKey, 'failed');

            if ($id !== null && in_array($stream, ['payments', 'orders', 'receipts', 'movements'], true)) {
                $this->documents->fail($this->entityForFailure($stream, $record), $type, $id, $record, $e->getMessage());
            }
        }
    }

    /**
     * @param  array<string, mixed>  $payment
     */
    protected function payment(array $payment): string
    {
        [$outcome, $resyncOrder] = $this->deposits->process($payment);

        if ($resyncOrder) {
            $this->resyncOrders[$resyncOrder] = true;
        }

        return $outcome;
    }

    /**
     * Orders whose sale was reversed because one of their payments changed: read them again and book them anew.
     */
    protected function resyncPendingOrders(): void
    {
        $ids = array_keys($this->resyncOrders);
        $this->resyncOrders = [];

        foreach (array_chunk($ids, 50) as $chunk) {
            foreach ($this->api->ordersById($chunk) as $order) {
                $this->handle('orders', $order);
            }
        }
    }

    protected function retryFailed(): void
    {
        $failed = SyncDocument::query()
            ->withoutGlobalScope('entity')
            ->where('source_system', 'optical')
            ->where('status', 'failed')
            ->orderBy('updated_at')
            ->limit(500)
            ->get();

        $this->retryDocuments($failed);
    }

    /**
     * Payments and orders are read fresh from the API; stock documents replay their stored payload.
     *
     * @param  Collection<int, SyncDocument>  $documents
     */
    protected function retryDocuments($documents): void
    {
        $this->stats['retries'] ??= ['read' => 0, 'booked' => 0, 'skipped' => 0, 'failed' => 0];

        foreach ($documents->groupBy('source_type') as $type => $docs) {
            try {
                $records = match ($type) {
                    OpticalDepositSync::DOC => $this->api->paymentsById($docs->pluck('source_id')->map(fn ($id) => (int) $id)->all()),
                    OpticalSaleSync::DOC => $this->api->ordersById($docs->pluck('source_id')->map(fn ($id) => (int) $id)->all()),
                    default => $docs->pluck('payload')->filter()->values()->all(),
                };
            } catch (Throwable $e) {
                $this->stats['retries']['error'] = $e->getMessage();

                continue;
            }

            $stream = match ($type) {
                OpticalDepositSync::DOC => 'payments',
                OpticalSaleSync::DOC => 'orders',
                OpticalStockSync::RECEIPT_DOC => 'receipts',
                OpticalStockSync::MOVEMENT_DOC => 'movements',
                default => null,
            };

            if ($stream === null) {
                continue;
            }

            foreach ($records as $record) {
                $this->stats['retries']['read']++;
                $this->handle($stream, $record, 'retries');
            }
            $this->heartbeat();
        }
    }

    /** Tell other requests this run is still alive. */
    protected function heartbeat(): void
    {
        $this->run->touch();
    }

    /**
     * Close runs that stopped without finishing: a running one whose heartbeat went silent (its process died), or a
     * queued one that no queue worker picked up.
     */
    protected function closeStaleRuns(): void
    {
        $cutoff = now()->subMinutes(self::STALE_MINUTES);

        SyncRun::query()->where('status', 'running')->where('updated_at', '<', $cutoff)
            ->update(['status' => 'failed', 'finished_at' => now(), 'message' => 'Stopped without finishing (the process ended). The next run picks up where it stopped.']);
        SyncRun::query()->where('status', 'queued')->where('updated_at', '<', $cutoff)
            ->update(['status' => 'failed', 'finished_at' => now(), 'message' => 'Never started: no queue worker took it. Start one with "php artisan queue:work".']);
    }

    protected function count(string $stream, string $outcome): void
    {
        $this->stats[$stream] ??= ['read' => 0, 'booked' => 0, 'skipped' => 0, 'failed' => 0];

        $key = match ($outcome) {
            'posted', 'review', 'reversed', 'created', 'updated' => 'booked',
            'failed' => 'failed',
            default => 'skipped',
        };
        $this->stats[$stream][$key]++;
    }

    /**
     * @param  array<string, mixed>  $record
     */
    protected function entityForFailure(string $stream, array $record): ?Entity
    {
        try {
            return match ($stream) {
                'payments' => $this->router->collectorFor($record['order'] ?? []),
                'orders' => $this->router->collectorFor($record),
                default => $this->router->productEntity(),
            };
        } catch (Throwable) {
            return null;
        }
    }

    protected function finish(): void
    {
        $totals = ['read' => 0, 'booked' => 0, 'skipped' => 0, 'failed' => 0];
        $parts = [];
        $streamErrors = [];

        foreach ($this->stats as $stream => $s) {
            foreach ($totals as $key => $value) {
                $totals[$key] = $value + ($s[$key] ?? 0);
            }
            if (($s['read'] ?? 0) > 0 || isset($s['error'])) {
                $verb = $stream === 'users' ? 'saved' : 'booked';
                $parts[] = "{$stream}: {$s['read']} read, {$s['booked']} {$verb}".($s['failed'] ? ", {$s['failed']} failed" : '');
            }
            if (isset($s['error'])) {
                $streamErrors[] = "{$stream}: {$s['error']}";
            }
        }

        $status = match (true) {
            $streamErrors !== [] && $totals['read'] === 0 => 'failed',
            $streamErrors !== [] || $totals['failed'] > 0 => 'completed_with_errors',
            default => 'completed',
        };

        $this->run->update([
            'finished_at' => now(),
            'status' => $status,
            'processed' => $totals['read'],
            'created_entries' => $totals['booked'],
            'skipped' => $totals['skipped'],
            'failed' => $totals['failed'],
            'message' => mb_substr(implode('; ', [...$parts, ...array_map(fn ($e) => 'Error — '.$e, $streamErrors)]) ?: 'Nothing new to sync.', 0, 2000),
        ]);
    }
}
