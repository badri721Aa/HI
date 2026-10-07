import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { MARK_BOX, MARK_RADIUS, MARK_STACK, MARK_TOP } from "./logo-geometry";

/**
 * Three printed layers and a fourth arriving in the accent colour. On hover
 * the new layer settles a touch lower and glows, as if it just went down.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`} fill="none" aria-hidden="true" className={cn("size-6", className)}>
      {MARK_STACK.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={MARK_RADIUS}
          fill="currentColor"
          fillOpacity={0.62 + i * 0.19}
        />
      ))}
      <rect
        x={MARK_TOP.x}
        y={MARK_TOP.y}
        width={MARK_TOP.w}
        height={MARK_TOP.h}
        rx={MARK_RADIUS}
        fill="var(--color-glow)"
        className="transition-[transform,filter] duration-500 ease-out group-hover:translate-y-[1.25px] group-hover:[filter:drop-shadow(0_0_2.5px_var(--color-glow))] motion-reduce:transition-none"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("group inline-flex items-center gap-2 text-fg", className)} dir="ltr">
      <LogoMark />
      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">{site.name}</span>
    </span>
  );
}
