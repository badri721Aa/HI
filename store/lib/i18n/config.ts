import { LOCALES, type Locale } from "@/types";

export { LOCALES };
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Replaces {name} placeholders: fmt("Only {n} left", { n: 3 }) → "Only 3 left". */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

/** Enforces that the Arabic messages have exactly the same shape as the English ones. */
export function defineMessages<T extends object>(messages: { en: T; ar: NoInfer<T> }) {
  return messages;
}
