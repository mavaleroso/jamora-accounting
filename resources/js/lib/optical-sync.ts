import { toast } from '@/lib/toast';
import { router } from '@inertiajs/react';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Checking the optical POS, followed from anywhere in the app.
 *
 * The check is started with a plain request rather than a page visit, and its state lives here, outside any page:
 * moving to another page neither cancels it nor loses the toast that shows how far it has got. After a full reload
 * the toast picks the running check up again from the server (see resumeOpticalSync).
 */

const RUN_URL = '/integration/optical/run';
const STATUS_URL = '/integration/optical/status';
const OPTICAL_PATH = '/integration/optical';
const TOAST_ID = 'optical-sync';
const POLL_MS = 1500;

type Progress = { id: number; status: string; step: string | null; read: number; booked: number; failed: number };
type Outcome = { ok: boolean; message: string };
type Status = { running: Progress | null; latest: (Progress & Outcome) | null };

let running = false;
let resumed = false;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function setRunning(next: boolean) {
    if (running === next) return;
    running = next;
    listeners.forEach((notify) => notify());
}

function csrfToken(): string {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

const headers = () => ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-XSRF-TOKEN': csrfToken(),
});

async function fetchStatus(): Promise<Status | null> {
    try {
        const res = await fetch(STATUS_URL, { headers: headers(), credentials: 'same-origin' });
        return res.ok ? ((await res.json()) as Status) : null;
    } catch {
        return null;
    }
}

function describe(progress: Progress | null): string {
    if (!progress) return 'Starting…';

    const counts = [`${progress.read.toLocaleString()} read`, `${progress.booked.toLocaleString()} booked`];
    if (progress.failed > 0) counts.push(`${progress.failed.toLocaleString()} failed`);

    return `${progress.step ?? 'Working'} · ${counts.join(' · ')}`;
}

function showProgress(title: string, progress: Progress | null) {
    toast.loading(title, { id: TOAST_ID, description: describe(progress), duration: Infinity });
}

function finish(outcome: Outcome) {
    clearInterval(timer);
    timer = undefined;
    setRunning(false);

    const options = { id: TOAST_ID, description: outcome.message, duration: 8000 };
    if (outcome.ok) toast.success('Optical POS checked', options);
    else toast.error('Optical POS checked, with problems', options);

    // The Optical POS pages list runs and exceptions: show the new ones without a manual refresh.
    if (window.location.pathname.startsWith(OPTICAL_PATH)) {
        router.reload();
    }
}

/**
 * Keep the toast in step with the server until the check ends. `runId` is the check being followed when it is
 * already known (after a reload); a check just started is learnt from the first poll that sees it running.
 */
function follow(title: string, runId: number | null) {
    clearInterval(timer);
    let seen = runId;

    timer = setInterval(async () => {
        const status = await fetchStatus();
        if (!status || !running) return;

        if (status.running) {
            seen = status.running.id;
            showProgress(title, status.running);
        } else if (seen !== null && status.latest?.id === seen) {
            // Reached only when the request that started the check is gone (a reload): it reports the end otherwise.
            finish(status.latest);
        }
    }, POLL_MS);
}

/** Start a check. `full` re-reads every stream from the start. */
export async function startOpticalSync(full: boolean): Promise<void> {
    if (running) return;

    const title = full ? 'Re-reading the optical POS' : 'Checking the optical POS';
    setRunning(true);
    showProgress(title, null);
    follow(title, null);

    try {
        const res = await fetch(RUN_URL, { method: 'POST', headers: headers(), credentials: 'same-origin', body: JSON.stringify({ full }) });
        const body = (await res.json().catch(() => null)) as Partial<Outcome> | null;

        finish({
            ok: res.ok && body?.ok === true,
            message: body?.message ?? (res.ok ? 'Done.' : `The check could not be started (error ${res.status}).`),
        });
    } catch {
        // The connection dropped, not the check: the server finishes it, and the polling reports how it went.
        const status = await fetchStatus();
        if (!status?.running) {
            finish(status?.latest ?? { ok: false, message: 'Lost the connection while checking. Open Optical POS to see how the check went.' });
        }
    }
}

/** After a page load: if a check this user started is still running, show its toast again and follow it. */
export async function resumeOpticalSync(): Promise<void> {
    if (resumed || running) return;
    resumed = true;

    const status = await fetchStatus();
    if (!status?.running || running) return;

    const title = 'Checking the optical POS';
    setRunning(true);
    showProgress(title, status.running);
    follow(title, status.running.id);
}

const subscribe = (notify: () => void) => {
    listeners.add(notify);
    return () => {
        listeners.delete(notify);
    };
};

/** Whether a check started from this browser tab is running. */
export function useOpticalSyncRunning(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => running,
        () => false,
    );
}

/** Picks a running check up again once per page load, for users who may start one. */
export function useResumeOpticalSync(canSync: boolean): void {
    useEffect(() => {
        if (canSync) void resumeOpticalSync();
    }, [canSync]);
}
