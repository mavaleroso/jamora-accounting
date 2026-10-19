<?php

namespace App\Console\Commands;

use App\Services\Optical\OpticalSyncService;
use Illuminate\Console\Command;

class SyncOpticalCommand extends Command
{
    protected $signature = 'accounting:sync-optical
        {--full : Ignore the saved cursors and read every stream from the start (documents already booked are skipped)}
        {--stream=* : Only these streams (users, clients, suppliers, payments, orders, receipts, movements)}
        {--no-retry : Do not retry previously failed documents first}';

    protected $description = 'Sync optical-new staff and book its payments, completed orders and stock events into accounting through the optical accounting API';

    public function handle(OpticalSyncService $sync): int
    {
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
