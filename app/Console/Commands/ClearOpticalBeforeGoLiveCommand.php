<?php

namespace App\Console\Commands;

use App\Models\InventoryMovement;
use App\Models\JournalEntry;
use App\Models\SyncDocument;
use App\Services\Optical\OpticalLedger;
use App\Services\Optical\OpticalRouter;
use App\Services\Optical\OpticalStockSync;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Takes stock deliveries and stock events dated before the go-live date (OPTICAL_SYNC_START_DATE) back out of the
 * books: they belong in the opening balances. Posted entries are reversed on their own date, so every period nets to
 * nil; the sync documents (including those that failed for want of an accounting period) are marked as before go-live.
 */
class ClearOpticalBeforeGoLiveCommand extends Command
{
    protected $signature = 'accounting:optical-clear-before-go-live {--force : Reverse and mark; without it the command only reports what it would do}';

    protected $description = 'Reverse optical stock bookings dated before the go-live date and close their sync documents';

    public function handle(OpticalRouter $router, OpticalLedger $ledger): int
    {
        $start = $router->startDate();
        if ($start === null) {
            $this->error('Set OPTICAL_SYNC_START_DATE (the go-live date) first.');

            return self::FAILURE;
        }

        $documents = SyncDocument::query()->withoutGlobalScope('entity')
            ->where('source_system', 'optical')
            ->whereIn('source_type', [OpticalStockSync::RECEIPT_DOC, OpticalStockSync::MOVEMENT_DOC])
            ->whereIn('status', ['posted', 'review', 'failed'])
            ->get()
            ->filter(fn (SyncDocument $doc) => ($date = $this->dateOf($doc)) !== null && $date < $start);

        $journalIds = $documents->flatMap(fn (SyncDocument $doc) => $doc->meta['journal_entry_ids'] ?? [])->unique()->values();
        $booked = JournalEntry::query()->withoutGlobalScope('entity')->whereIn('id', $journalIds)->where('status', 'posted');

        $this->info("Go-live: {$start}");
        $this->table(['What', 'Count'], [
            ['Stock documents dated before go-live', $documents->count()],
            ['  of which failed (no accounting period)', $documents->where('status', 'failed')->count()],
            ['Posted journal entries to reverse on their own date', (clone $booked)->count()],
            ['Amount reversed', number_format((float) (clone $booked)->sum('total_debit'), 2)],
        ]);

        if (! $this->option('force')) {
            $this->info('Dry run. Re-run with --force to reverse these entries and close the documents.');

            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar($documents->count());
        foreach ($documents as $doc) {
            DB::transaction(function () use ($doc, $ledger, $start) {
                if (! empty($doc->meta)) {
                    $ledger->reverse($doc->meta['journal_entry_ids'] ?? [], "Reversal: dated before go-live ({$start})", onOriginalDate: true);
                    InventoryMovement::query()->withoutGlobalScope('entity')->whereIn('id', $doc->meta['movement_ids'] ?? [])->update(['review_status' => 'reversed']);
                }

                $doc->update([
                    'status' => 'skipped',
                    'meta' => null,
                    'journal_entry_id' => null,
                    'error' => "Before go-live ({$start}); part of opening inventory.",
                ]);
            });
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();
        $this->info('Done.');

        return self::SUCCESS;
    }

    protected function dateOf(SyncDocument $doc): ?string
    {
        $date = $doc->payload[$doc->source_type === OpticalStockSync::RECEIPT_DOC ? 'received_at' : 'occurred_at'] ?? null;

        return $date ? substr((string) $date, 0, 10) : null;
    }
}
