<?php

namespace App\Console\Commands;

use App\Models\Entity;
use App\Services\Accounting\OpticalSyncService;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SyncOpticalCommand extends Command
{
    protected $signature = 'accounting:sync-optical {--from=} {--to=} {--entity=}';

    protected $description = 'Sync Optical orders and payments from the optical database into accounting journal entries';

    public function handle(EntityContext $entityContext, OpticalSyncService $syncService): int
    {
        $from = $this->option('from') ? Carbon::parse($this->option('from'))->startOfDay() : null;
        $to = $this->option('to') ? Carbon::parse($this->option('to'))->endOfDay() : null;

        $entities = $this->option('entity')
            ? Entity::query()->where('code', $this->option('entity'))->get()
            : Entity::query()->where('is_active', true)->orderBy('id')->get();

        if ($entities->isEmpty()) {
            $this->error('No entities found to sync.');

            return self::FAILURE;
        }

        $exit = self::SUCCESS;

        foreach ($entities as $entity) {
            $entityContext->set($entity);
            $this->info("Syncing entity {$entity->code} from optical database...");

            try {
                $run = $syncService->sync($from, $to);

                $this->table(
                    ['Metric', 'Value'],
                    [
                        ['Entity', $entity->code],
                        ['Status', $run->status],
                        ['Processed', $run->processed],
                        ['Created Entries', $run->created_entries],
                        ['Skipped', $run->skipped],
                        ['Failed', $run->failed],
                        ['Message', $run->message ?? '—'],
                    ]
                );

                if ($run->status === 'failed') {
                    $exit = self::FAILURE;
                }
            } catch (\Throwable $e) {
                $this->error("Optical sync failed for {$entity->code}: ".$e->getMessage());
                $exit = self::FAILURE;
            }
        }

        $entityContext->clear();

        return $exit;
    }
}
