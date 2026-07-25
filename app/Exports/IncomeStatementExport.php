<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class IncomeStatementExport implements FromArray, WithHeadings
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

        $rows[] = ['Revenue', '', ''];
        foreach ($this->data['revenue'] as $line) {
            $rows[] = [$line['account_code'], $line['account_name'], $line['amount']];
        }
        $rows[] = ['', 'Total Revenue', $this->data['total_revenue']];
        $rows[] = ['', '', ''];

        $rows[] = ['Expenses', '', ''];
        foreach ($this->data['expenses'] as $line) {
            $rows[] = [$line['account_code'], $line['account_name'], $line['amount']];
        }
        $rows[] = ['', 'Total Expenses', $this->data['total_expenses']];
        $rows[] = ['', '', ''];
        $rows[] = ['', 'Net Income', $this->data['net_income']];

        return $rows;
    }

    public function headings(): array
    {
        return ['Account Code', 'Account Name', 'Amount'];
    }
}
