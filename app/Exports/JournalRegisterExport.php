<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class JournalRegisterExport implements FromArray, WithHeadings
{
    /**
     * @param  list<array<string, mixed>>  $rows
     */
    public function __construct(
        protected array $rows
    ) {}

    public function array(): array
    {
        return array_map(fn (array $row) => [
            $row['entry_date'],
            $row['entry_no'],
            $row['journal_code'] ?? '',
            $row['reference'] ?? '',
            $row['memo'] ?? '',
            $row['status'],
            $row['total_debit'],
            $row['total_credit'],
        ], $this->rows);
    }

    public function headings(): array
    {
        return ['Date', 'Entry No.', 'Journal', 'Reference', 'Memo', 'Status', 'Debit', 'Credit'];
    }
}
