"use client";
// STUB — owned by the shell/motion builder.
import type { HTMLAttributes, ReactNode } from "react";

export function Spotlight({ children, ...props }: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
