import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * A status code caught mid-print: the lower layers solid, with visible layer
 * lines; the rest still an outline; one cyan hot layer between them. Pure CSS
 * and server-safe, so it also works in global-error and global-not-found.
 */
export function PrintedCode({
  code,
  progress = 0.56,
  className,
}: {
  code: string;
  /** Fraction of the glyph height already printed (0–1). */
  progress?: number;
  className?: string;
}) {
  const cut = `${Math.round((1 - progress) * 1000) / 10}%`;
  return (
    <span
      aria-hidden="true"
      dir="ltr"
      className={cn(
        "relative inline-block select-none font-mono font-medium tracking-[-0.06em] tabular",
        className,
      )}
      // Inline so a font-size class passed in (which resets line-height in tailwind-merge) can't undo it.
      style={{ lineHeight: 0.8 }}
    >
      {/* Unprinted: the toolpath outline. */}
      <span className="block text-transparent [-webkit-text-stroke:1px_var(--color-line-strong)]">{code}</span>
      {/* Printed: silver with layer lines, revealed from the bottom up to the cut. */}
      <span
        className="absolute inset-0 block bg-[repeating-linear-gradient(to_bottom,var(--color-silver)_0_3px,var(--color-platinum)_3px_4px)] bg-clip-text text-transparent [-webkit-background-clip:text] [clip-path:inset(var(--cut)_0_0_0)]"
        style={{ "--cut": cut } as CSSProperties}
      >
        {code}
      </span>
      {/* The hot layer. */}
      <span
        className="absolute -inset-x-3 h-px bg-glow shadow-[0_0_10px_rgb(125_227_238/0.7)]"
        style={{ top: cut }}
      />
    </span>
  );
}

/** Hairline build-plate grid that fades out towards the edges. Decorative. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10",
        "bg-[linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] bg-size-[56px_56px]",
        "[mask-image:radial-gradient(ellipse_75%_65%_at_50%_42%,black_20%,transparent_78%)]",
        className,
      )}
    />
  );
}
