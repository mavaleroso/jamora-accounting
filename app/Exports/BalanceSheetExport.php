<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class BalanceSheetExport implements FromArray, WithHeadings
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function __construct(
        protected array $data
    ) {}

    public function array(): array
    {
        $rows = [];

        $rows[] = ['Assets', '', ''];
        foreach ($this->data['assets'] as $line) {
            $rows[] = [$line['account_code'], $line['account_name'], $line['amount']];
        }
        $rows[] = ['', 'Total Assets', $this->data['total_assets']];
        $rows[] = ['', '', ''];

        $rows[] = ['Liabilities', '', ''];
        foreach ($this->data['liabilities'] as $line) {
            $rows[] = [$line['account_code'], $line['account_name'], $line['amount']];
        }
        $rows[] = ['', 'Total Liabilities', $this->data['total_liabilities']];
        $rows[] = ['', '', ''];

        $rows[] = ['Equity', '', ''];
        foreach ($this->data['equity'] as $line) {
            $rows[] = [$line['account_code'], $line['account_name'], $line['amount']];
        }
        $rows[] = ['', 'Total Equity', $this->data['total_equity']];

        return $rows;
    }

    public function headings(): array
    {
        return ['Account Code', 'Account Name', 'Amount'];
    }
}
