import { ChevronDown, Search } from 'lucide-react';
import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Module, PermissionInfo } from '../lib';

type Props = {
    modules: Module[];
    permissions: PermissionInfo[];
    /** Granted by the selected role: shown ticked and locked. */
    rolePermissions: string[];
    /** Extra permissions granted directly to the user. */
    value: string[];
    onChange: (next: string[]) => void;
    /** Stretch to the parent's height and scroll the list inside (parent must be a sized flex column). */
    fill?: boolean;
    className?: string;
};

/**
 * Permissions grouped by module. The role's permissions are fixed; the admin only picks extras,
 * so later changes to the role still reach this user.
 */
export function PermissionPicker({ modules, permissions, rolePermissions, value, onChange, fill = false, className }: Props) {
    const [query, setQuery] = React.useState('');
    const [onlyGranted, setOnlyGranted] = React.useState(false);
    const [open, setOpen] = React.useState<Record<string, boolean>>({});

    const fromRole = React.useMemo(() => new Set(rolePermissions), [rolePermissions]);
    const extras = React.useMemo(() => new Set(value), [value]);
    const q = query.trim().toLowerCase();
    const searching = q !== '';

    const groups = React.useMemo(
        () =>
            modules
                .map((module) => {
                    const all = permissions.filter((p) => p.module === module.key);
                    const items = all.filter(
                        (p) =>
                            (!q || p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) &&
                            (!onlyGranted || fromRole.has(p.key) || extras.has(p.key)),
                    );
                    const granted = all.filter((p) => fromRole.has(p.key) || extras.has(p.key)).length;
                    return { module, all, items, granted };
                })
                .filter((g) => g.items.length > 0),
        [modules, permissions, q, onlyGranted, fromRole, extras],
    );

    const toggle = (key: string, on: boolean) => onChange(on ? [...value.filter((k) => k !== key), key] : value.filter((k) => k !== key));
    const toggleModule = (items: PermissionInfo[], on: boolean) => {
        const keys = items.map((p) => p.key).filter((k) => !fromRole.has(k));
        onChange(on ? Array.from(new Set([...value, ...keys])) : value.filter((k) => !keys.includes(k)));
    };

    const effective = new Set([...rolePermissions, ...value]).size;

    return (
        <div className={cn('flex flex-col overflow-hidden rounded-lg border', fill && 'min-h-0 flex-1', className)}>

            <div className="flex flex-col gap-2 border-b bg-muted/30 p-2.5 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions" className="h-8 pl-8 text-sm" aria-label="Search permissions" />
                </div>
                <label className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
                    <Checkbox checked={onlyGranted} onCheckedChange={(v) => setOnlyGranted(v === true)} />
                    Granted only
                </label>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 border-b px-3 py-2 text-xs text-muted-foreground">
                <span>
                    <span className="font-semibold text-foreground tabular-nums">{effective}</span> of {permissions.length} granted
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-primary/60" /> {rolePermissions.length} from role
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-amber-500" /> {value.length} extra
                </span>
            </div>

            <div className={cn('divide-y overflow-y-auto', fill ? 'min-h-0 flex-1' : 'max-h-80')}>
                {groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No permissions match.</p>}
                {groups.map(({ module, all, items, granted }) => {
                    const expanded = searching || onlyGranted || open[module.key] === true;
                    const selectable = items.filter((p) => !fromRole.has(p.key));
                    const allExtra = selectable.length > 0 && selectable.every((p) => extras.has(p.key));
                    const someExtra = selectable.some((p) => extras.has(p.key));
                    return (
                        <div key={module.key}>
                            <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30">
                                <Checkbox
                                    checked={allExtra || (someExtra && 'indeterminate')}
                                    disabled={selectable.length === 0}
                                    onCheckedChange={(v) => toggleModule(items, v === true)}
                                    aria-label={`Grant all ${module.label} permissions`}
                                />
                                <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left" onClick={() => setOpen((o) => ({ ...o, [module.key]: !expanded }))} aria-expanded={expanded}>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{module.label}</span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', granted > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                                            {granted}/{all.length}
                                        </span>
                                        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                                    </span>
                                </button>
                            </div>
                            {expanded && (
                                <ul className="space-y-0.5 bg-muted/20 px-3 pb-2 pl-9">
                                    {items.map((p) => {
                                        const locked = fromRole.has(p.key);
                                        const checked = locked || extras.has(p.key);
                                        return (
                                            <li key={p.key}>
                                                <label className={cn('flex items-start gap-2.5 rounded-md px-2 py-1.5', locked ? 'cursor-default' : 'cursor-pointer hover:bg-background')}>
                                                    <Checkbox className="mt-0.5" checked={checked} disabled={locked} onCheckedChange={(v) => toggle(p.key, v === true)} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex flex-wrap items-center gap-1.5 text-sm">
                                                            {p.label}
                                                            {locked && <span className="rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary">Role</span>}
                                                            {!locked && checked && <span className="rounded bg-amber-500/15 px-1 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-400">Extra</span>}
                                                        </span>
                                                        {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                                                    </span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
