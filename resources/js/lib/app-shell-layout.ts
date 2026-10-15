import type { ContentWidth } from '@/hooks/use-app-layout';

/** Max width of page content (and the navbar rows, so they line up) for each content-width mode. */
export function shellWidthClass(width: ContentWidth): string {
    return width === 'contained' ? 'mx-auto w-full max-w-[1440px]' : 'w-full';
}

/** Header rows add their own gutter; page content brings its own padding (PageBody). */
export function shellContainerClass(width: ContentWidth): string {
    return `${shellWidthClass(width)} px-4 md:px-6`;
}
