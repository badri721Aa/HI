"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { MotionStyles, useViewTrigger } from "@/components/motion/shared";
import { cn } from "@/lib/utils";

/** Stagger slot for the header's blur-in reveal (80ms apart). */
const step = (i: number) => ({ "--lu-i": i }) as CSSProperties;

/**
 * "01 — Collection" label, display title and optional lede, revealed once
 * part by part (blur, rise and fade, 80ms apart) as the header scrolls into
 * view. `aside` sits bottom-aligned in the end columns on large screens and
 * below the rest on smaller ones.
 */
export function SectionHeader({
  index,
  eyebrow,
  title,
  body,
  aside,
  className,
  children,
  id,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  /** Secondary content beside the title on large screens (a lede, a status, a count). */
  aside?: ReactNode;
  className?: string;
  children?: ReactNode;
  /** id for the <h2>, so sections can use aria-labelledby. */
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewTrigger(ref);

  const main = (
    <>
      <p className="lu-part eyebrow flex items-center gap-3" style={step(0)}>
        <span className="text-glow tabular">{index}</span>
        <span aria-hidden className="h-px w-8 bg-line-strong" />
        <span>{eyebrow}</span>
      </p>
      <h2
        id={id}
        className="lu-part mt-5 text-[clamp(2.125rem,4.6vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg"
        style={step(1)}
      >
        {title}
      </h2>
      {body ? (
        <p className="lu-part mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-fg-muted" style={step(2)}>
          {body}
        </p>
      ) : null}
      {children ? (
        <div className="lu-part" style={step(body ? 3 : 2)}>
          {children}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <MotionStyles />
      {aside ? (
        <div ref={ref} className={cn("grid gap-y-8 lg:grid-cols-12 lg:items-end lg:gap-x-6", className)}>
          <div className="max-w-3xl lg:col-span-7">{main}</div>
          <div className="lu-part lg:col-span-4 lg:col-start-9" style={step(body ? 3 : 2)}>
            {aside}
          </div>
        </div>
      ) : (
        <div ref={ref} className={cn("max-w-3xl", className)}>
          {main}
        </div>
      )}
    </>
  );
}
