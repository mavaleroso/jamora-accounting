<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
    /** Rows per page from ?per_page=, clamped so a crafted URL cannot pull the whole table. */
    protected function perPage(Request $request, int $default = 10): int
    {
        return max(1, min(100, (int) $request->query('per_page', $default)));
    }
}
