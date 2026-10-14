import * as React from 'react';
import { AnimatedAvatar } from '@/components/animated-avatar';
import { cn } from '@/lib/utils';

type Props = {
    /** Uploaded photo URL; falls back to the animated placeholder when empty or broken. */
    src?: string | null;
    /** Stable key for the placeholder look (e.g. employee code). */
    seed: string;
    name?: string;
    className?: string;
};

export function PersonAvatar({ src, seed, name, className }: Props) {
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => setFailed(false), [src]);

    return (
        <div className={cn('flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted', className)}>
            {src && !failed ? (
                <img src={src} alt={name ?? ''} className="size-full object-cover" onError={() => setFailed(true)} />
            ) : (
                <AnimatedAvatar seed={seed} title={name ? `${name} (no photo)` : undefined} />
            )}
        </div>
    );
}
