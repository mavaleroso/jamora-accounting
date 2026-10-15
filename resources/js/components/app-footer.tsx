import { APP_BRAND } from '@/lib/entities';
import type { SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Building2Icon } from 'lucide-react';

/** Slim footer under every content page: brand and copyright, plus the entity whose books are open. */
export function AppFooter() {
    const { entity } = usePage<SharedData>().props;
    const year = new Date().getFullYear();

    return (
        <footer className="text-muted-foreground mt-auto border-t px-4 py-3 text-xs md:px-6 print:hidden">
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
                <p>
                    © {year} <span className="text-foreground font-medium">{APP_BRAND.name}</span> · {APP_BRAND.tagline} for the JAM Opticus Group
                </p>
                {entity?.current && (
                    <p className="inline-flex items-center gap-1.5">
                        <Building2Icon className="size-3.5" />
                        Books: <span className="text-foreground font-medium">{entity.current.name}</span>
                    </p>
                )}
            </div>
        </footer>
    );
}
