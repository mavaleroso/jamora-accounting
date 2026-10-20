/** When approved overtime is counted (Admin › System Settings). */
export type OvertimePolicy = {
    /** Unpaid break between the end of the shift and the start of overtime. */
    break_minutes: number;
    /** Time of day ("HH:MM") overtime stops counting; null = no ceiling. */
    ceiling: string | null;
};

const DAY = 24 * 60;

const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

/** Minutes past midnight → "7:00 PM"; midnight and noon are named so "12:00" is never ambiguous. */
export function fmtClock(minutes: number): string {
    const m = ((minutes % DAY) + DAY) % DAY;
    const h = Math.floor(m / 60);
    const label = `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    if (m === 0) return `${label} (midnight)`;
    if (m === 12 * 60) return `${label} (noon)`;
    return label;
}

/** 90 → "1 hr 30 min" */
export function fmtDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return [h ? `${h} hr${h > 1 ? 's' : ''}` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
}

/**
 * The overtime window after a shift ending at `shiftEnd` ("HH:MM[:SS]"), as AttendanceCalculator::otWindow
 * computes it: overtime starts after the unpaid break and stops at the ceiling, the first time that time of
 * day comes round after the shift ends. Times are minutes from the shift day's midnight.
 */
export function overtimeWindow({ break_minutes, ceiling }: OvertimePolicy, shiftEnd: string) {
    const end = toMinutes(shiftEnd);
    const start = end + Math.max(0, break_minutes);
    let stop: number | null = null;
    if (ceiling) {
        stop = toMinutes(ceiling);
        while (stop <= end) stop += DAY;
    }

    return { shiftEnd: end, start, stop, maxMinutes: stop === null ? null : Math.max(0, stop - start) };
}

/** One sentence for staff on when approved overtime counts. */
export function describeOvertime({ break_minutes, ceiling }: OvertimePolicy): string {
    const from = break_minutes > 0 ? `${fmtDuration(break_minutes)} after your shift ends (after an unpaid break)` : 'as soon as your shift ends';
    const until = ceiling ? ` up to ${fmtClock(toMinutes(ceiling))}` : '';
    return `Overtime counts from ${from}${until}.`;
}
