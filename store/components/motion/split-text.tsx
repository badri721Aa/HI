"use client";
// STUB — owned by the shell/motion builder.
export function SplitText({ text, className }: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: "h1" | "h2" | "h3" | "p" | "span";
}) {
  return <span className={className}>{text}</span>;
}
