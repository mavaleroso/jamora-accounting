<?php

return [
    'vat_rate' => 0.12,

    /*
     * Source documents (invoices, collections, deposits, bills and bill payments, cash/bank records, fund transfers and
     * the optical sync) record their journal entry "for approval": it reaches the ledger when someone with
     * journals.approve (the owner) approves it, like a manual journal. The CPA chose review and approval for these
     * postings (Oct 2026). Payroll is approved on its own screen and posts when released. The owner can switch this
     * off in Admin › System Settings; this is only the default.
     */
    'approve_source_documents' => (bool) env('ACCOUNTING_APPROVE_SOURCE_DOCUMENTS', true),

    /*
     * Without approval, source entries post as soon as they are recorded. Set to false to leave them as drafts for an
     * accountant to post instead.
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
