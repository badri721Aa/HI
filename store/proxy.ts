import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import type { Locale } from "@/types";

const GEO_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Highest quality value the Accept-Language header gives each language we
 * serve, e.g. "ar-BH,ar;q=0.9,en;q=0.8" → { ar: 1, en: 0.8 }. Tags with q=0
 * ("not acceptable") and the "*" wildcard are ignored.
 */
export function languageWeights(header: string | null): Record<Locale, number> {
  const weights: Record<Locale, number> = { en: 0, ar: 0 };
  if (!header) return weights;
  for (const part of header.split(",")) {
    const [tag, ...params] = part.trim().split(";");
    const primary = tag.trim().toLowerCase().split("-")[0];
    if (!isLocale(primary)) continue;
    let q = 1;
    for (const param of params) {
      const [key, value] = param.trim().split("=");
      if (key?.trim().toLowerCase() === "q") {
        const parsed = Number.parseFloat(value ?? "");
        q = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 1;
      }
    }
    weights[primary] = Math.max(weights[primary], q);
  }
  return weights;
}

/** The "lang" cookie (set by the language switch) wins, then the browser languages. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const { ar, en } = languageWeights(acceptLanguage);
  return ar > 0 && ar >= en ? "ar" : DEFAULT_LOCALE;
}

/** Sends "/" to "/en" or "/ar", keeping the query string, and remembers the visitor's country. */
export function proxy(request: NextRequest) {
  const locale = pickLocale(request.cookies.get("lang")?.value, request.headers.get("accept-language"));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}`;
  const response = NextResponse.redirect(url, 307);

  // Vercel's edge geo header; absent locally. The client reads this cookie to
  // preselect Bahrain or the UAE, so it is not httpOnly.
  const country = request.headers.get("x-vercel-ip-country")?.toUpperCase();
  if (country && /^[A-Z]{2}$/.test(country)) {
    response.cookies.set("geo_country", country, {
      path: "/",
      maxAge: GEO_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: url.protocol === "https:",
    });
  }

  response.headers.set("Vary", "Accept-Language, Cookie");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/"] };
