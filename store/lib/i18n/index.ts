import type { Locale } from "@/types";
import { common } from "./messages/common";
import { home } from "./messages/home";
import { commerce } from "./messages/commerce";
import { siteCopy } from "./messages/site";

export * from "./config";

/**
 * All UI copy for one locale. Small enough to ship to the client, so client
 * components read it through useI18n() instead of prop-drilling strings.
 */
export function getDictionary(locale: Locale) {
  return {
    common: common[locale],
    home: home[locale],
    commerce: commerce[locale],
    site: siteCopy[locale],
  };
}

export type Dictionary = ReturnType<typeof getDictionary>;
