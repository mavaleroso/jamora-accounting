<?php

namespace Database\Seeders;

use App\Models\Entity;
use App\Models\Employee;
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

        $demoUsers = User::query()
            ->whereIn('username', [
                'admin',
                'finance-manager',
                'senior-accountant',
                'accounting-staff',
                'front-desk',
                'payroll',
                'auditor',
                'management',
                'employee',
            ])
            ->get();

        if ($demoUsers->isNotEmpty()) {
            $ids = Entity::query()->where('is_active', true)->orderBy('name')->pluck('id');
            $sync = [];
            foreach ($ids as $i => $id) {
                $sync[$id] = ['is_default' => $i === 0];
            }

            foreach ($demoUsers as $demoUser) {
                $demoUser->entities()->sync($sync);
            }
        }

        // Backfill legacy rows that pre-date multi-entity.
        $defaultEntityId = Entity::query()->where('code', 'A_JAMORA')->value('id')
            ?? Entity::query()->value('id');

        if ($defaultEntityId) {
            $employeeUser = User::query()->where('username', 'employee')->first();
            if ($employeeUser) {
                Employee::query()->updateOrCreate(
                    ['entity_id' => $defaultEntityId, 'employee_code' => 'DEMO-EMP-001'],
                    [
                        'user_id' => $employeeUser->id,
                        'firstname' => $employeeUser->firstname ?? 'Staff',
                        'middlename' => $employeeUser->middlename,
                        'lastname' => $employeeUser->lastname ?? 'Employee',
                        'email' => $employeeUser->email,
                        'position' => 'Optical Staff / Assistant',
                        'department' => 'Optical',
                        'hire_date' => $employeeUser->date_started ?? '2024-01-01',
                        'employment_status' => 'active',
                        'is_active' => true,
                    ]
                );
            }

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
