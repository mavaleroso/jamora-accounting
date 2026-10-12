import type { ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export default function AlJamoraLogoIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    return (
        <img
            src="/assets/img/logos/al_jamora_logo.png"
            alt="A.L. Jamora Logo"
            {...props}
            className={cn('size-full object-contain', className)}
        />
    );
}
