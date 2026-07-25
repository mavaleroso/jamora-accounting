<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class TrialBalanceExport implements FromArray, WithHeadings
{
    /**
     * @param  list<array<string, mixed>>  $rows
     */
    public function __construct(
        protected array $rows,
        protected array $totals = []
    ) {}

    public function array(): array
    {
        $data = array_map(fn (array $row) => [
            $row['account_code'],
            $row['account_name'],
            $row['classification'],
            $row['debit'],
            $row['credit'],
        ], $this->rows);

        if ($this->totals !== []) {
            $data[] = [
                '',
                'Totals',
                '',
                $this->totals['debit'] ?? 0,
                $this->totals['credit'] ?? 0,
            ];
        }

        return $data;
    }

    public function headings(): array
    {
        return ['Account Code', 'Account Name', 'Classification', 'Debit', 'Credit'];
    }
}
