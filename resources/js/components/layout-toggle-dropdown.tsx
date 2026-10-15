import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppLayout, useContentWidth, type AppLayoutMode, type ContentWidth } from '@/hooks/use-app-layout';
import { cn } from '@/lib/utils';
import { Check, LayoutTemplate, PanelLeft, SquareDashed, StretchHorizontal } from 'lucide-react';
import type { HTMLAttributes } from 'react';

const layoutOptions: { value: AppLayoutMode; icon: typeof PanelLeft; label: string }[] = [
    { value: 'sidebar', icon: PanelLeft, label: 'Sidebar' },
    { value: 'navbar', icon: LayoutTemplate, label: 'Navbar' },
];

const widthOptions: { value: ContentWidth; icon: typeof PanelLeft; label: string }[] = [
    { value: 'contained', icon: SquareDashed, label: 'Contained' },
    { value: 'fluid', icon: StretchHorizontal, label: 'Full width' },
];

/** Compact header control for display preferences: navigation layout and content width. */
export default function LayoutToggleDropdown({
    className = '',
    buttonClassName = '',
    ...props
}: HTMLAttributes<HTMLDivElement> & { buttonClassName?: string }) {
    const { layout, updateLayout } = useAppLayout();
    const { contentWidth, updateContentWidth } = useContentWidth();
    const CurrentIcon = layout === 'navbar' ? LayoutTemplate : PanelLeft;

    return (
        <div className={className} {...props}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className={cn('h-9 w-9 shrink-0', buttonClassName)} title="Layout options">
                        <CurrentIcon className="h-[18px] w-[18px]" />
                        <span className="sr-only">Layout options</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[60] w-52">
                    <DropdownMenuLabel className="text-muted-foreground text-xs">Navigation</DropdownMenuLabel>
                    {layoutOptions.map(({ value, icon: Icon, label }) => (
                        <DropdownMenuItem key={value} onClick={() => updateLayout(value)}>
                            <Icon className="h-4 w-4" />
                            {label}
                            <Check className={cn('ml-auto h-4 w-4', layout === value ? 'opacity-100' : 'opacity-0')} />
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-muted-foreground text-xs">Content width</DropdownMenuLabel>
                    {widthOptions.map(({ value, icon: Icon, label }) => (
                        <DropdownMenuItem key={value} onClick={() => updateContentWidth(value)}>
                            <Icon className="h-4 w-4" />
                            {label}
                            <Check className={cn('ml-auto h-4 w-4', contentWidth === value ? 'opacity-100' : 'opacity-0')} />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
