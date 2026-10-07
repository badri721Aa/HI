import type { Region } from "@/types";

/** Maps an ISO country code (e.g. from x-vercel-ip-country) to a sales region. */
export function countryToRegion(country?: string | null): Region {
  return country?.toUpperCase() === "AE" ? "AE" : "BH";
}
