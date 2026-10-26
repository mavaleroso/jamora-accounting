<?php

namespace App\Jobs;

use App\Models\SyncRun;
use App\Services\Optical\OpticalSyncService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use RuntimeException;

/**
 * Carries out an optical sync run queued from the Optical Sync page.
 */
class RunOpticalSync implements ShouldQueue
{
    use Queueable;

    /** A failed sync is not retried by the queue: the next run picks up where it stopped. */
    public int $tries = 1;

    public int $timeout = 6 * 3600;

    /**
     * @param  array{full?: bool, streams?: list<string>, retry_failed?: bool}  $options
     */
    public function __construct(
        public int $runId,
        public array $options = [],
    ) {}

    public function handle(OpticalSyncService $sync): void
    {
        $run = SyncRun::query()->find($this->runId);
        if (! $run || $run->status !== 'queued') {
            return;
        }

        try {
            $sync->run($run->triggeredByUser, $this->options, $run);
        } catch (RuntimeException $e) {
            $run->update(['status' => 'failed', 'finished_at' => now(), 'message' => $e->getMessage()]);
        }
    }
}
