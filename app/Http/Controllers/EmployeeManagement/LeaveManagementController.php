<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * The old Leave page. Leave is filed, decided and cancelled in Employee Requests, which checks who
 * owns each request; this only forwards old links there.
 */
class LeaveManagementController extends Controller
{
    public function index(Request $request): RedirectResponse
    {
        return redirect()->route('employee-management.requests.index', array_filter([
            'kind' => 'leave',
            'status' => $request->query('status'),
            'employee_id' => $request->query('employee_id'),
        ]));
    }
}
