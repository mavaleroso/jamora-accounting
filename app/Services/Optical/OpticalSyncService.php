<?php

namespace App\Services\Optical;

use App\Models\Entity;
use App\Models\SyncCursor;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use App\Models\User;
use App\Support\EntityContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Books what is new or changed in the optical POS, read straight from its database (OpticalSource), stream by
 * stream, each from where it last stopped:
 *
 *   users              → logins (a copy of each user) and employee records
 *   clients, suppliers → customer / supplier records
 *   payments           → customer deposits                       (before orders, so sales find their deposits)
 *   orders             → invoices, deposit application, cost of goods sold, reversals
 *   receipts           → inventory received not billed
 *   movements          → write-offs, returns, stock sold without an order
 *
 * It runs on its own (catchUp: while people use accounting, and from the scheduler), so the books follow the POS
 * without anyone starting it. Every document is idempotent (payload hash), so overlapping reads and retries are
 * safe. Failed documents are retried at the start of a run.
 */
class OpticalSyncService
{
    public const STREAMS = OpticalSource::STREAMS;

    public const NOT_CONFIGURED = 'The optical POS database is not configured: set OPTICAL_DB_DATABASE (with OPTICAL_DB_HOST, OPTICAL_DB_USERNAME and OPTICAL_DB_PASSWORD).';

    protected const LOCK = 'optical-sync';

    /** Upper bound only: a run whose heartbeat stops for STALE_MINUTES is closed and its lock released. */
    protected const LOCK_SECONDS = 12 * 3600;

    /** A running run touches itself after every page; one silent this long has died. */
    public const STALE_MINUTES = 15;

    /** Money streams are small tables, cheap to check often; staff and stock (large tables) are checked less often. */
    public const QUICK_STREAMS = ['clients', 'suppliers', 'payments', 'orders'];

    public const SLOW_STREAMS = ['users', 'receipts', 'movements'];

    /** Cache keys that pace the checks the books make on their own. */
    protected const AUTO_CHECK = 'optical.auto-check';

    protected const AUTO_SLOW = 'optical.auto-check-slow';

    protected const AUTO_RETRY = 'optical.auto-retry';

    protected const SCHEDULER_SEEN = 'optical.scheduler-seen';

    protected SyncRun $run;

    /** @var array<string, array{read: int, booked: int, skipped: int, failed: int, error?: string}> */
    protected array $stats = [];

    /** @var array<int, true> orders to re-read after a payment change reversed their sale */
    protected array $resyncOrders = [];

    /** When a run with a time budget must stop reading (microtime), and whether it has. */
    protected ?float $deadline = null;

    protected bool $outOfTime = false;

    public function __construct(
        protected OpticalSource $source,
        protected OpticalRouter $router,
        protected OpticalDocuments $documents,
        protected OpticalDepositSync $deposits,
        protected OpticalSaleSync $sales,
        protected OpticalStockSync $stock,
        protected OpticalUserSync $users,
        protected EntityContext $context,
    ) {}

