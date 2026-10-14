import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Animated placeholder avatar (inline SVG, no network).
 * The look is pseudo-random but stable per `seed`, so a person keeps the same
 * character across renders. Motion is disabled under prefers-reduced-motion.
 */

const BACKGROUNDS = [
    ['#fde68a', '#f59e0b'],
    ['#bfdbfe', '#3b82f6'],
    ['#bbf7d0', '#10b981'],
    ['#fbcfe8', '#ec4899'],
    ['#ddd6fe', '#8b5cf6'],
    ['#fed7aa', '#f97316'],
    ['#a5f3fc', '#06b6d4'],
    ['#fecaca', '#ef4444'],
];
const SKIN = ['#f9d7b5', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
const HAIR = ['#2b1b0e', '#4a2c17', '#111827', '#7c4a1e', '#a16207', '#6b7280'];
const SHIRT = ['#1e3a8a', '#065f46', '#7c2d12', '#581c87', '#0f172a', '#9f1239'];

function hash(input: string) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Small deterministic PRNG so each trait draws a different number from one seed. */
function rng(seed: string) {
    let s = hash(seed) || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

const pick = <T,>(list: T[], r: () => number) => list[Math.floor(r() * list.length)];

const STYLES = `
.aav-bob{animation:aav-bob 3.2s ease-in-out infinite;animation-delay:var(--aav-delay)}
.aav-eye{transform-box:fill-box;transform-origin:center;animation:aav-blink 4.6s infinite;animation-delay:var(--aav-delay)}
.aav-bg{transform-box:view-box;transform-origin:center;animation:aav-spin 14s linear infinite}
.aav-wave{transform-box:fill-box;transform-origin:20% 90%;animation:aav-wave 2.8s ease-in-out infinite;animation-delay:var(--aav-delay)}
@keyframes aav-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}
@keyframes aav-blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
@keyframes aav-spin{to{transform:rotate(360deg)}}
@keyframes aav-wave{0%,60%,100%{transform:rotate(0)}70%{transform:rotate(-14deg)}80%{transform:rotate(10deg)}90%{transform:rotate(-8deg)}}
@media (prefers-reduced-motion:reduce){.aav-bob,.aav-eye,.aav-bg,.aav-wave{animation:none}}
`;

type Props = {
    seed: string;
    className?: string;
    title?: string;
};

export function AnimatedAvatar({ seed, className, title }: Props) {
    const uid = React.useId().replace(/:/g, '');
    const traits = React.useMemo(() => {
        const r = rng(seed || 'anonymous');
        return {
            bg: pick(BACKGROUNDS, r),
            skin: pick(SKIN, r),
            hair: pick(HAIR, r),
            shirt: pick(SHIRT, r),
            hairStyle: Math.floor(r() * 4),
            mouth: Math.floor(r() * 3),
            glasses: r() < 0.45,
            cheeks: r() < 0.6,
            wave: r() < 0.25,
            delay: `${(r() * 3).toFixed(2)}s`,
        };
    }, [seed]);

    const { bg, skin, hair, shirt, hairStyle, mouth, glasses, cheeks, wave, delay } = traits;

    return (
        <svg
            viewBox="0 0 64 64"
            className={cn('size-full', className)}
            role="img"
            aria-label={title ?? 'Placeholder avatar'}
            style={{ '--aav-delay': delay } as React.CSSProperties}
        >
            <style>{STYLES}</style>
            <defs>
                <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={bg[0]} />
                    <stop offset="1" stopColor={bg[1]} />
                </linearGradient>
                <clipPath id={`c${uid}`}>
                    <rect width="64" height="64" />
                </clipPath>
            </defs>

            <g clipPath={`url(#c${uid})`}>
                {/* Oversized rotating gradient so corners never show while spinning */}
                <rect className="aav-bg" x="-16" y="-16" width="96" height="96" fill={`url(#g${uid})`} />
                <circle cx="52" cy="12" r="6" fill="#fff" opacity=".18" />
                <circle cx="10" cy="50" r="9" fill="#fff" opacity=".12" />

                <g className="aav-bob">
                    {/* Shoulders */}
                    <path d="M10 66c0-12 9.8-20 22-20s22 8 22 20z" fill={shirt} />
                    <path d="M27 46.5 32 53l5-6.5" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
                    {/* Neck */}
                    <rect x="28" y="38" width="8" height="9" rx="3" fill={skin} />
                    <rect x="28" y="38" width="8" height="4" fill="#000" opacity=".08" />
                    {/* Head */}
                    <circle cx="32" cy="27" r="13" fill={skin} />
                    {/* Hair */}
                    {hairStyle === 0 && <path d="M19 26c0-9 6-14 13-14s13 5 13 14c-3-4-7-6-13-6s-10 2-13 6z" fill={hair} />}
                    {hairStyle === 1 && (
                        <path d="M18.5 30c-1-11 5-17.5 13.5-17.5S46.5 19 45.5 30c-1-6-3-8-5-9-3 2-9 3-17 1-2 2-4 4-5 8z" fill={hair} />
                    )}
                    {hairStyle === 2 && (
                        <>
                            <path d="M18 30c-2-11 5-18 14-18s16 7 14 18l-2 10c0-8-1-14-3-17-4 2-14 2-18 0-2 3-3 9-3 17z" fill={hair} />
                        </>
                    )}
                    {hairStyle === 3 && (
                        <>
                            <path d="M20 22c2-7 7-10 12-10s10 3 12 10c-4-2-8-3-12-3s-8 1-12 3z" fill={hair} />
                            <circle cx="32" cy="11" r="4" fill={hair} />
                        </>
                    )}
                    {/* Eyes */}
                    <ellipse className="aav-eye" cx="27" cy="28" rx="1.6" ry="2" fill="#1f2937" />
                    <ellipse className="aav-eye" cx="37" cy="28" rx="1.6" ry="2" fill="#1f2937" />
                    {glasses && (
                        <g fill="none" stroke="#111827" strokeWidth="1.3">
                            <circle cx="27" cy="28" r="4" fill="#fff" fillOpacity=".15" />
                            <circle cx="37" cy="28" r="4" fill="#fff" fillOpacity=".15" />
                            <path d="M31 28h2M23 27.5l-3.5-1M41 27.5l3.5-1" />
                        </g>
                    )}
                    {cheeks && (
                        <>
                            <circle cx="23.5" cy="33" r="2" fill="#f43f5e" opacity=".22" />
                            <circle cx="40.5" cy="33" r="2" fill="#f43f5e" opacity=".22" />
                        </>
                    )}
                    {/* Mouth */}
                    {mouth === 0 && <path d="M28 34q4 3.5 8 0" fill="none" stroke="#7f1d1d" strokeWidth="1.4" strokeLinecap="round" />}
                    {mouth === 1 && <path d="M28.5 33.5q3.5 4.5 7 0z" fill="#7f1d1d" />}
                    {mouth === 2 && <path d="M29.5 34.5h5" stroke="#7f1d1d" strokeWidth="1.4" strokeLinecap="round" />}
                </g>

                {wave && (
                    <g className="aav-wave">
                        <path d="M50 64V50" stroke={shirt} strokeWidth="5" strokeLinecap="round" />
                        <circle cx="50" cy="47" r="3.2" fill={skin} />
                    </g>
                )}
            </g>
        </svg>
    );
}
