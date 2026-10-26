import Heading from '@/components/heading';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn, toUrl } from '@/lib/utils';
import { edit as editAppearance } from '@/routes/appearance';
import { edit } from '@/routes/profile';
import { edit as editPassword } from '@/routes/user-password';
import { Link, type InertiaLinkProps } from '@inertiajs/react';
import { KeyRound, Palette, UserRound, type LucideIcon } from 'lucide-react';
import type { PropsWithChildren } from 'react';

type SettingsNavItem = {
    title: string;
    hint: string;
    href: NonNullable<InertiaLinkProps['href']>;
    icon: LucideIcon;
};

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentUrl } = useCurrentUrl();

    // When server-side rendering, we only render the layout on the client...
    if (typeof window === 'undefined') {
        return null;
    }

    const groups: { label: string; items: SettingsNavItem[] }[] = [
        {
            label: 'Account',
            items: [{ title: 'Profile', hint: 'Details, employment, access', href: edit(), icon: UserRound }],
        },
        {
            label: 'Security',
            items: [{ title: 'Password', hint: 'Your sign-in password', href: editPassword(), icon: KeyRound }],
        },
        {
            label: 'Preferences',
            items: [{ title: 'Appearance', hint: 'Theme, layout, width', href: editAppearance(), icon: Palette }],
        },
    ];

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
            <Heading title="Settings" description="Your profile, sign-in security and how the app looks for you." />

            <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
                <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
                    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
                        {/* Phones and tablets: one row of tabs. Desktop: grouped list with hints. */}
                        <div className="flex gap-1 lg:flex-col lg:gap-5">
                            {groups.map((group) => (
                                <div key={group.label} className="flex gap-1 lg:flex-col">
                                    <p className="text-muted-foreground hidden px-3 pb-1 text-[11px] font-semibold tracking-wide uppercase lg:block">
                                        {group.label}
                                    </p>
                                    {group.items.map((item) => {
                                        const active = isCurrentUrl(item.href);
                                        const Icon = item.icon;
                                        return (
                                            <Link
                                                key={toUrl(item.href)}
                                                href={item.href}
                                                aria-current={active ? 'page' : undefined}
                                                className={cn(
                                                    'group flex shrink-0 items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors lg:items-start lg:border-transparent',
                                                    active
                                                        ? 'border-primary/30 bg-primary/5 text-foreground lg:border-primary/20'
                                                        : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        'flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                                                        active
                                                            ? 'border-primary/30 bg-primary/10 text-primary'
                                                            : 'bg-background group-hover:text-foreground',
                                                    )}
                                                >
                                                    <Icon className="size-4" aria-hidden />
                                                </span>
                                                <span className="min-w-0 lg:flex-1">
                                                    <span className="flex items-center gap-2 font-medium whitespace-nowrap">{item.title}</span>
                                                    <span className="text-muted-foreground hidden truncate text-xs leading-snug lg:block">
                                                        {item.hint}
                                                    </span>
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </nav>
                </aside>

                <div className="min-w-0 space-y-6">{children}</div>
            </div>
        </div>
    );
}
