<?php

use App\Models\Entity;
use App\Services\People\ComplianceCalendar;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('compliance:generate', function (ComplianceCalendar $calendar) {
    foreach (Entity::query()->where('is_active', true)->get() as $entity) {
        $created = $calendar->ensureRecent($entity->id);
        $this->line("{$entity->code}: {$created} compliance item(s) created.");
    }
})->purpose('Create the statutory compliance calendar for this month and last month, for every active branch');

Schedule::command('accounting:sync-optical')->hourly();
Schedule::command('compliance:generate')->monthlyOn(1, '06:00');
