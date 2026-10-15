import { useAppLayout, useContentWidth } from '@/hooks/use-app-layout';
import { cn } from '@/lib/utils';
import { LayoutTemplate, PanelLeft, SquareDashed, StretchHorizontal, type LucideIcon } from 'lucide-react';

type Option<T extends string> = { value: T; icon: LucideIcon; label: string; description: string };

function OptionCards<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {options.map(({ value: optionValue, icon: Icon, label, description }) => {
                const selected = value === optionValue;

                return (
                    <button
                        key={optionValue}
                        type="button"
                        onClick={() => onChange(optionValue)}
                        aria-pressed={selected}
                        className={cn(
                            'flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                            selected ? 'border-primary/40 bg-primary/5 ring-primary/20 ring-1' : 'border-border bg-card hover:bg-muted/40',
                        )}
                    >
                        <span
                            className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                                selected ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground',
                            )}
                        >
                            <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                            <span className="text-foreground block text-sm font-medium">{label}</span>
                            <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">{description}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** Navigation layout picker for the Appearance settings page. */
export default function LayoutToggle() {
    const { layout, updateLayout } = useAppLayout();

    return (
        <OptionCards
            value={layout}
            onChange={updateLayout}
            options={[
                { value: 'sidebar', icon: PanelLeft, label: 'Sidebar', description: 'Vertical navigation with a collapsible sidebar' },
                { value: 'navbar', icon: LayoutTemplate, label: 'Navbar', description: 'Horizontal top navigation with dropdown menus' },
            ]}
        />
    );
}

/** Content width picker for the Appearance settings page. */
export function ContentWidthToggle() {
    const { contentWidth, updateContentWidth } = useContentWidth();

    return (
        <OptionCards
            value={contentWidth}
            onChange={updateContentWidth}
            options={[
                { value: 'contained', icon: SquareDashed, label: 'Contained', description: 'Pages centred at a comfortable reading width' },
                { value: 'fluid', icon: StretchHorizontal, label: 'Full width', description: 'Pages stretch edge to edge — best for wide tables' },
            ]}
        />
    );
}
