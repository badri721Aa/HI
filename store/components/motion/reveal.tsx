"use client";

import { useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import { MotionStyles, useViewTrigger } from "./shared";

type RevealTag = "div" | "section" | "li" | "span" | "p";

/**
 * Subtle entrance: fades in, rises `y` px and un-blurs (6px → 0) over 0.7s
 * with ease-out-expo, once the element is 10% inside the viewport.
 * Content that is on screen at load animates from the first paint (no wait
 * for hydration); content below the fold waits until it is scrolled to.
 * Reduced motion: rendered in its final state, no transforms.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  as = "div",
  once = true,
  id,
  style,
  ...aria
}: {
  children: ReactNode;
  className?: string;
  /** seconds */
  delay?: number;
  /** px to rise from */
  y?: number;
  as?: RevealTag;
  /** Play only the first time it enters the viewport (default true). */
  once?: boolean;
  id?: string;
  style?: CSSProperties;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useViewTrigger(ref, { once });
  const Tag = as;

  const vars = {
    ...style,
    "--reveal-y": `${y}px`,
    ...(delay ? { animationDelay: `${delay}s` } : null),
  } as CSSProperties;

  return (
    <>
      <MotionStyles />
      <Tag
        // The union of intrinsic tags makes the ref type awkward; every option is an HTMLElement.
        ref={ref as Ref<never>}
        id={id}
        className={cn("lu-reveal", className)}
        style={vars}
        {...aria}
      >
        {children}
      </Tag>
    </>
  );
}