    /**
     * Book what changed in the POS, quietly. A check that finds nothing leaves no trace; one that books or fails
     * something is listed like any other run. Failed documents are retried once an hour.
     *
     * Where a scheduler runs, it calls this every minute ($scheduled) and everything is checked. Where none can run
     * (shared hosting), page visits do the work instead, and stand aside whenever a scheduler is seen:
     *
     *   - before a page is built, payments and orders (small tables) at most every optical.auto_refresh_seconds,
     *     within a short budget, so the page already shows them ($slow false);
     *   - after the page has been sent, staff and stock (large tables) every optical.auto_refresh_slow_seconds, with
     *     a longer budget, since nobody is waiting on it ($slow true).
     */
    public function catchUp(bool $scheduled = false, ?int $budgetSeconds = null, bool $slow = false): ?SyncRun
    {
        if (! $this->source->isConfigured()) {
            return null;
        }

        $streams = self::STREAMS;

        if ($scheduled) {
            Cache::put(self::SCHEDULER_SEEN, true, 180);
        } else {
            $interval = $slow
                ? max((int) config('optical.auto_refresh_seconds', 15), (int) config('optical.auto_refresh_slow_seconds', 120))
                : (int) config('optical.auto_refresh_seconds', 15);

            if ((int) config('optical.auto_refresh_seconds', 15) <= 0 || $this->schedulerRunning() || ! Cache::add($slow ? self::AUTO_SLOW : self::AUTO_CHECK, true, $interval)) {
                return null;
            }

            $streams = $slow ? self::SLOW_STREAMS : self::QUICK_STREAMS;
        }

        try {
            // Postings go to each entity's own books, whichever company the person browsing has open.
            return $this->context->runWithout(fn () => $this->run(null, [
                'quiet' => true,
                'streams' => $streams,
                'budget' => $budgetSeconds,
                'retry_failed' => Cache::add(self::AUTO_RETRY, true, 3600),
            ]));
        } catch (RuntimeException) {
            return null; // another check is already running
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }

    /** Whether a scheduler has checked the POS in the last few minutes. */
    public function schedulerRunning(): bool
    {
        return Cache::has(self::SCHEDULER_SEEN);
    }

    /**
     * The run in progress, after closing any that stopped without finishing.
     */
    public function active(): ?SyncRun
    {
        $this->closeStaleRuns();

        return SyncRun::query()->where('status', 'running')->latest('id')->first();
    }

    /**
     * Options — full: read every stream from the start; budget: stop reading after this many seconds (the next run
     * continues from there); quiet: keep no record of a run that found nothing.
     *
     * @param  array{full?: bool, streams?: list<string>, retry_failed?: bool, budget?: int|null, quiet?: bool}  $options
     * @return SyncRun|null null only for a quiet run that found nothing
     */
    public function run(?User $user = null, array $options = []): ?SyncRun
    {
        if (! $this->source->isConfigured()) {
            throw new RuntimeException(self::NOT_CONFIGURED);
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
        $this->outOfTime = false;
        $this->deadline = ($options['budget'] ?? null) ? microtime(true) + (int) $options['budget'] : null;
        $this->run = SyncRun::query()->create(['triggered_by' => $user?->id, 'started_at' => now(), 'status' => 'running']);

        try {
            if ($options['retry_failed'] ?? true) {
                $this->retryFailed();
            }

            $streams = array_values(array_intersect(self::STREAMS, $options['streams'] ?? self::STREAMS));
            foreach ($streams as $stream) {
                if ($this->outOfTime()) {
                    break;
                }
                $this->stream($stream, (bool) ($options['full'] ?? false));
            }

            $this->resyncPendingOrders();
        } finally {
            $this->finish((bool) ($options['quiet'] ?? false));
            $lock->release();
        }

        return $this->run->exists ? $this->run->fresh() : null;
    }

    /** Whether a run with a time budget has used it up. */
    protected function outOfTime(): bool
    {
        return $this->outOfTime = $this->outOfTime || ($this->deadline !== null && microtime(true) >= $this->deadline);
    }

    /**
     * Re-process one failed or flagged document.
     */
    public function retry(SyncDocument $document, ?User $user = null): SyncRun
    {
        $this->stats = [];
        $this->resyncOrders = [];
        $this->deadline = null;
        $this->outOfTime = false;
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

        $filters = match ($stream) {
            // Orders completed on or after go-live were changed on or after it too.
            'orders' => ['since' => $since ?? ($start ? Carbon::parse($start, 'Asia/Manila')->startOfDay() : null)],
            'receipts', 'movements' => ['since' => $since, 'from' => $start],
            default => ['since' => $since],
        };

        $this->stats[$stream] = ['read' => 0, 'booked' => 0, 'skipped' => 0, 'failed' => 0];
        $seen = [];

        // Every stream comes oldest change first, so a run that stops resumes after the last record it handled.
        $save = function () use ($cursor, &$newest): void {
            if ($newest && ! $cursor->cursor_at?->equalTo($newest)) {
                $cursor->update(['cursor_at' => $newest, 'last_run_id' => $this->run->id]);
            }
        };

        try {
            $this->source->each($stream, $filters, function (array $record) use ($stream, &$newest, &$seen) {
                $this->stats[$stream]['read']++;
                $seen[] = (int) ($record['id'] ?? 0);
                $this->handle($stream, $record);

                $updated = isset($record['updated_at']) ? Carbon::parse($record['updated_at']) : null;
                if ($updated && (! $newest || $updated->greaterThan($newest))) {
                    $newest = $updated;
                }

                return ! $this->outOfTime();
            }, function () use ($save) {
                $save();
                $this->heartbeat();

                return ! $this->outOfTime();
            });

            $save();

            // Only a complete list shows who is missing from it.
            if ($stream === 'users' && $seen !== [] && ! $this->outOfTime) {
                $this->stats['users']['booked'] += $this->users->disableMissing($seen);
            }
        } catch (Throwable $e) {
            // The cursor is not advanced, so the next run reads this stream again from the same point.
            Log::error("Optical stream {$stream} failed", ['error' => $e->getMessage()]);
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
            foreach ($this->source->ordersById($chunk) as $order) {
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
     * Payments and orders are read fresh from the POS; stock documents replay their stored payload.
     *
     * @param  Collection<int, SyncDocument>  $documents
     */
    protected function retryDocuments($documents): void
    {
        $this->stats['retries'] ??= ['read' => 0, 'booked' => 0, 'skipped' => 0, 'failed' => 0];

        foreach ($documents->groupBy('source_type') as $type => $docs) {
            try {
                $records = match ($type) {
                    OpticalDepositSync::DOC => $this->source->paymentsById($docs->pluck('source_id')->map(fn ($id) => (int) $id)->all()),
                    OpticalSaleSync::DOC => $this->source->ordersById($docs->pluck('source_id')->map(fn ($id) => (int) $id)->all()),
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
     * Close runs that stopped without finishing: a running one whose heartbeat went silent (its process died), or
     * one an earlier version left waiting for a queue worker.
     */
    protected function closeStaleRuns(): void
    {
        $cutoff = now()->subMinutes(self::STALE_MINUTES);

        SyncRun::query()->where('status', 'running')->where('updated_at', '<', $cutoff)
            ->update(['status' => 'failed', 'finished_at' => now(), 'message' => 'Stopped without finishing (the process ended). The next run picks up where it stopped.']);
        SyncRun::query()->where('status', 'queued')
            ->update(['status' => 'failed', 'finished_at' => now(), 'message' => 'Never started: it waited for a queue worker. Runs no longer need one.']);
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

    protected function finish(bool $quiet = false): void
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

        if ($this->outOfTime) {
            $parts[] = 'stopped at its time limit, the next check continues from here';
        }

        $message = mb_substr(implode('; ', [...$parts, ...array_map(fn ($e) => 'Error — '.$e, $streamErrors)]) ?: 'Nothing new in the optical POS.', 0, 2000);

        // A quiet check keeps a record only when it has something to tell: nothing booked and nothing wrong leaves
        // none, and a problem that repeats check after check stays one line (the last one, with its time moved on).
        if ($quiet && $totals['booked'] === 0) {
            $previous = SyncRun::query()->whereKeyNot($this->run->id)->latest('id')->first();
            $nothing = $totals['failed'] === 0 && $streamErrors === [];
            $repeated = ! $nothing && $previous?->status === $status && $previous->message === $message;

            if ($nothing || $repeated) {
                $this->run->delete();
                if ($repeated) {
                    $previous->update(['finished_at' => now()]);
                }

                return;
            }
        }

        $this->run->update([
            'finished_at' => now(),
            'status' => $status,
            'processed' => $totals['read'],
            'created_entries' => $totals['booked'],
            'skipped' => $totals['skipped'],
            'failed' => $totals['failed'],
            'message' => $message,
        ]);
    }
}
