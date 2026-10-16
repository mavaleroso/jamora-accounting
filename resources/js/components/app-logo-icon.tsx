import type { ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export default function AppLogoIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    return (
        <img
            src="/assets/img/logos/jamora_bms_logo.svg"
            alt="Jamora BMS"
            {...props}
            className={cn('size-full object-contain', className)}
        />
    );
}
