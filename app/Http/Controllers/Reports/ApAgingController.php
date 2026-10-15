<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Reports\Concerns\RendersAgingReport;

class ApAgingController extends Controller
{
    use RendersAgingReport;

    protected function agingType(): string
    {
        return 'ap';
    }
}
