<?php

return [
    'optical_database' => env('OPTICAL_DB_DATABASE', 'optical-v2'),
    'vat_rate' => 0.12,
    'sync_as_draft' => true,
    'retained_earnings_code' => '3100',
    'default_accounts' => [
        'cash_on_hand' => '1000',
        'cash_in_bank' => '1010',
        'card_clearing' => '1020',
        'accounts_receivable' => '1100',
        'sales_revenue' => '4000',
        'sales_discounts' => '4100',
        'output_vat' => '2100',
        'input_vat' => '1300',
    ],
];
