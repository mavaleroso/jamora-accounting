<?php

namespace App\Console\Commands;

use App\Services\Accounting\OpticalSyncService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SyncOpticalCommand extends Command
{
    protected $signature = 'accounting:sync-optical {--from=} {--to=}';

    protected $description = 'Sync completed Optical orders and payments into accounting journal entries';

    public function handle(OpticalSyncService $syncService): int
    {
        $from = $this->option('from') ? Carbon::parse($this->option('from'))->startOfDay() : null;
        $to = $this->option('to') ? Carbon::parse($this->option('to'))->endOfDay() : null;

        $this->info('Starting Optical sync...');

        try {
            $run = $syncService->sync($from, $to);

            $this->table(
                ['Metric', 'Value'],
                [
                    ['Status', $run->status],
                    ['Processed', $run->processed],
                    ['Created Entries', $run->created_entries],
                    ['Skipped', $run->skipped],
                    ['Failed', $run->failed],
                    ['Message', $run->message ?? '—'],
                ]
            );

            return $run->status === 'failed' ? self::FAILURE : self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Optical sync failed: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}
