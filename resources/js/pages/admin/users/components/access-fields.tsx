import { ArrowLeft, Check, KeyRound, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AccessCatalog, RoleOption } from '../lib';
import { rolePermissions } from '../lib';
import { PermissionPicker } from './permission-picker';

type Props = AccessCatalog & {
    role: string;
    onRoleChange: (role: string) => void;
    extras: string[];
    onExtrasChange: (extras: string[]) => void;
    errors?: Record<string, string>;
    /** Render hidden inputs for a plain form submit. */
    asFormFields?: boolean;
    /**
     * compact: role list with an extras summary; the picker swaps in on demand (for the profile form).
     * split: role list beside an always-visible picker (for the access dialog).
     * Both fill the parent's height, so the parent must be a sized flex column.
     */
    layout?: 'compact' | 'split';
};

export function AccessFields({ roles, permissions, modules, role, onRoleChange, extras, onExtrasChange, errors = {}, asFormFields = false, layout = 'compact' }: Props) {
    const [picking, setPicking] = React.useState(false);
    const fromRole = rolePermissions(roles, role);
    const selected = roles.find((r) => r.name === role) ?? null;

    const pickRole = (next: string) => {
        onRoleChange(next);
        // Drop extras the new role already covers
        const covered = new Set(rolePermissions(roles, next));
        onExtrasChange(extras.filter((p) => !covered.has(p)));
    };

    const hidden = asFormFields && (
        <>
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="permissions_present" value="1" />
            {extras.map((p) => (
                <input key={p} type="hidden" name="permissions[]" value={p} />
            ))}
        </>
    );

    const picker = <PermissionPicker modules={modules} permissions={permissions} rolePermissions={fromRole} value={extras} onChange={onExtrasChange} fill />;

    if (layout === 'split') {
        return (
            <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
                {hidden}
                <div className="flex min-h-0 flex-col gap-3">
                    <PaneTitle title="Role" hint="Sets the baseline of what they can do." />
                    <RoleList roles={roles} value={role} onChange={pickRole} className="min-h-0 flex-1 overflow-y-auto" />
                    <InputError message={errors.role} />
                </div>
                <div className="flex min-h-[20rem] flex-col gap-3 lg:min-h-0">
                    <PaneTitle title="Permissions" hint={`Ticked by the ${selected ? selected.name : 'selected'} role, plus any extras you add for this user.`} />
                    {picker}
                    <InputError message={errors.permissions} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            {hidden}
            {picking ? (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <PaneTitle title="Extra permissions" hint={`On top of ${selected ? `the ${selected.name} role` : 'the role'}.`} />
                        <Button type="button" size="sm" variant="outline" onClick={() => setPicking(false)}>
                            <ArrowLeft className="size-4" /> Back to roles
                        </Button>
                    </div>
                    {picker}
                </>
            ) : (
                <>
                    <PaneTitle title="Role" hint="Decides what this person can see and do." />
                    <RoleList roles={roles} value={role} onChange={pickRole} className="min-h-0 flex-1 overflow-y-auto" />
                    <InputError message={errors.role} />
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
                        <span className="min-w-0 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                <KeyRound className="size-3.5" /> Extra permissions
                                {extras.length > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 tabular-nums dark:text-amber-400">{extras.length}</span>}
                            </span>
                            {extras.length > 0 ? `${extras.length} beyond the role` : 'None — the role covers everything'}
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={() => setPicking(true)} disabled={!role}>
                            <SlidersHorizontal className="size-4" /> Customize
                        </Button>
                    </div>
                    <InputError message={errors.permissions} />
                </>
            )}
        </div>
    );
}

function PaneTitle({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

/** Compact radio list; the selected role expands to show its description. */
export function RoleList({ roles, value, onChange, className }: { roles: RoleOption[]; value: string; onChange: (role: string) => void; className?: string }) {
    return (
        <div role="radiogroup" aria-label="Role" className={cn('space-y-1 rounded-lg border p-1', className)}>
            {roles.map((r) => {
                const selected = r.name === value;
                return (
                    <button
                        key={r.name}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={r.description ?? undefined}
                        onClick={() => onChange(r.name)}
                        className={cn(
                            'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                            selected ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/60',
                        )}
                    >
                        <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                            {selected && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                                    <ShieldCheck className={cn('size-3.5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                                    <span className="truncate">{r.name}</span>
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                                    {r.permissions.length} perms · {r.usersCount} {r.usersCount === 1 ? 'user' : 'users'}
                                </span>
                            </span>
                            {selected && r.description && <span className="mt-0.5 block text-xs text-muted-foreground">{r.description}</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
