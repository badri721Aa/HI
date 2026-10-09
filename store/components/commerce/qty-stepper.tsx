"use client";

import { Minus, Plus } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { MAX_QTY } from "@/lib/whatsapp/order";
import { cn } from "@/lib/utils";

/** − 2 + stepper with 44px targets. */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = MAX_QTY,
  size = "md",
  className,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  className?: string;
  /** Accessible name for the group, e.g. the product name. */
  label?: string;
}) {
  const { t } = useI18n();
  const btn = cn(
    "inline-flex items-center justify-center text-fg-muted transition-colors hover:text-fg disabled:opacity-30 disabled:hover:text-fg-muted",
    // sm looks 36px but keeps a 44px hit area.
    size === "sm" ? "relative size-9 before:absolute before:-inset-1 before:content-['']" : "size-11",
  );
  return (
    <div
      role="group"
      aria-label={label ?? t.commerce.product.quantity}
      className={cn("inline-flex items-center rounded-full border border-line bg-ink-850", className)}
    >
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={t.common.actions.decrease}
      >
        <Minus className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
      <output aria-live="polite" className="min-w-7 text-center font-mono text-sm tabular text-fg">
        {value}
      </output>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={t.common.actions.increase}
      >
        <Plus className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
