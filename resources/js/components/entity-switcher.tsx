import { router, usePage } from '@inertiajs/react';
import { Building2, ChevronsUpDown } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { APP_BRAND, resolveEntityVisual } from '@/lib/entities';
import { cn } from '@/lib/utils';
import type { SharedData } from '@/types';

type EntityOption = {
    id: number;
    code: string;
    name: string;
};

type EntitySwitcherProps = {
    variant?: 'sidebar' | 'header';
    className?: string;
};

export function EntitySwitcher({ variant = 'sidebar', className }: EntitySwitcherProps) {
    const { entity } = usePage<SharedData>().props;
    const current = entity?.current as EntityOption | null | undefined;
    const available = (entity?.available as EntityOption[] | undefined) ?? [];

    if (!current || available.length === 0) {
        return null;
    }

    const currentVisual = resolveEntityVisual(current.code, current.name);
    const BrandLogo = APP_BRAND.logo;

    const switchEntity = (entityId: number) => {
        if (entityId === current.id) {
            return;
        }
        router.post('/entities/switch', { entity_id: entityId }, { preserveScroll: true });
    };

    if (variant === 'header') {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                            'h-10 gap-2 rounded-lg bg-primary/10 px-2 text-foreground hover:bg-primary/15 hover:text-foreground data-[state=open]:bg-primary/15',
                            className,
                        )}
                    >
                        <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md p-0.5">
                            <BrandLogo className="size-full" />
                        </div>
                        <div className="hidden min-w-0 text-left leading-tight sm:grid">
                            <span className="truncate text-sm font-semibold">{APP_BRAND.name}</span>
                            <span className="truncate text-[11px] text-muted-foreground">{current.name}</span>
                        </div>
                        <ChevronsUpDown className="size-4 shrink-0 opacity-70" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="z-[60] min-w-56 rounded-lg" align="end" sideOffset={6}>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Switch entity books
                    </DropdownMenuLabel>
                    {available.map((item) => {
                        const visual = resolveEntityVisual(item.code, item.name);
                        const isActive = item.id === current.id;

                        return (
                            <DropdownMenuItem
                                key={item.id}
                                onClick={() => switchEntity(item.id)}
                                className="gap-2 p-2"
                            >
                                <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 p-0.5">
                                    <Building2 className="size-3.5 text-muted-foreground" />
                                </div>
                                <div className="grid min-w-0 flex-1 text-left leading-tight">
                                    <span className="truncate text-sm font-medium">{item.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">{visual.plan}</span>
                                </div>
                                {isActive ? (
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                        Active
                                    </span>
                                ) : null}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className={cn(
                                'cursor-pointer bg-primary/15 text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
                                className,
                            )}
                        >
                            <div className="flex aspect-square size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg p-0.5">
                                <BrandLogo className="size-full" />
                            </div>
                            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{APP_BRAND.name}</span>
                                <span className="truncate text-xs">{current.name}</span>
                            </div>
                            <ChevronsUpDown className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        align="start"
                        side="right"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Switch entity books
                        </DropdownMenuLabel>
                        {available.map((item) => {
                            const visual = resolveEntityVisual(item.code, item.name);
                            const isActive = item.id === current.id;

                            return (
                                <DropdownMenuItem
                                    key={item.id}
                                    onClick={() => switchEntity(item.id)}
                                    className="gap-2 p-2"
                                >
                                    <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 p-0.5">
                                        <Building2 className="size-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="grid min-w-0 flex-1 text-left leading-tight">
                                        <span className="truncate text-sm font-medium">{item.name}</span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {visual.plan}
                                        </span>
                                    </div>
                                    {isActive ? (
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                            Active
                                        </span>
                                    ) : null}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
