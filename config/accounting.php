<?php

return [
    'vat_rate' => 0.12,

    /*
     * Source documents (invoices, collections, deposits, bill payments, cash/bank records and the optical sync)
     * post to the ledger as soon as they are recorded, as the proposal requires. Only manual non-cash journals
     * go through review and approval. Set to false to leave source entries as drafts for an accountant to post.
     */
    'auto_post_source_documents' => (bool) env('ACCOUNTING_AUTO_POST_SOURCE_DOCUMENTS', true),

    'retained_earnings_code' => '3100',
    'default_accounts' => [
        'cash_on_hand' => '1000',
        'cash_in_bank' => '1010',
        'card_clearing' => '1020',
        'ewallet_clearing' => '1030',
        'accounts_receivable' => '1100',
        'sales_revenue' => '4000',
        'sales_discounts' => '4100',
        'output_vat' => '2100',
        'input_vat' => '1300',
    ],
];
