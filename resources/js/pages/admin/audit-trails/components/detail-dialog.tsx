import { Check, ChevronDown, ChevronUp, Copy, History, Layers, Monitor, Search, Terminal } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AuditTrail } from '@/types';
import { describeDevice, EventBadge, fmtDateTime, fmtRelative, fmtValue, UserAvatar, wordDiff } from './shared';
import type { Change } from './shared';

type Props = {
    item: AuditTrail | null;
    /** 1-based position on the current page, and the page size, for "3 of 25". */
    position: { index: number; total: number } | null;
    onClose: () => void;
    onPrev: (() => void) | null;
    onNext: (() => void) | null;
    onHistory: (item: AuditTrail) => void;
    onBatch: (batchId: string) => void;
    onUser: (userId: number) => void;
};

export function DetailDialog({ item, position, onClose, onPrev, onNext, onHistory, onBatch, onUser }: Props) {
    const [fieldQuery, setFieldQuery] = React.useState('');
    React.useEffect(() => setFieldQuery(''), [item?.id]);

    // ↑/↓ (or k/j) walk through the entries on this page while the dialog is open
    React.useEffect(() => {
        if (!item) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            const go = e.key === 'ArrowDown' || e.key === 'j' ? onNext : e.key === 'ArrowUp' || e.key === 'k' ? onPrev : null;
            if (!go) return;
            e.preventDefault();
            go();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [item, onNext, onPrev]);

    const changes = React.useMemo(() => {
        if (!item) return [];
        const q = fieldQuery.trim().toLowerCase();
        return q ? item.changes.filter((c) => c.label.toLowerCase().includes(q) || c.field.toLowerCase().includes(q) || fmtValue(c.from).toLowerCase().includes(q) || fmtValue(c.to).toLowerCase().includes(q)) : item.changes;
    }, [item, fieldQuery]);

    const device = describeDevice(item?.request.user_agent ?? null);

    return (
        <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                {item && (
                    <>
                        <DialogHeader className="space-y-1 border-b p-5 pr-12 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                                <EventBadge event={item.event} />
                                {item.subject.type_label && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{item.subject.type_label}</span>}
                                <span className="text-xs text-muted-foreground" title={fmtDateTime(item.created_at)}>
                                    {fmtRelative(item.created_at)}
                                </span>
                            </div>
                            <DialogTitle className="text-lg leading-snug">{item.subject.label ?? item.description ?? 'Request'}</DialogTitle>
                            <DialogDescription asChild>
                                <div className="flex items-center gap-2.5 text-left">
                                    <UserAvatar id={item.user?.id} name={item.user?.name} className="size-8" />
                                    <div className="min-w-0 text-sm">
                                        {item.user ? (
                                            <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onUser(item.user!.id)} title="Show everything this user did">
                                                {item.user.name}
                                            </button>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                                {item.source === 'console' && <Terminal className="size-3.5" />} System
                                            </span>
                                        )}
                                        {item.user?.username && <span className="text-muted-foreground"> @{item.user.username}</span>}
                                        <span className="block text-xs text-muted-foreground">
                                            {[fmtDateTime(item.created_at), item.entity?.name, item.source !== 'web' ? item.source : null].filter(Boolean).join(' · ')}
                                        </span>
                                    </div>
                                </div>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                            {item.description && item.event !== 'request' && <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{item.description}</p>}

                            {item.changes.length > 0 ? (
                                <section>
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                            {item.event === 'created' ? 'Values set' : item.event === 'deleted' ? 'Values removed' : 'What changed'}
                                            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{item.changes.length}</span>
                                        </h3>
                                        {item.changes.length > 6 && (
                                            <div className="relative w-44">
                                                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                                <Input value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} placeholder="Find field" className="h-7 pl-7 text-xs" aria-label="Find field" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="divide-y overflow-hidden rounded-lg border">
                                        {changes.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No fields match “{fieldQuery}”.</p>}
                                        {changes.map((c) => (
                                            <ChangeRow key={c.field} change={c} event={item.event} />
                                        ))}
                                    </div>
                                </section>
                            ) : (
                                <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                                    {item.event === 'request'
                                        ? 'This request changed records directly (bulk update) — the submitted data is shown below.'
                                        : item.event === 'login' || item.event === 'logout'
                                          ? 'A session event — the IP address and device are shown below.'
                                          : 'No field values recorded.'}
                                </p>
                            )}

                            {((item.subject.type && item.subject.id) || item.batch_id) && (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {item.subject.type && item.subject.id && (
                                        <Button size="sm" variant="outline" className="justify-start" onClick={() => onHistory(item)}>
                                            <History className="size-4" /> Full history of this record
                                        </Button>
                                    )}
                                    {item.batch_id && (
                                        <Button size="sm" variant="outline" className="justify-start" onClick={() => onBatch(item.batch_id!)}>
                                            <Layers className="size-4" /> Everything in the same action
                                        </Button>
                                    )}
                                </div>
                            )}

                            <section>
                                <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Context</h3>
                                <dl className="divide-y rounded-lg border text-sm">
                                    <Row label="Record">{item.subject.type_label ? `${item.subject.type_label} #${item.subject.id}` : '—'}</Row>
                                    <Row label="Branch">{item.entity ? `${item.entity.name} (${item.entity.code})` : '—'}</Row>
                                    <Row label="IP address">
                                        <span className="font-mono text-xs">{item.request.ip ?? '—'}</span>
                                    </Row>
                                    {device && (
                                        <Row label="Device">
                                            <span className="inline-flex items-center gap-1.5">
                                                <Monitor className="size-3.5 text-muted-foreground" /> {device}
                                            </span>
                                        </Row>
                                    )}
                                    <Row label="Audit ID">
                                        <span className="inline-flex items-center gap-1.5">
                                            <code className="text-xs">#{item.id}</code>
                                            <CopyButton value={String(item.id)} label="audit ID" />
                                        </span>
                                    </Row>
                                </dl>
                            </section>

                            <Collapsible>
                                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground">
                                    Technical details
                                    <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-4 pt-2">
                                    <dl className="divide-y rounded-lg border text-sm">
                                        <Row label="Route">
                                            <code className="text-xs break-all">{item.request.route ?? '—'}</code>
                                        </Row>
                                        {item.request.method && (
                                            <Row label="Request">
                                                <code className="text-xs">
                                                    {item.request.method} {item.request.status ?? ''}
                                                </code>
                                            </Row>
                                        )}
                                        {item.request.url && (
                                            <Row label="URL">
                                                <span className="text-xs break-all">{item.request.url}</span>
                                            </Row>
                                        )}
                                        {item.request.user_agent && (
                                            <Row label="User agent">
                                                <span className="text-xs break-all text-muted-foreground">{item.request.user_agent}</span>
                                            </Row>
                                        )}
                                        {item.batch_id && (
                                            <Row label="Batch">
                                                <code className="text-[11px] break-all">{item.batch_id}</code>
                                            </Row>
                                        )}
                                    </dl>
                                    {item.request.payload && Object.keys(item.request.payload).length > 0 && (
                                        <div>
                                            <div className="mb-1.5 flex items-center justify-between">
                                                <span className="text-xs font-medium text-muted-foreground">Submitted data</span>
                                                <CopyButton value={JSON.stringify(item.request.payload, null, 2)} label="submitted data" />
                                            </div>
                                            <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">{JSON.stringify(item.request.payload, null, 2)}</pre>
                                        </div>
                                    )}
                                </CollapsibleContent>
                            </Collapsible>
                        </div>

                        {position && (
                            <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3">
                                <span className="text-xs text-muted-foreground">
                                    <span className="tabular-nums">
                                        {position.index} of {position.total}
                                    </span>
                                    <span className="hidden sm:inline">
                                        {' '}
                                        · <kbd className="rounded border bg-background px-1 font-mono text-[10px]">↑</kbd> <kbd className="rounded border bg-background px-1 font-mono text-[10px]">↓</kbd> to move
                                    </span>
                                </span>
                                <div className="flex gap-1.5">
                                    <Button size="sm" variant="outline" disabled={!onPrev} onClick={() => onPrev?.()}>
                                        <ChevronUp className="size-4" /> Newer
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={!onNext} onClick={() => onNext?.()}>
                                        <ChevronDown className="size-4" /> Older
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function ChangeRow({ change: c, event }: { change: Change; event: AuditTrail['event'] }) {
    const from = fmtValue(c.from);
    const to = fmtValue(c.to);
    const showFrom = event !== 'created';
    const showTo = event !== 'deleted';
    // Long text edits read better as one paragraph with the changed words marked
    const diff = event === 'updated' && typeof c.from === 'string' && typeof c.to === 'string' && (c.from.length > 40 || c.to.length > 40) ? wordDiff(c.from, c.to) : null;

    return (
        <div className="space-y-1.5 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <code className="truncate text-[10px] text-muted-foreground">{c.field}</code>
            </div>
            {diff ? (
                <p className="rounded-md bg-muted/40 px-2.5 py-1.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                    {diff.map((p, i) => (
                        <span
                            key={i}
                            className={cn(
                                p.kind === 'removed' && 'rounded-sm bg-rose-100 text-rose-800 line-through decoration-rose-400/70 dark:bg-rose-950/60 dark:text-rose-300',
                                p.kind === 'added' && 'rounded-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
                            )}
                        >
                            {p.text}
                        </span>
                    ))}
                </p>
            ) : (
                <div className={cn('grid gap-1.5', showFrom && showTo && 'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start')}>
                    {showFrom && <Value text={from} tone={event === 'updated' || event === 'deleted' ? 'old' : undefined} />}
                    {showFrom && showTo && <span className="hidden pt-1.5 text-xs text-muted-foreground sm:block">→</span>}
                    {showTo && <Value text={to} tone={event === 'updated' ? 'new' : undefined} />}
                </div>
            )}
        </div>
    );
}

function Value({ text, tone }: { text: string; tone?: 'old' | 'new' }) {
    return (
        <div
            className={cn(
                'max-h-48 overflow-auto rounded-md px-2.5 py-1.5 font-mono text-xs break-words whitespace-pre-wrap',
                !tone && 'bg-muted/40',
                tone === 'old' && 'bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
                tone === 'new' && 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
                text === '—' && 'text-muted-foreground',
            )}
        >
            {text}
        </div>
    );
}

function CopyButton({ value, label }: { value: string; label: string }) {
    const [done, setDone] = React.useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            toast.success(`Copied ${label}`);
            window.setTimeout(() => setDone(false), 1500);
        } catch {
            toast.error('Could not copy to clipboard');
        }
    };
    return (
        <button type="button" onClick={copy} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Copy ${label}`} title={`Copy ${label}`}>
            {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        </button>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    );
}
