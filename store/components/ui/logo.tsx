import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Mark: a rounded square with diagonal hatching, the way a slicer fills the
 * inside of a part. The hatch drifts and lights up on hover.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("size-6", className)}>
      <defs>
        <clipPath id="logo-clip">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
        </clipPath>
        <linearGradient id="logo-hatch" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-silver)" />
          <stop offset="1" stopColor="var(--color-platinum)" />
        </linearGradient>
      </defs>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" stroke="currentColor" strokeWidth="1.5" />
      <g clipPath="url(#logo-clip)">
        <g className="transition-transform duration-500 ease-out group-hover:translate-x-[3px] motion-reduce:transition-none">
          {[-12, -6, 0, 6, 12, 18].map((o) => (
            <path
              key={o}
              d={`M${o} 24 L${o + 24} 0`}
              stroke="url(#logo-hatch)"
              strokeWidth="1.25"
              className="transition-[stroke] duration-500 group-hover:[stroke:var(--color-glow)]"
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("group inline-flex items-center gap-2 text-fg", className)} dir="ltr">
      <LogoMark />
      <span className="text-[1.0625rem] font-semibold lowercase tracking-[-0.03em]">{site.name}</span>
    </span>
  );
}
