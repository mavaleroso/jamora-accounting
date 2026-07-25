import { DownloadIcon, LoaderCircleIcon, PrinterIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatPeriodLabel, type ReportPeriodOption } from './report-utils';

type ReportToolbarProps = {
    periods: ReportPeriodOption[];
    periodId: string;
    onPeriodChange: (value: string) => void;
    onGenerate: () => void;
    loading?: boolean;
    canExport?: boolean;
    exportUrl?: string;
    children?: React.ReactNode;
    description?: string;
};

export function ReportToolbar({
    periods,
    periodId,
    onPeriodChange,
    onGenerate,
    loading = false,
    canExport = false,
    exportUrl,
    children,
    description = 'Select an accounting period and generate the report.',
}: ReportToolbarProps) {
    return (
        <Card className="border-border/60 shadow-sm print:hidden">
            <CardHeader className="border-b border-border/60 bg-muted/30 py-4">
                <CardTitle className="text-base">Filters</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                    <Label>Accounting Period *</Label>
                    <Select value={periodId} onValueChange={onPeriodChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                            {periods.map((period) => (
                                <SelectItem key={period.id} value={String(period.id)}>
                                    {formatPeriodLabel(period)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {children}
                <div className="flex flex-wrap items-end gap-2 md:col-span-4">
                    <Button type="button" onClick={onGenerate} disabled={loading || !periodId}>
                        {loading ? (
                            <>
                                <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                                Loading...
                            </>
                        ) : (
                            'Generate'
                        )}
                    </Button>
                    {canExport && exportUrl ? (
                        <Button type="button" variant="outline" asChild>
                            <a href={exportUrl}>
                                <DownloadIcon className="mr-2 size-4" />
                                Export Excel
                            </a>
                        </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={() => window.print()}>
                        <PrinterIcon className="mr-2 size-4" />
                        Print
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
