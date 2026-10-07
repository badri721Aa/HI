import type { Locale } from "@/types";
import type { Dictionary } from "@/lib/i18n";

/** Every section on the home page, in document order (ids are the in-page anchors). */
export const SECTION_IDS = ["top", "collection", "process", "materials", "custom", "delivery", "reviews", "faq"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

type NavKey = keyof Dictionary["common"]["nav"];

/** Sections that get a link in the header and the mobile menu. */
export const NAV_ITEMS = [
  { id: "collection", key: "collection" },
  { id: "process", key: "process" },
  { id: "materials", key: "materials" },
  { id: "custom", key: "custom" },
  { id: "delivery", key: "delivery" },
  { id: "faq", key: "faq" },
] as const satisfies readonly { id: SectionId; key: NavKey }[];

export type NavItem = (typeof NAV_ITEMS)[number];

/** `/en#collection`. On the home page SmoothScroll turns these into smooth in-page scrolls. */
export function sectionHref(locale: Locale, id: SectionId): string {
  return `/${locale}#${id}`;
}

/** True when `pathname` is the locale's home page (`/en` or `/en/`). */
export function isHomePath(pathname: string | null, locale: Locale): boolean {
  return pathname === `/${locale}` || pathname === `/${locale}/`;
}
