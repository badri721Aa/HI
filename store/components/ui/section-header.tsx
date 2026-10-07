import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** "01 — Collection" label, display title and optional lede. */
export function SectionHeader({
  index,
  eyebrow,
  title,
  body,
  className,
  children,
  id,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  className?: string;
  children?: ReactNode;
  /** id for the <h2>, so sections can use aria-labelledby. */
  id?: string;
}) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <p className="eyebrow flex items-center gap-3">
        <span className="text-glow tabular">{index}</span>
        <span aria-hidden className="h-px w-8 bg-line-strong" />
        <span>{eyebrow}</span>
      </p>
      <h2
        id={id}
        className="mt-5 text-[clamp(2.125rem,4.6vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg"
      >
        {title}
      </h2>
      {body ? <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-fg-muted">{body}</p> : null}
      {children}
    </div>
  );
}
