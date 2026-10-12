<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dtr_entries', function (Blueprint $table) {
            $table->time('break_out')->nullable()->after('time_in');
            $table->time('break_in')->nullable()->after('break_out');
            $table->decimal('in_latitude', 10, 7)->nullable()->after('source');
            $table->decimal('in_longitude', 10, 7)->nullable()->after('in_latitude');
            $table->decimal('out_latitude', 10, 7)->nullable()->after('in_longitude');
            $table->decimal('out_longitude', 10, 7)->nullable()->after('out_latitude');
            $table->decimal('distance_meters', 10, 2)->nullable()->after('out_longitude');
            $table->string('location_status')->default('verified')->after('distance_meters');
        });

        Schema::table('entities', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->default(14.5547)->after('is_active');
            $table->decimal('longitude', 10, 7)->nullable()->default(121.0244)->after('latitude');
            $table->integer('geofence_radius')->default(250)->after('longitude'); // in meters
            $table->boolean('geofence_enforced')->default(true)->after('geofence_radius');
        });
    }

    public function down(): void
    {
        Schema::table('dtr_entries', function (Blueprint $table) {
            $table->dropColumn([
                'break_out',
                'break_in',
                'in_latitude',
                'in_longitude',
                'out_latitude',
                'out_longitude',
                'distance_meters',
                'location_status',
            ]);
        });

        Schema::table('entities', function (Blueprint $table) {
            $table->dropColumn([
                'latitude',
                'longitude',
                'geofence_radius',
                'geofence_enforced',
            ]);
        });
    }
};

