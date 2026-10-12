<?php

namespace App\Http\Controllers\Banks;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Support\EntityContext;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BankAccountsController extends Controller
{
    public function index(Request $request): Response
    {
        $entityId = app(EntityContext::class)->id();

        $accounts = BankAccount::query()
            ->with('glAccount:id,code,name')
            ->where('is_active', true)
            ->when($entityId, fn ($q) => $q->whereHas('entities', fn ($e) => $e->where('entities.id', $entityId)))
            ->orderBy('code')
            ->get();

        return Inertia::render('banks/accounts/page', [
            'bankAccounts' => $accounts,
        ]);
    }
}
