<?php

namespace Database\Seeders;

use App\Support\ChartOfAccounts;
use App\Support\EntityContext;
use Illuminate\Database\Seeder;

/**
 * Posting rules for the current entity. AccountingSetupSeeder already creates them for every entity; run this on
 * its own to restore a single entity's rules.
 */
class PostingRulesSeeder extends Seeder
{
    public function run(): void
    {
        $entity = app(EntityContext::class)->current();

        if ($entity) {
            ChartOfAccounts::ensurePostingRules($entity);
        }
    }
}
