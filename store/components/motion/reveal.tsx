"use client";
// STUB — owned by the shell/motion builder. Replace with the real implementation.
import type { ReactNode } from "react";

export function Reveal({ children, className }: {
  children: ReactNode;
  className?: string;
  /** seconds */
  delay?: number;
  /** px to rise from */
  y?: number;
  as?: "div" | "section" | "li" | "span" | "p";
  once?: boolean;
}) {
  return <div className={className}>{children}</div>;
}
