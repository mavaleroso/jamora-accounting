<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Every employee works the company default shift, 9:00 AM - 6:00 PM (config people.default_shift), so the other shift
 * templates are removed. Employees on one fall back to the default; a template a roster still points at is only
 * deactivated, to keep that roster's history.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('employees')->whereNotNull('default_shift_template_id')->update(['default_shift_template_id' => null]);

        $rostered = DB::table('shift_rosters')->whereNotNull('shift_template_id')->distinct()->pluck('shift_template_id');
        DB::table('shift_templates')->whereIn('id', $rostered)->update(['is_active' => false]);
        DB::table('shift_templates')->whereNotIn('id', $rostered)->delete();
    }

    public function down(): void
    {
        // The removed templates are not restored: the company default shift applies.
    }
};
