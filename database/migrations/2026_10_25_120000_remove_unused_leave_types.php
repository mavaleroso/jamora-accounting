<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Solo Parent Leave, VAWC Leave and Special Leave for Women are not offered: their leave types are removed and taken
 * off every employee's list of leave types. A type that already has leave filed, balances or history is kept for those
 * records but switched off.
 */
return new class extends Migration
{
    private const LEAVE_TYPES = [
        ['code' => 'SPL', 'name' => 'Solo Parent Leave', 'legal_basis' => 'RA 11861 (7 days/yr)', 'balance_tracked' => true, 'annual_entitlement' => 7, 'min_service_months' => 6, 'attachment_required_after_days' => 0, 'sort_order' => 6],
        ['code' => 'VAWC', 'name' => 'VAWC Leave', 'legal_basis' => 'RA 9262 (10 days/yr)', 'balance_tracked' => true, 'annual_entitlement' => 10, 'gender' => 'female', 'attachment_required_after_days' => 0, 'sort_order' => 7],
        ['code' => 'SLW', 'name' => 'Special Leave for Women', 'legal_basis' => 'RA 9710 Magna Carta of Women (up to 60 days)', 'balance_tracked' => false, 'max_days_per_filing' => 60, 'gender' => 'female', 'min_service_months' => 6, 'attachment_required_after_days' => 0, 'allow_half_day' => false, 'sort_order' => 8],
    ];

    public function up(): void
    {
        $removed = DB::table('leave_types')->whereIn('code', array_column(self::LEAVE_TYPES, 'code'))->pluck('id')->map(fn ($id) => (int) $id)->all();
        if ($removed === []) {
            return;
        }

        DB::table('employees')->whereNotNull('leave_type_ids')->orderBy('id')->each(function (object $employee) use ($removed) {
            $ids = json_decode((string) $employee->leave_type_ids, true);
            if (! is_array($ids)) {
                return;
            }

            $kept = array_values(array_filter(array_map('intval', $ids), fn (int $id) => ! in_array($id, $removed, true)));
            if (count($kept) !== count($ids)) {
                DB::table('employees')->where('id', $employee->id)->update(['leave_type_ids' => json_encode($kept)]);
            }
        });

        foreach ($removed as $id) {
            $used = DB::table('leave_requests')->where('leave_type_id', $id)->exists()
                || DB::table('leave_balances')->where('leave_type_id', $id)->exists()
                || DB::table('leave_ledger_entries')->where('leave_type_id', $id)->exists();

            $used
                ? DB::table('leave_types')->where('id', $id)->update(['is_active' => false, 'updated_at' => now()])
                : DB::table('leave_types')->where('id', $id)->delete();
        }
    }

    /**
     * Brings the leave types back (switched on); employees' lists of leave types are not restored.
     */
    public function down(): void
    {
        foreach (self::LEAVE_TYPES as $type) {
            DB::table('leave_types')->updateOrInsert(
                ['code' => $type['code']],
                [...$type, 'is_paid' => true, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }
};
