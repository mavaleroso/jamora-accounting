<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Partner;
use App\Models\PartnerBalance;
use App\Models\SyncDocument;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Removes what the old database-driven optical sync left behind: its draft journal entries (orders, payments and
 * COGS at selling price), their sync documents, and the customer records and balances it created. Posted entries
 * are never touched — they are listed so an accountant can void them.
 */
class PurgeLegacyOpticalSyncCommand extends Command
{
    protected $signature = 'accounting:optical-purge-legacy {--force : Delete; without it the command only reports what it would remove}';

    protected $description = 'Remove draft entries and sync records left by the old database-driven optical sync';

    /** Source types the old sync wrote; the API sync uses different ones. */
    protected const LEGACY_TYPES = ['order', 'order_payment', 'inventory_cogs'];

    public function handle(): int
    {
        $entries = JournalEntry::query()->withoutGlobalScope('entity')
            ->where('source_system', 'optical')
            ->whereIn('source_type', self::LEGACY_TYPES);

        $drafts = (clone $entries)->whereIn('status', ['draft', 'pending']);
        $posted = (clone $entries)->whereIn('status', ['posted', 'void'])->get(['id', 'entity_id', 'entry_no', 'status']);
        $documents = SyncDocument::query()->withoutGlobalScope('entity')->where('source_system', 'optical')->whereIn('source_type', self::LEGACY_TYPES);

        // The old sync coded customers OPT-{id}; the API sync uses OPT-C{id}, OPT-P{id} and OPT-WALKIN.
        $partnerIds = Partner::query()->withoutGlobalScope('entity')
            ->where('external_source', 'optical')
            ->whereNotIn('id', Invoice::query()->withoutGlobalScope('entity')->select('partner_id'))
            ->get(['id', 'code'])
            ->filter(fn (Partner $p) => preg_match('/^OPT-\d+$/', $p->code) === 1)
            ->pluck('id');

        $this->table(['What', 'Count'], [
            ['Draft / pending legacy journal entries', (clone $drafts)->count()],
            ['Legacy sync documents', (clone $documents)->count()],
            ['Legacy customer records (no invoices)', $partnerIds->count()],
            ['Posted legacy entries (left alone — void them)', $posted->count()],
        ]);

        foreach ($posted->take(20) as $entry) {
            $this->line("  posted: {$entry->entry_no} (entity {$entry->entity_id}, {$entry->status})");
        }

        if (! $this->option('force')) {
            $this->info('Dry run. Re-run with --force to delete the drafts, sync documents and customer records above.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($drafts, $documents, $partnerIds) {
            (clone $drafts)->select('id')->chunkById(500, function ($chunk) {
                $ids = $chunk->pluck('id');
                JournalEntryLine::query()->whereIn('journal_entry_id', $ids)->delete();
                JournalEntry::query()->withoutGlobalScope('entity')->withTrashed()->whereIn('id', $ids)->forceDelete();
            });

            (clone $documents)->delete();

            PartnerBalance::query()->whereIn('partner_id', $partnerIds)->delete();
            Partner::query()->withoutGlobalScope('entity')->whereIn('id', $partnerIds)
                ->whereNotIn('id', JournalEntryLine::query()->whereNotNull('partner_id')->where('partner_type', Partner::class)->select('partner_id'))
                ->delete();
        });

        $this->info('Legacy optical sync data removed. Run accounting:sync-optical to book through the API.');

        return self::SUCCESS;
    }
}
