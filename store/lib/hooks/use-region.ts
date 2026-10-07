"use client";

import type { Currency, Region } from "@/types";
import { selectRegion, usePrefs } from "@/lib/store/prefs";
import { currencyForRegion } from "@/lib/currency";

/** Active sales region (Bahrain until the visitor picks or geo detection answers). */
export function useRegion(): Region {
  return usePrefs(selectRegion);
}

export function useCurrency(): Currency {
  return currencyForRegion(useRegion());
}
