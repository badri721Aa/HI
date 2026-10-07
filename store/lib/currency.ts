import type { Currency, L10n, Locale, Region, SizeOption } from "@/types";
import { AED_PER_BHD, REGION_CONFIG } from "@/lib/site";

export const CURRENCY_DECIMALS: Record<Currency, number> = { BHD: 3, AED: 2 };

export const CURRENCY_LABEL: Record<Currency, L10n> = {
  BHD: { en: "BHD", ar: "د.ب" },
  AED: { en: "AED", ar: "د.إ" },
};

export function currencyForRegion(region: Region): Currency {
  return REGION_CONFIG[region].currency;
}

/** Converts to integer minor units (fils) so totals never drift. */
export function toMinor(amount: number, currency: Currency): number {
  return Math.round(amount * 10 ** CURRENCY_DECIMALS[currency]);
}

export function fromMinor(minor: number, currency: Currency): number {
  return minor / 10 ** CURRENCY_DECIMALS[currency];
}

/** "1,250.500" for BHD, "95.00" for AED. Always Latin digits. */
export function formatAmount(amount: number, currency: Currency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(fromMinor(toMinor(amount, currency), currency));
}

/** "9.500 BHD" in English, "9.500 د.ب" in Arabic. */
export function formatCurrency(amount: number, currency: Currency, locale: Locale = "en"): string {
  return `${formatAmount(amount, currency)} ${CURRENCY_LABEL[currency][locale]}`;
}

/**
 * Unit price for a size in a currency. Uses the explicit catalog price when
 * present, otherwise converts at the fixed peg and rounds up to a clean
 * price point (nearest 0.500 BHD or 5 AED).
 */
export function priceFor(size: Pick<SizeOption, "price">, currency: Currency): number {
  const explicit = size.price[currency];
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  if (currency === "AED") return Math.ceil((size.price.BHD * AED_PER_BHD) / 5) * 5;
  return Math.ceil((size.price.AED / AED_PER_BHD) * 2) / 2;
}
