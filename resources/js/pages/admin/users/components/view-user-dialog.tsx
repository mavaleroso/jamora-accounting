import { BadgeCheck, CalendarDays, KeyRound, Mail, MapPin, Pencil, Phone, Power, ShieldAlert, ShieldCheck, User as UserIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AccessCatalog, UserRow } from '../lib';
import { extrasOnly, fmtDate, fmtLastSeen, isOnline, rolePermissions } from '../lib';
import { RoleBadge, StatusBadge, UserAvatar } from './shared';

type Props = AccessCatalog & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: UserRow | null;
    isSelf: boolean;
    onEdit: (user: UserRow) => void;
    onAccess: (user: UserRow) => void;
    onToggleStatus: (user: UserRow) => void;
};

export function ViewUserDialog({ open, onOpenChange, user, isSelf, onEdit, onAccess, onToggleStatus, roles, permissions, modules }: Props) {
    const access = React.useMemo(() => {
        if (!user) return [];
        const fromRole = new Set(rolePermissions(roles, user.roles?.[0]));
        const extras = new Set(extrasOnly(user.permissions, [...fromRole]));
        return modules
            .map((m) => ({
                module: m,
                items: permissions.filter((p) => p.module === m.key && (fromRole.has(p.key) || extras.has(p.key))).map((p) => ({ ...p, extra: extras.has(p.key) })),
            }))
            .filter((g) => g.items.length > 0);
    }, [user, roles, permissions, modules]);

    if (!user) return null;

    const active = user.status !== false;
    const total = access.reduce((n, g) => n + g.items.length, 0);
    const extraCount = access.reduce((n, g) => n + g.items.filter((i) => i.extra).length, 0);
    const online = isOnline(user);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                <DialogHeader className="border-b bg-gradient-to-b from-primary/5 to-transparent p-5 pr-12 text-left">
                    <div className="flex items-start gap-4">
                        <UserAvatar user={user} className="size-16 text-lg" showPresence />
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                                <span className="truncate">{user.name}</span>
                                {isSelf && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">You</span>}
                            </DialogTitle>
                            <DialogDescription className="truncate">
                                @{user.username}
                                {user.position && ` · ${user.position}`}
                            </DialogDescription>
                            <div className="flex flex-wrap items-center gap-2">
                                <RoleBadge role={user.roles?.[0]} />
                                <StatusBadge active={active} />
                                <span className={cn('text-xs', online ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{online ? '● Online now' : `Last seen ${fmtLastSeen(user.last_seen_at).toLowerCase()}`}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-3">
                        <Button size="sm" onClick={() => onEdit(user)}>
                            <Pencil className="size-4" /> Edit profile
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onAccess(user)}>
                            <KeyRound className="size-4" /> Manage access
                        </Button>
                        {!isSelf && (
                            <Button size="sm" variant="outline" className={cn(active && 'text-destructive hover:text-destructive')} onClick={() => onToggleStatus(user)}>
                                <Power className="size-4" /> {active ? 'Disable' : 'Enable'}
                            </Button>
                        )}
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
                    {!active && (
                        <div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                            This account is disabled and cannot sign in.
                        </div>
                    )}

                    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        <Info icon={Mail} label="Email">
                            {user.email ? (
                                <a href={`mailto:${user.email}`} className="hover:underline">
                                    {user.email}
                                </a>
                            ) : (
                                '—'
                            )}
                        </Info>
                        <Info icon={Phone} label="Contact number">
                            {user.contact_number ? (
                                <a href={`tel:${user.contact_number}`} className="hover:underline">
                                    {user.contact_number}
                                </a>
                            ) : (
                                '—'
                            )}
                        </Info>
                        <Info icon={UserIcon} label="Sex · Birthdate">
                            {[user.sex, user.birthdate ? fmtDate(user.birthdate) : null].filter(Boolean).join(' · ') || '—'}
                        </Info>
                        <Info icon={CalendarDays} label="Date started">
                            {fmtDate(user.date_started)}
                        </Info>
                        <Info icon={MapPin} label="Address" className="sm:col-span-2">
                            {user.address || '—'}
                        </Info>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Fact label="Two-factor" value={user.two_factor_enabled ? 'On' : 'Off'} good={user.two_factor_enabled} />
                        <Fact label="Email" value={user.email_verified_at ? 'Verified' : 'Unverified'} good={!!user.email_verified_at} />
                        <Fact label="Created" value={fmtDate(user.created_at)} />
                        <Fact label="Updated" value={fmtDate(user.updated_at)} />
                    </div>

                    <section>
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                            <h3 className="text-sm font-semibold">What they can access</h3>
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {total} permission{total === 1 ? '' : 's'}
                                {extraCount > 0 && ` · ${extraCount} extra`}
                            </span>
                        </div>
                        {access.length === 0 ? (
                            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No permissions. Assign a role to give this user access.</p>
                        ) : (
                            <div className="divide-y rounded-lg border">
                                {access.map(({ module, items }) => (
                                    <div key={module.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                                        <span className="text-xs font-semibold text-muted-foreground">{module.label}</span>
                                        <div className="flex flex-wrap gap-1">
                                            {items.map((p) => (
                                                <span
                                                    key={p.key}
                                                    title={p.description || p.key}
                                                    className={cn(
                                                        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]',
                                                        p.extra ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted/40',
                                                    )}
                                                >
                                                    {p.extra && <ShieldCheck className="size-3" />}
                                                    {p.label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Info({ icon: Icon, label, children, className }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('flex gap-3', className)}>
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm break-words">{children}</p>
            </div>
        </div>
    );
}

function Fact({ label, value, good }: { label: string; value: string; good?: boolean }) {
    return (
        <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn('flex items-center gap-1 text-sm font-medium', good === true && 'text-emerald-700 dark:text-emerald-400', good === false && 'text-amber-700 dark:text-amber-400')}>
                {good === true && <BadgeCheck className="size-3.5" />}
                {value}
            </p>
        </div>
    );
}
