<?php

namespace Database\Seeders;

use App\Models\Entity;
use App\Models\User;
use Illuminate\Database\Seeder;

class EntitySeeder extends Seeder
{
    public function run(): void
    {
        $entities = [
            [
                'code' => 'JAM_OPTICUS',
                'name' => 'JAM Opticus',
                'settings' => ['optical_map' => 'wholesale'],
            ],
            [
                'code' => 'A_JAMORA',
                'name' => 'A. Jamora Optical',
                'settings' => ['optical_map' => 'A.JAMORA'],
            ],
            [
                'code' => 'AL_JAMORA',
                'name' => 'AL Jamora Optical',
                'settings' => ['optical_map' => 'A.L. Jamora'],
            ],
        ];

        foreach ($entities as $data) {
            Entity::query()->updateOrCreate(
                ['code' => $data['code']],
                [
                    'name' => $data['name'],
                    'is_active' => true,
                    'settings' => $data['settings'],
                ]
            );
        }

        $admin = User::query()->where('username', 'admin')->first();
        if ($admin) {
            $ids = Entity::query()->pluck('id');
            $sync = [];
            foreach ($ids as $i => $id) {
                $sync[$id] = ['is_default' => $i === 0];
            }
            $admin->entities()->sync($sync);
        }

        // Backfill legacy rows that pre-date multi-entity.
        $defaultEntityId = Entity::query()->where('code', 'A_JAMORA')->value('id')
            ?? Entity::query()->value('id');

        if ($defaultEntityId) {
            foreach ([
                'accounts',
                'journals',
                'journal_entries',
                'fiscal_years',
                'cost_centers',
                'tax_codes',
                'posting_rules',
                'sync_documents',
                'sync_runs',
            ] as $table) {
                if (\Illuminate\Support\Facades\Schema::hasTable($table)
                    && \Illuminate\Support\Facades\Schema::hasColumn($table, 'entity_id')) {
                    \Illuminate\Support\Facades\DB::table($table)
                        ->whereNull('entity_id')
                        ->update(['entity_id' => $defaultEntityId]);
                }
            }
        }
    }
}
