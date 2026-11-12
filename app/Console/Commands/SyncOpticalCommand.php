<?php

namespace App\Console\Commands;

use App\Services\Optical\OpticalSyncService;
use Illuminate\Console\Command;

class SyncOpticalCommand extends Command
{
    protected $signature = 'accounting:sync-optical
        {--full : Ignore the saved cursors and read every stream from the start (documents already booked are skipped)}
        {--stream=* : Only these streams (users, clients, suppliers, payments, orders, receipts, movements)}
        {--no-retry : Do not retry previously failed documents first}
        {--auto : The check the scheduler makes every minute: books what changed, keeps no record when nothing did, retries failed documents hourly}';

    protected $description = 'Book what is new or changed in the optical POS (staff, payments, completed orders, stock events), read from its database';

    public function handle(OpticalSyncService $sync): int
    {
        if ($this->option('auto')) {
            $run = $sync->catchUp(scheduled: true);
            $this->line($run?->message ?? 'Nothing new in the optical POS.');

            return $run?->status === 'failed' ? self::FAILURE : self::SUCCESS;
        }

        try {
            $run = $sync->run(null, [
                'full' => (bool) $this->option('full'),
                'streams' => $this->option('stream') ?: OpticalSyncService::STREAMS,
                'retry_failed' => ! $this->option('no-retry'),
            ]);
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->table(['Metric', 'Value'], [
            ['Status', $run->status],
            ['Read', $run->processed],
            ['Booked', $run->created_entries],
            ['Skipped', $run->skipped],
            ['Failed', $run->failed],
        ]);
        $this->line($run->message ?? '');

        return $run->status === 'failed' ? self::FAILURE : self::SUCCESS;
    }
}
