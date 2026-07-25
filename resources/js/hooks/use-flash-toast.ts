import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { toast } from '@/lib/toast';
import type { SharedData } from '@/types';

export function useFlashToast(): void {
    const page = usePage<SharedData>();
    const flash = page.props.flash;
    const shownRef = useRef<string | null>(null);

    useEffect(() => {
        if (!flash) return;
        const key = `${flash.status ?? ''}|${flash.error ?? ''}`;
        if (!key || key === '|') return;
        if (shownRef.current === key) return;
        shownRef.current = key;
        if (flash.status) toast.success(flash.status);
        if (flash.error) toast.error(flash.error);
    }, [flash?.status, flash?.error]);
}
