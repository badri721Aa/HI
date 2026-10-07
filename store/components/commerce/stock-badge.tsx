"use client";

import type { Product } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { fmt, type Dictionary } from "@/lib/i18n";
import { stockState, type StockState } from "@/lib/product";
import { cn } from "@/lib/utils";

const DOT: Record<StockState["kind"], string> = {
  ready: "bg-ok",
  low: "bg-warn",
  made: "bg-fg-subtle",
};

/** "3 ready to ship" / "Only 2 left" / "Made to order · 3–5 days" / "Made to order". */
export function stockLabel(state: StockState, t: Dictionary): string {
  const copy = t.common.stock;
  if (state.kind === "ready") return fmt(copy.ready, { n: state.n });
  if (state.kind === "low") return fmt(copy.low, { n: state.n });
  if (state.min != null && state.max != null) return fmt(copy.madeToOrder, { min: state.min, max: state.max });
  return copy.made;
}

/** Availability with a status dot (green ready, amber low, grey made to order). Mono 11px. */
export function StockBadge({ product, className }: { product: Product; className?: string }) {
  const { t } = useI18n();
  const state = stockState(product);
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 font-mono text-[0.6875rem] leading-4 text-fg-muted tabular rtl:text-xs",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[state.kind])} />
      <span className="truncate">{stockLabel(state, t)}</span>
    </span>
  );
}
