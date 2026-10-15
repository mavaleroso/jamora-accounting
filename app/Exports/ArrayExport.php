<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Generic tabular export: a few title rows (report name, entity, period), a bold heading row, then data.
 */
class ArrayExport implements FromArray, ShouldAutoSize, WithHeadings, WithStyles, WithTitle
{
    /**
     * @param  list<string>  $headings
     * @param  list<list<mixed>>  $rows
     * @param  list<string>  $titleLines
     */
    public function __construct(
        protected array $headings,
        protected array $rows,
        protected array $titleLines = [],
        protected string $sheetTitle = 'Report',
    ) {}

    public function array(): array
    {
        return $this->rows;
    }

    public function headings(): array
    {
        if ($this->titleLines === []) {
            return $this->headings;
        }

        return [...array_map(fn ($line) => [$line], $this->titleLines), [], $this->headings];
    }

    public function styles(Worksheet $sheet): array
    {
        $headingRow = $this->titleLines === [] ? 1 : count($this->titleLines) + 2;

        return [
            1 => ['font' => ['bold' => true, 'size' => $this->titleLines === [] ? 11 : 13]],
            $headingRow => ['font' => ['bold' => true]],
        ];
    }

    public function title(): string
    {
        return mb_substr($this->sheetTitle, 0, 31);
    }
}
