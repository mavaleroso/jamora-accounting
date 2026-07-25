<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class CashFlowExport implements FromArray, WithHeadings
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

        foreach (['operating' => 'Operating Activities', 'investing' => 'Investing Activities', 'financing' => 'Financing Activities'] as $key => $label) {
            $section = $this->data[$key];
            $rows[] = [$label, '', ''];
            foreach ($section['lines'] as $line) {
                $rows[] = [$line['account_code'] ?? '', $line['account_name'], $line['amount']];
            }
            $rows[] = ['', "Net cash from {$label}", $section['total']];
            $rows[] = ['', '', ''];
        }

        $rows[] = ['', 'Net Change in Cash', $this->data['net_cash_change']];

        return $rows;
    }

    public function headings(): array
    {
        return ['Account Code', 'Description', 'Amount'];
    }
}
