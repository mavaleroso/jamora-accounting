<?php

use App\Models\Entity;
use App\Services\People\AttendanceCalculator;
use App\Services\People\ComplianceCalendar;
use App\Support\PrivateFiles;
use Carbon\Carbon;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('compliance:generate', function (ComplianceCalendar $calendar) {
    foreach (Entity::query()->where('is_active', true)->get() as $entity) {
        $created = $calendar->ensureRecent($entity->id);
        $this->line("{$entity->code}: {$created} compliance item(s) created.");
    }
})->purpose('Create the statutory compliance calendar for this month and last month, for every active branch');

Artisan::command('attendance:close-day {date? : Day to close (Y-m-d); defaults to yesterday}', function (AttendanceCalculator $calculator) {
    $date = Carbon::parse($this->argument('date') ?? Carbon::yesterday())->toDateString();
    if ($date >= Carbon::today()->toDateString()) {
        $this->error('Close a day only after it has ended.');

        return 1;
    }

    foreach (Entity::query()->where('is_active', true)->get() as $entity) {
        $r = $calculator->closeDay($entity->id, $date);
        $this->line("{$entity->code} {$date}: {$r['absent']} absent, {$r['on_leave']} on leave, {$r['official_business']} official business, {$r['holiday']} holiday, {$r['skipped']} already recorded.");
    }

    return 0;
})->purpose('Record absences, unworked holidays, leave and official business for a finished day, for every active branch');

Artisan::command('uploads:make-private', function () {
    $public = Storage::disk('public');
    $private = Storage::disk(PrivateFiles::DISK);
    $moved = 0;

    foreach (['leave-attachments', 'compliance-evidence'] as $dir) {
        foreach ($public->allFiles($dir) as $path) {
            $private->put($path, $public->get($path));
            $public->delete($path);
            $moved++;
        }
    }

    $this->line("Moved {$moved} file(s) to private storage.");
})->purpose('Move leave attachments and compliance evidence uploaded before the switch off the public disk');

Schedule::command('accounting:sync-optical')->hourly()->withoutOverlapping();
// Payroll relies on these rows: without them absences go undeducted and unworked holidays unpaid.
Schedule::command('attendance:close-day')->dailyAt('01:00')->withoutOverlapping();
Schedule::command('compliance:generate')->monthlyOn(1, '06:00');
