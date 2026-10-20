import { AppNavbarMobileNav, AppNavbarNav } from '@/components/app-navbar-nav';
import { isEntityScopedPath } from '@/components/app-sidebar-header';
import { AppearanceToggle } from '@/components/appearance-toggle';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { EntitySwitcher } from '@/components/entity-switcher';
import LayoutToggleDropdown from '@/components/layout-toggle-dropdown';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { UserInfo } from '@/components/user-info';
import { UserMenuContent } from '@/components/user-menu-content';
import { ViewModeSwitch } from '@/components/view-mode-switch';
import { useContentWidth } from '@/hooks/use-app-layout';
import { shellContainerClass } from '@/lib/app-shell-layout';
import { APP_BRAND } from '@/lib/entities';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Menu } from 'lucide-react';
import { useState } from 'react';

type Props = { breadcrumbs?: BreadcrumbItem[] };

function Brand() {
    return (
        <Link href="/" className="flex shrink-0 items-center gap-2">
            <APP_BRAND.logo className="size-8 shrink-0" />
            <span className="text-sm font-semibold tracking-wide whitespace-nowrap uppercase">{APP_BRAND.name}</span>
        </Link>
    );
}

/**
 * Navbar layout header: a navy bar with the brand, module menus and the user menu, over a light bar with
 * breadcrumbs, the entity switcher and the appearance/layout toggles.
 */
export function AppHeader({ breadcrumbs = [] }: Props) {
    const { auth } = usePage<SharedData>().props;
    const { url } = usePage();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const { contentWidth } = useContentWidth();
    const container = shellContainerClass(contentWidth);

    if (!auth.user) return null;

    const firstName = auth.user.name?.trim().split(/\s+/)[0];

    return (
        <header className="sticky top-0 z-50 print:hidden">
            <div className="border-sidebar-border bg-sidebar text-sidebar-foreground border-b">
                <div className={cn(container, 'flex h-14 items-center gap-3 md:gap-4')}>
                    <div className="lg:hidden">
                        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 w-9"
                                >
                                    <Menu className="h-5 w-5" />
                                    <span className="sr-only">Open menu</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent
                                side="left"
                                className="border-sidebar-border bg-sidebar text-sidebar-foreground flex w-72 flex-col gap-0 p-0"
                            >
                                <SheetTitle className="sr-only">Navigation</SheetTitle>
                                <SheetHeader className="border-sidebar-border border-b p-4 text-left">
                                    <Brand />
                                </SheetHeader>
                                <AppNavbarMobileNav onNavigate={() => setMobileNavOpen(false)} />
                            </SheetContent>
                        </Sheet>
                    </div>

                    <Brand />
                    <div className="bg-sidebar-border hidden h-6 w-px lg:block" aria-hidden />

                    <AppNavbarNav />

                    <div className="ml-auto flex shrink-0 items-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-10 max-w-[220px] gap-2 rounded-lg px-2"
                                >
                                    <UserInfo user={auth.user} detailsClassName="hidden min-w-0 xl:grid" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="z-[60] w-56" align="end">
                                <UserMenuContent user={auth.user} />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            <div className="bg-card text-foreground border-b shadow-xs">
                <div className={cn(container, 'flex h-12 items-center gap-2')}>
                    <div className="min-w-0 flex-1">
                        {breadcrumbs.length > 0 ? (
                            <Breadcrumbs breadcrumbs={breadcrumbs} />
                        ) : (
                            firstName && (
                                <p className="text-muted-foreground truncate text-sm">
                                    Welcome, <span className="text-foreground font-medium">{firstName}</span>
                                </p>
                            )
                        )}
                    </div>
                    {isEntityScopedPath(url) && <EntitySwitcher variant="header" />}
                    <ViewModeSwitch />
                    <AppearanceToggle />
                    <LayoutToggleDropdown />
                </div>
            </div>
        </header>
    );
}
