"use client";
// STUB — owned by the shell/motion builder.
import type { ReactNode } from "react";

export function Magnetic({ children, className }: { children: ReactNode; strength?: number; className?: string }) {
  return <span className={className}>{children}</span>;
}
