import { Check, Download, Search } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { groupByModule, matches, type Module, type Permission, type Role } from '../lib';

/**
 * Read-only role x permission grid straight from the database. Click a role to edit it.
 */
export function AccessMatrix({ roles, modules, permissions, onOpenRole }: { roles: Role[]; modules: Module[]; permissions: Permission[]; onOpenRole: (role: Role) => void }) {
    const [query, setQuery] = React.useState('');
    const [module, setModule] = React.useState('all');
    const [differOnly, setDifferOnly] = React.useState(false);

    const grants = React.useMemo(() => new Map(roles.map((r) => [r.id, new Set(r.permissions)])), [roles]);
    const has = (role: Role, key: string) => grants.get(role.id)?.has(key) ?? false;

    const visible = permissions.filter((p) => {
        if (module !== 'all' && p.module !== module) return false;
        if (!matches(p, query)) return false;
        if (differOnly) {
            const n = roles.filter((r) => has(r, p.key)).length;
            return n > 0 && n < roles.length;
        }
        return true;
    });
    const groups = groupByModule(modules, visible);

    const exportCsv = () => {
        const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const rows = [
            ['Module', 'Permission', 'Key', ...roles.map((r) => r.name)].map(cell).join(','),
            ...groups.flatMap(({ module: m, items }) => items.map((p) => [m.label, p.label, p.key, ...roles.map((r) => (has(r, p.key) ? 'Yes' : ''))].map(cell).join(','))),
        ];
        const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: 'access-matrix.csv' });
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <section className="rounded-xl border bg-card shadow-sm">
            <header className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions" className="h-9 pl-8" aria-label="Search permissions" />
                    </div>
                    <Select value={module} onValueChange={setModule}>
                        <SelectTrigger className="h-9 w-full sm:w-52">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All modules</SelectItem>
                            {modules.map((m) => (
                                <SelectItem key={m.key} value={m.key}>
                                    {m.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Switch checked={differOnly} onCheckedChange={setDifferOnly} /> Only where roles differ
                    </label>
                </div>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                    <Download className="size-4" /> Export CSV
                </Button>
            </header>

            <div className="max-h-[70vh] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr>
                            <th className="sticky top-0 left-0 z-30 min-w-64 border-r border-b bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Permission</th>
                            {roles.map((r) => (
                                <th key={r.id} className="sticky top-0 z-20 min-w-24 border-b bg-muted px-2 py-2 text-center align-bottom">
                                    <button
                                        type="button"
                                        onClick={() => onOpenRole(r)}
                                        className="mx-auto block max-w-28 rounded px-1 text-xs leading-tight font-semibold hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        title={`Edit ${r.name}`}
                                    >
                                        {r.name}
                                    </button>
                                    <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground tabular-nums">{r.permissions.length}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.length === 0 && (
                            <tr>
                                <td colSpan={roles.length + 1} className="px-3 py-12 text-center text-muted-foreground">
                                    No permissions match these filters.
                                </td>
                            </tr>
                        )}
                        {groups.map(({ module: m, items }) => (
                            <React.Fragment key={m.key}>
                                <tr>
                                    <td className="sticky left-0 z-10 border-r border-b bg-card px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{m.label}</td>
                                    <td colSpan={roles.length} className="border-b bg-card" />
                                </tr>
                                {items.map((p) => (
                                    <tr key={p.key} className="group">
                                        <td className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1.5 group-hover:bg-muted">
                                            <span className="block font-medium">{p.label}</span>
                                            <code className="block font-mono text-[10px] text-muted-foreground">{p.key}</code>
                                        </td>
                                        {roles.map((r) => (
                                            <td key={r.id} className="border-b px-2 py-1.5 text-center group-hover:bg-muted/50">
                                                {has(r, p.key) ? (
                                                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" aria-label="Granted">
                                                        <Check className="size-3.5" />
                                                    </span>
                                                ) : (
                                                    <span className="inline-block size-1 rounded-full bg-muted-foreground/25" aria-label="Not granted" />
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className={cn('border-t px-3 py-2 text-[11px] text-muted-foreground')}>
                {visible.length} of {permissions.length} permissions shown. Click a role name to edit its permissions. Direct per-user grants are managed in Admin › Users.
            </p>
        </section>
    );
}
