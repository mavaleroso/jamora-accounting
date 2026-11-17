import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { UserInfo } from '@/components/user-info';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { useViewModeSwitch } from '@/hooks/use-view-mode-switch';
import { logout } from '@/routes';
import { edit } from '@/routes/profile';
import type { SharedData, User } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';

type Props = {
    user: User;
};

export function UserMenuContent({ user }: Props) {
    const cleanup = useMobileNavigation();
    const { auth } = usePage<SharedData>().props;
    const { switchTo, switching } = useViewModeSwitch();
    // Only an Admin who is also an employee has a view to switch.
    const otherView = auth.viewMode ? (auth.viewMode === 'admin' ? 'employee' : 'admin') : null;
    const OtherViewIcon = otherView === 'admin' ? ShieldCheck : UserRound;

    const handleLogout = () => {
        cleanup();
        router.flushAll();
    };

    return (
        <>
            <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <UserInfo user={user} showPosition />
                </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                    <Link className="block w-full cursor-pointer" href={edit()} prefetch onClick={cleanup}>
                        <Settings className="mr-2" />
                        Profile
                    </Link>
                </DropdownMenuItem>
                {otherView && (
                    <DropdownMenuItem
                        className="cursor-pointer"
                        disabled={switching}
                        data-test="view-mode-switch"
                        onSelect={() => {
                            cleanup();
                            switchTo(otherView);
                        }}
                    >
                        <OtherViewIcon className="mr-2" />
                        Switch to {otherView} view
                    </DropdownMenuItem>
                )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <Link className="block w-full cursor-pointer" href={logout()} as="button" onClick={handleLogout} data-test="logout-button">
                    <LogOut className="mr-2" />
                    Log out
                </Link>
            </DropdownMenuItem>
        </>
    );
}
