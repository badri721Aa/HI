import type { L10n } from "@/types";

/**
 * Customer reviews shown in the "From customers" section on the home page.
 *
 * Add only real customer reviews, with their permission. Never invent or
 * paraphrase a review. While this list is empty the section does not render,
 * and the FAQ section number moves up so the numbering stays sequential.
 *
 * Example entry:
 * {
 *   name: "Fatima A.",
 *   city: "Muharraq",
 *   region: "BH",
 *   product: "ripple-vase",
 *   quote: { en: "…their words…", ar: "…كلماتهم…" },
 * }
 */
export interface Review {
  /** First name plus initial is enough. */
  name: string;
  /** City or area, as the customer wrote it. */
  city: string;
  region: "BH" | "AE";
  /** Product slug from content/catalog.ts (shown as the product name), or free text. */
  product?: string;
  /** The review in both languages. Translate faithfully; do not embellish. */
  quote: L10n;
}

export const REVIEWS: Review[] = [];

/** True once there is at least one review; drives section visibility and numbering. */
export const hasReviews: boolean = REVIEWS.length > 0;
