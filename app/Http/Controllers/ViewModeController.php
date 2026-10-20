<?php

namespace App\Http\Controllers;

use App\Models\Entity;
use App\Services\People\EmployeeResolver;
use App\Support\EntityContext;
use App\Support\ViewMode;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Switch an Admin who is also an employee between the admin and the employee view (see ViewMode).
 */
class ViewModeController extends Controller
{
    public function __invoke(Request $request, ViewMode $viewMode, EntityContext $entityContext, EmployeeResolver $employees): RedirectResponse
    {
        $mode = $request->validate(['mode' => ['required', Rule::in([ViewMode::ADMIN, ViewMode::EMPLOYEE])]])['mode'];
        $user = $request->user();
        abort_unless($viewMode->canSwitch($user), 403);

        $request->session()->put(ViewMode::SESSION_KEY, $mode);

        if ($mode === ViewMode::ADMIN) {
            return redirect()->route('overview');
        }

        // The employee view opens in their own company, where their employee record is.
        if (! $employees->forUser($user, $entityContext->id())) {
            $entityContext->set(Entity::query()->find($viewMode->employeeCompanyId($user)));
        }

        return redirect()->route('employee-management.portal.index');
    }
}
