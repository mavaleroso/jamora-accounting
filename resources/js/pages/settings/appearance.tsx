import { Head } from '@inertiajs/react';
import { Check, LayoutPanelLeft, Monitor, Moon, Palette, Sun, type LucideIcon } from 'lucide-react';

import LayoutToggle, { ContentWidthToggle } from '@/components/layout-toggle';
import { useAppearance, type Appearance as Theme } from '@/hooks/use-appearance';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';

import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { SettingsSection } from '@/layouts/settings/section';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Appearance settings',
        href: '/settings/appearance',
    },
];

const THEMES: { value: Theme; label: string; hint: string; icon: LucideIcon }[] = [
    { value: 'light', label: 'Light', hint: 'Bright, for daytime', icon: Sun },
    { value: 'dark', label: 'Dark', hint: 'Easy on the eyes at night', icon: Moon },
    { value: 'system', label: 'System', hint: 'Follows your device', icon: Monitor },
];

/** A tiny drawing of the app in a theme: sidebar, header and a few content rows. */
function Preview({ dark }: { dark: boolean }) {
    return (
        <div className={cn('flex h-full w-full gap-1.5 p-2', dark ? 'bg-neutral-900' : 'bg-neutral-100')}>
            <div className={cn('w-1/4 space-y-1 rounded-sm p-1', dark ? 'bg-neutral-800' : 'bg-white')}>
                <div className="bg-primary/70 h-1.5 w-3/4 rounded-full" />
                <div className={cn('h-1 rounded-full', dark ? 'bg-neutral-600' : 'bg-neutral-200')} />
                <div className={cn('h-1 rounded-full', dark ? 'bg-neutral-600' : 'bg-neutral-200')} />
                <div className={cn('h-1 w-2/3 rounded-full', dark ? 'bg-neutral-600' : 'bg-neutral-200')} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
                <div className={cn('h-2.5 rounded-sm', dark ? 'bg-neutral-800' : 'bg-white')} />
                <div className={cn('flex-1 space-y-1 rounded-sm p-1.5', dark ? 'bg-neutral-800' : 'bg-white')}>
                    <div className={cn('h-1.5 w-1/2 rounded-full', dark ? 'bg-neutral-500' : 'bg-neutral-300')} />
                    <div className={cn('h-1 rounded-full', dark ? 'bg-neutral-700' : 'bg-neutral-100')} />
                    <div className={cn('h-1 rounded-full', dark ? 'bg-neutral-700' : 'bg-neutral-100')} />
                    <div className={cn('h-1 w-3/4 rounded-full', dark ? 'bg-neutral-700' : 'bg-neutral-100')} />
                </div>
            </div>
        </div>
    );
}

function ThemePicker() {
    const { appearance, updateAppearance } = useAppearance();

    return (
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
            {THEMES.map(({ value, label, hint, icon: Icon }) => {
                const selected = appearance === value;
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => updateAppearance(value)}
                        className={cn(
                            'group focus-visible:ring-ring overflow-hidden rounded-lg border text-left transition-all focus-visible:ring-2 focus-visible:outline-none',
                            selected ? 'border-primary ring-primary ring-1' : 'hover:border-foreground/30',
                        )}
                    >
                        <div className="relative aspect-[2/1] border-b">
                            {value === 'system' ? (
                                <div className="flex h-full">
                                    <div className="w-1/2 overflow-hidden">
                                        <div className="h-full w-[200%]">
                                            <Preview dark={false} />
                                        </div>
                                    </div>
                                    <div className="w-1/2 overflow-hidden">
                                        <div className="-ml-[100%] h-full w-[200%]">
                                            <Preview dark />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Preview dark={value === 'dark'} />
                            )}
                            {selected && (
                                <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex size-5 items-center justify-center rounded-full shadow">
                                    <Check className="size-3" strokeWidth={3} />
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2.5">
                            <Icon className={cn('size-4', selected ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{label}</span>
                                <span className="text-muted-foreground block text-xs">{hint}</span>
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

export default function Appearance() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Appearance settings" />

            <SettingsLayout>
                <SettingsSection icon={Palette} title="Theme" description="Choose how the app looks. Saved for this browser.">
                    <ThemePicker />
                </SettingsSection>

                <SettingsSection
                    icon={LayoutPanelLeft}
                    title="Layout"
                    description="How the menu and pages are laid out on this browser."
                    contentClassName="grid gap-6 lg:grid-cols-2"
                >
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Navigation</p>
                        <LayoutToggle />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Content width</p>
                        <ContentWidthToggle />
                    </div>
                </SettingsSection>
            </SettingsLayout>
        </AppLayout>
    );
}
