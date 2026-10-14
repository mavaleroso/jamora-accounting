import * as React from 'react';
import { AnimatedAvatar } from '@/components/animated-avatar';
import { cn } from '@/lib/utils';
import { fullName, type Employee } from '../lib';

type Props = {
    employee: Pick<Employee, 'firstname' | 'lastname'> & {
        id?: number;
        employee_code?: string;
        avatar_url?: string | null;
    };
    /** Overrides the stored photo, e.g. a local preview of a newly picked file. */
    src?: string | null;
    className?: string;
};

export function EmployeeAvatar({ employee, src, className }: Props) {
    const url = src !== undefined ? src : employee.avatar_url;
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => setFailed(false), [url]);

    // Stable per employee so the placeholder character never changes between renders.
    const seed = employee.employee_code || (employee.id ? `id-${employee.id}` : `${employee.firstname} ${employee.lastname}`);

    return (
        <div
            className={cn(
                'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold',
                className,
            )}
        >
            {url && !failed ? (
                <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
            ) : (
                <AnimatedAvatar seed={seed} title={`${fullName(employee)} (no photo)`} />
            )}
        </div>
    );
}
