const phpCurrencyFormatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function formatPhpCurrency(amount: number | string | null | undefined): string {
    const value = Number(amount ?? 0);
    if (Number.isNaN(value)) {
        return phpCurrencyFormatter.format(0);
    }
    return phpCurrencyFormatter.format(value);
}

export function formatPhpNumber(amount: number | string | null | undefined): string {
    const value = Number(amount ?? 0);
    if (Number.isNaN(value)) {
        return '0.00';
    }
    return value.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
