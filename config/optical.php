<?php

/*
|--------------------------------------------------------------------------
| Optical POS (optical-new) integration
|--------------------------------------------------------------------------
|
| Accounting reads optical-new's database directly (the read-only "optical" connection in config/database.php), so
| what it shows of the POS is what the POS holds right now: stock on hand, services, users and passwords are read
| live and never copied. The books themselves cannot be read live — a ledger keeps its own journal entries, which
| are approved, closed with their period and reversed rather than changed — so new and changed POS records are
| booked on their own as they appear:
|
|   payment on an order      → customer deposit in the collecting entity (Dr cash/clearing, Cr Customer Deposits)
|   order completed          → invoice per owning entity, deposits applied, cost of goods sold at decoded cost
|   order un-completed       → everything booked for it is reversed
|   supplier delivery        → inventory received not billed (Dr Inventory, Cr Goods Received Not Billed)
|   defective/expired/return → inventory write-off or return to supplier
|
| Who owns what (from the proposal): JAM Opticus sells optical products (wholesale and retail) and does edging and
| repair; A. Jamora Optical and AL Jamora Optical bill clinical services. The clinic branch that takes the
| customer's money "collects" for JAM Opticus's share and owes it to JAM Opticus (Due to / Due from).
|
*/

return [
    // Time zone optical-new stores its timestamps in (its app.timezone).
    'timezone' => env('OPTICAL_TIMEZONE', 'UTC'),

    // Staff photos live in optical-new's public storage. Give the folder when both apps share a server (the file is
    // copied straight from disk); otherwise the photo is fetched from optical-new's site.
    'storage_path' => env('OPTICAL_STORAGE_PATH'),
    'public_url' => env('OPTICAL_PUBLIC_URL', 'http://optical-new.test'),

    // New POS records are booked on their own, with or without a scheduler. Page visits do it (shared hosting):
    // before a page is built, payments and orders that changed in the POS are booked at most once every
    // auto_refresh_seconds, within auto_refresh_budget_seconds; after the page has been sent, staff and stock (large
    // tables) once every auto_refresh_slow_seconds, within background_budget_seconds. A backlog continues on the
    // next visit (or all at once with "php artisan accounting:sync-optical"). Where a scheduler runs
    // ("accounting:sync-optical --auto" every minute), page visits leave the work to it. 0 turns page visits off.
    'auto_refresh_seconds' => (int) env('OPTICAL_AUTO_REFRESH_SECONDS', 15),
    'auto_refresh_slow_seconds' => (int) env('OPTICAL_AUTO_REFRESH_SLOW_SECONDS', 120),
    'auto_refresh_budget_seconds' => (int) env('OPTICAL_AUTO_REFRESH_BUDGET_SECONDS', 3),
    'background_budget_seconds' => (int) env('OPTICAL_BACKGROUND_BUDGET_SECONDS', 20),

    // Stock on hand is read from the POS on each visit, and kept this many seconds so the dashboard stays quick.
    'stock_cache_seconds' => (int) env('OPTICAL_STOCK_CACHE_SECONDS', 60),

    // Whether logins copied from optical-new sign in with their optical-new password, checked against the POS's own
    // record at sign-in (nothing is copied). Off: every login signs in with the password kept here.
    'password_check' => (bool) env('OPTICAL_PASSWORD_CHECK', false),

    // Go-live date. Nothing dated earlier is booked: it belongs in the opening balances. Payments received before
    // go-live on orders still open at go-live are carried in as customer deposits against Opening Balance Equity.
    'start_date' => env('OPTICAL_SYNC_START_DATE'),

    // Entity that collects an order's money: wholesale orders → JAM Opticus; retail orders → the branch's clinic.
    'wholesale_entity' => 'JAM_OPTICUS',
    'branch_entities' => [
        'a.l. jamora' => 'AL_JAMORA',
        'al jamora' => 'AL_JAMORA',
        'a.jamora' => 'A_JAMORA',
        'a. jamora' => 'A_JAMORA',
    ],
    'default_branch_entity' => 'A_JAMORA',

    // Entity that sells frames, lenses, accessories and solutions, holds the inventory and books their cost.
    'product_entity' => env('OPTICAL_PRODUCT_ENTITY', 'JAM_OPTICUS'),

    // Edging and repair services belong to JAM Opticus; other service fees (exams, consultations, certification,
    // vision therapy) belong to the clinic that collected them.
    'workshop_entity' => env('OPTICAL_WORKSHOP_ENTITY', 'JAM_OPTICUS'),
    'workshop_service_keywords' => ['edging', 'repair'],

    // Order discount categories that make the sale VAT-exempt with a statutory discount (Senior Citizen, PWD).
    'vat_exempt_categories' => ['SS', 'PWD'],

    // Stock groups with this many or fewer on hand are low.
    'low_stock_threshold' => 3,

    // Users: every optical-new user is copied as a login (new logins get the Employee role) with an employee record.
    // The employer is picked from the user's optical-new role when the record is first created (first role listed
    // here wins), else the default entity; an employee is never moved afterwards.
    'user_entities' => [
        'admin' => 'JAM_OPTICUS',
        'inventory' => 'JAM_OPTICUS',
        'wholesale' => 'JAM_OPTICUS',
        'technician' => 'JAM_OPTICUS',
    ],
    'default_user_entity' => env('OPTICAL_DEFAULT_USER_ENTITY', 'A_JAMORA'),

    // Incremental reads re-read this many minutes before the saved cursor; documents are idempotent.
    'cursor_overlap_minutes' => 10,
];
