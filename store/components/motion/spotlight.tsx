"use client";

import { useCallback, useEffect, useRef, type ComponentPropsWithRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A div with a soft cursor-following highlight (the `spotlight` utility)
 * painted behind its content. Pointer coordinates are written to the CSS
 * variables --mx / --my (px, relative to the element) at most once per
 * frame. The highlight fades in on hover only (hover-capable devices).
 * Accepts every other div prop, including `ref`.
 */
export function Spotlight({
  children,
  className,
  onPointerMove,
  ref,
  ...props
}: { children: ReactNode } & ComponentPropsWithRef<"div">) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const point = useRef({ x: 0, y: 0 });

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(e);
    const el = nodeRef.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    point.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      el.style.setProperty("--mx", `${point.current.x.toFixed(1)}px`);
      el.style.setProperty("--my", `${point.current.y.toFixed(1)}px`);
    });
  };

  return (
    <div ref={setRefs} className={cn("group/spotlight relative isolate", className)} onPointerMove={handlePointerMove} {...props}>
      <div
        aria-hidden
        className="spotlight pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-500 ease-out-expo group-hover/spotlight:opacity-100"
      />
      {children}
    </div>
  );
}
