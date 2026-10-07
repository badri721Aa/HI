"use client";
// STUB — owned by the shell/motion builder.
import type { ReactNode } from "react";

export function Tilt({ children, className }: { children: ReactNode; max?: number; className?: string }) {
  return <div className={className}>{children}</div>;
}
