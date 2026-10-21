<?php

/*
|--------------------------------------------------------------------------
| Optical POS (optical-new) integration
|--------------------------------------------------------------------------
|
| Accounting reads optical-new through its token-protected accounting API only (never its database). The sync
| books:
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
    'api' => [
        'base_url' => env('OPTICAL_API_BASE_URL', 'http://optical-new.test'),
        'token' => env('OPTICAL_API_TOKEN'),
        'timeout' => (int) env('OPTICAL_API_TIMEOUT', 60),
        'page_size' => 100,
    ],

    // Whether logins copied from optical-new sign in with their optical-new password, checked by optical-new. Off:
    // every login signs in with the password kept here, and sign-in never calls optical-new.
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

    // Users: every optical-new user is copied as a login (new logins get the Employee role) with an employee record.
    // The employer is picked from the user's optical-new role when the record is first created (first role listed
    // here wins), else the default entity; the sync never moves an employee afterwards.
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
