import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInitials } from '@/hooks/use-initials';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

export function UserInfo({
    user,
    showPosition = true,
    showRole = true,
    detailsClassName,
}: {
    user: User;
    showPosition?: boolean;
    showRole?: boolean;
    detailsClassName?: string;
}) {
    const getInitials = useInitials();
    const roleLabel = Array.isArray(user.roles) ? user.roles[0] : undefined;

    return (
        <>
            <Avatar className="h-8 w-8 overflow-hidden rounded-lg">
                <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg bg-sidebar-primary/25 text-xs font-medium text-sidebar-primary">
                    {getInitials(user.name)}
                </AvatarFallback>
            </Avatar>
            <div className={cn('grid min-w-0 flex-1 text-left text-sm leading-tight', detailsClassName)}>
                <span className="truncate font-medium">{user.name}</span>
                {showRole && roleLabel ? (
                    <span className="truncate text-xs opacity-70">{roleLabel}</span>
                ) : showPosition && user.position ? (
                    <span className="truncate text-xs opacity-70">{user.position}</span>
                ) : null}
            </div>
        </>
    );
}
