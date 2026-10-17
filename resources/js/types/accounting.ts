export type AuditTrailUser = {
    id: number;
    name: string;
    username: string | null;
};

export type AuditEvent = 'created' | 'updated' | 'deleted' | 'restored' | 'request' | 'login' | 'logout';

/** One audited change (App\Http\Resources\AuditTrailResource). */
export type AuditTrail = {
    id: number;
    created_at: string | null;
    event: AuditEvent;
    action: string | null;
    user: AuditTrailUser | null;
    entity: { id: number; code: string; name: string } | null;
    subject: { type: string | null; type_label: string | null; id: string | null; label: string | null };
    changes: { field: string; label: string; from: unknown; to: unknown }[];
    description: string | null;
    source: 'web' | 'console' | string;
    batch_id: string | null;
    request: {
        route: string | null;
        method: string | null;
        status: number | null;
        url: string | null;
        ip: string | null;
        user_agent: string | null;
        payload: Record<string, unknown> | null;
    };
};

export type JournalEntryStatus = 'draft' | 'pending' | 'posted' | 'void';

export type JournalEntryLine = {
    id?: number;
    line_no?: number;
    account_id: number;
    account?: { id: number; code: string; name: string } | null;
    debit: number;
    credit: number;
    memo?: string | null;
    cost_center_id?: number | null;
    cost_center?: { id: number; code: string; name: string } | null;
};

export type JournalEntry = {
    id: number;
    entry_no: string;
    journal_id: number;
    journal?: { id: number; code: string; name: string; type: string } | null;
    accounting_period_id: number;
    entry_date: string;
    reference: string | null;
    memo: string | null;
    status: JournalEntryStatus;
    total_debit: number;
    total_credit: number;
    source_system?: string;
    prepared_by?: number | null;
    approved_by?: number | null;
    posted_by?: number | null;
    posted_at?: string | null;
    voided_by?: number | null;
    voided_at?: string | null;
    prepared_by_user?: { id: number; name: string } | null;
    approved_by_user?: { id: number; name: string } | null;
    posted_by_user?: { id: number; name: string } | null;
    voided_by_user?: { id: number; name: string } | null;
    lines?: JournalEntryLine[];
    created_at?: string | null;
    updated_at?: string | null;
};

export type LedgerLine = {
    entry_date: string;
    entry_no: string;
    reference: string | null;
    memo: string | null;
    debit: number;
    credit: number;
    running_balance: number;
};

export type JournalOption = {
    id: number;
    code: string;
    name: string;
    type: string;
};

export type CostCenterOption = {
    id: number;
    code: string;
    name: string;
};

export type AccountingPeriodOption = {
    id: number;
    period_no: number;
    start_date: string;
    end_date: string;
    status: AccountingPeriodStatus;
    label?: string;
    fiscal_year_code?: string;
};

export type JournalEntryFormLine = {
    account_id: number | null;
    debit: string;
    credit: string;
    memo: string;
    cost_center_id: number | null;
};

export type SyncRun = {
    id: number;
    started_at: string | null;
    finished_at: string | null;
    status: string;
    from_date: string | null;
    to_date: string | null;
    processed: number;
    created_entries: number;
    skipped: number;
    failed: number;
    message: string | null;
    triggered_by: string | null;
};

export type SyncDocument = {
    id: number;
    source_type: string;
    source_id: string;
    payload_hash: string;
    status: string;
    error: string | null;
    synced_at: string | null;
    updated_at: string | null;
    journal_entry: {
        id: number;
        entry_no: string;
        status: string;
    } | null;
};

export type PostingRule = {
    id: number;
    event: string;
    name: string;
    debit_account_id: number;
    credit_account_id: number;
    debit_account: { id: number; code: string; name: string } | null;
    credit_account: { id: number; code: string; name: string } | null;
    is_active: boolean;
    sort_order: number;
};

export type AccountOption = {
    id: number;
    code: string;
    name: string;
};

export type AccountType = {
    id: number;
    name: string;
    classification: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    normal_balance: 'debit' | 'credit';
    statement: 'BS' | 'IS';
    created_at?: string;
    updated_at?: string;
};

export type Account = {
    id: number;
    code: string;
    name: string;
    account_type_id: number;
    parent_id: number | null;
    is_postable: boolean;
    is_active: boolean;
    cash_flow_section: 'operating' | 'investing' | 'financing' | null;
    description: string | null;
    created_at?: string;
    updated_at?: string;
    account_type?: Pick<AccountType, 'id' | 'name'>;
    parent?: AccountOption | null;
};

export type JournalType =
    | 'general'
    | 'sales'
    | 'cash_receipts'
    | 'cash_disbursements'
    | 'purchases'
    | string;

export type Journal = {
    id: number;
    code: string;
    name: string;
    type: JournalType;
    sequence_prefix: string;
    default_account_id: number | null;
    next_sequence: number;
    created_at?: string;
    updated_at?: string;
    default_account?: AccountOption | null;
};

export type CostCenter = {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
};

export type TaxCodeType = 'input_vat' | 'output_vat' | string;

export type TaxCode = {
    id: number;
    code: string;
    name: string;
    rate: number | string;
    type: TaxCodeType;
    account_id: number | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
    account?: AccountOption | null;
};

export type FiscalYearStatus = 'open' | 'closed' | string;

export type FiscalYear = {
    id: number;
    code: string;
    start_date: string;
    end_date: string;
    status: FiscalYearStatus;
    created_at?: string;
    updated_at?: string;
};

export type AccountingPeriodStatus = 'open' | 'soft-closed' | 'closed';

export type AccountingPeriod = {
    id: number;
    fiscal_year_id: number;
    period_no: number;
    start_date: string;
    end_date: string;
    status: AccountingPeriodStatus;
    closed_by: number | null;
    closed_at: string | null;
    closed_by_user?: { id: number; name: string } | null;
    created_at?: string;
    updated_at?: string;
};
