import { History, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AuditTrail } from '@/types';
import { EventBadge, fmtDateTime, fmtValue } from './shared';

export function DetailSheet({ item, onClose, onHistory, onBatch }: { item: AuditTrail | null; onClose: () => void; onHistory: (item: AuditTrail) => void; onBatch: (batchId: string) => void }) {
    return (
        <Sheet open={item !== null} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                {item && (
                    <>
                        <SheetHeader className="space-y-1.5 border-b pb-4">
                            <div className="flex items-center gap-2">
                                <EventBadge event={item.event} />
                                <span className="text-xs text-muted-foreground">{fmtDateTime(item.created_at)}</span>
                            </div>
                            <SheetTitle className="text-left">{item.subject.label ?? item.description ?? 'Request'}</SheetTitle>
                            <SheetDescription className="text-left">
                                {item.user?.name ?? 'System'}
                                {item.user?.username && ` (@${item.user.username})`}
                                {item.entity && ` · ${item.entity.name}`}
                                {item.source !== 'web' && ` · ${item.source}`}
                            </SheetDescription>
                        </SheetHeader>

                        <div className="space-y-5 p-4">
                            {item.description && item.event !== 'request' && <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{item.description}</p>}

                            {item.changes.length > 0 ? (
                                <section>
                                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        {item.event === 'created' ? 'Values set' : item.event === 'deleted' ? 'Values removed' : 'What changed'}
                                    </h3>
                                    <div className="overflow-hidden rounded-lg border">
                                        <table className="w-full table-fixed text-sm">
                                            <thead className="bg-muted/40 text-xs text-muted-foreground">
                                                <tr>
                                                    <th className="w-1/3 px-3 py-2 text-left font-medium">Field</th>
                                                    {item.event !== 'created' && <th className="px-3 py-2 text-left font-medium">Before</th>}
                                                    {item.event !== 'deleted' && <th className="px-3 py-2 text-left font-medium">After</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {item.changes.map((c) => (
                                                    <tr key={c.field} className="align-top">
                                                        <td className="px-3 py-2">
                                                            <span className="block font-medium">{c.label}</span>
                                                            <code className="text-[10px] text-muted-foreground">{c.field}</code>
                                                        </td>
                                                        {item.event !== 'created' && <Value value={c.from} tone={item.event === 'updated' || item.event === 'deleted' ? 'old' : undefined} />}
                                                        {item.event !== 'deleted' && <Value value={c.to} tone={item.event === 'updated' ? 'new' : undefined} />}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    {item.event === 'request' ? 'This request changed records directly (bulk update) — the submitted data is shown below.' : 'No field values recorded.'}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {item.subject.type && item.subject.id && (
                                    <Button size="sm" variant="outline" onClick={() => onHistory(item)}>
                                        <History className="size-4" /> Full history of this record
                                    </Button>
                                )}
                                {item.batch_id && (
                                    <Button size="sm" variant="outline" onClick={() => onBatch(item.batch_id!)}>
                                        <Layers className="size-4" /> Everything changed in the same action
                                    </Button>
                                )}
                            </div>

                            <section>
                                <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Context</h3>
                                <dl className="divide-y rounded-lg border text-sm">
                                    <Row label="Record">{item.subject.type_label ? `${item.subject.type_label} #${item.subject.id}` : '—'}</Row>
                                    <Row label="Action">{item.request.route ?? '—'}</Row>
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
                                    <Row label="IP address">{item.request.ip ?? '—'}</Row>
                                    {item.request.user_agent && (
                                        <Row label="Device">
                                            <span className="text-xs break-all text-muted-foreground">{item.request.user_agent}</span>
                                        </Row>
                                    )}
                                    <Row label="Audit ID">
                                        <code className="text-xs">#{item.id}</code>
                                    </Row>
                                </dl>
                            </section>

                            {item.request.payload && Object.keys(item.request.payload).length > 0 && (
                                <section>
                                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Submitted data</h3>
                                    <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">{JSON.stringify(item.request.payload, null, 2)}</pre>
                                </section>
                            )}
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function Value({ value, tone }: { value: unknown; tone?: 'old' | 'new' }) {
    const text = fmtValue(value);
    return (
        <td
            className={cn(
                'px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap',
                tone === 'old' && 'bg-rose-50/60 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300',
                tone === 'new' && 'bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300',
                text === '—' && 'text-muted-foreground',
            )}
        >
            {text}
        </td>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}
