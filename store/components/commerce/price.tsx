"use client";

import type { SizeOption } from "@/types";
import { formatCurrency, priceFor } from "@/lib/currency";
import { useCurrency } from "@/lib/hooks/use-region";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/** Unit price in the visitor's currency: "9.500 BHD" / "95.00 AED". */
export function Price({ size, qty = 1, className }: { size: Pick<SizeOption, "price">; qty?: number; className?: string }) {
  const currency = useCurrency();
  const { locale } = useI18n();
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>
      {formatCurrency(priceFor(size, currency) * qty, currency, locale)}
    </span>
  );
}

/** Formats a precomputed amount in the visitor's currency. */
export function Amount({ value, className }: { value: number; className?: string }) {
  const currency = useCurrency();
  const { locale } = useI18n();
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>
      {formatCurrency(value, currency, locale)}
    </span>
  );
}
