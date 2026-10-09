import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { NOT_FOUND_SLUG, PRODUCTS } from "@/content/catalog";
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

const PRODUCT_SLUGS = new Set(PRODUCTS.map((p) => p.slug));
/** Image routes next to a page: opengraph-image (and a possible /<id> below it). */
const IMAGE_ROUTE = /^(?:opengraph|twitter)-image(?:-[\w-]+)?$/;

/**
 * Where unknown paths under a locale go: a product slug that never exists,
 * so the product page renders the localized 404 (RTL on /ar) inside the
 * normal layout. Its notFound() also makes the status 404.
 */
export const localeNotFoundPath = (locale: Locale) => `/${locale}/products/${NOT_FOUND_SLUG}`;

/**
 * Where paths outside both locales go (/shop, /fr, /products/x): a path no
 * route matches, so Next answers with app/global-not-found.tsx (bilingual,
 * fully server-rendered) and a 404, instead of the [lang] layout rejecting an
 * unknown "locale" with the framework's unbranded page.
 */
export const GLOBAL_NOT_FOUND_PATH = "/missing/404";

export type Route =
  | { kind: "root" }
  | { kind: "page" }
  | { kind: "malformed" }
  | { kind: "redirect"; pathname: string }
  | { kind: "locale-404"; locale: Locale }
  | { kind: "global-404" };

/** Decides what to do with a request path (the matcher has already left out files, _next, api…). */
export function classify(pathname: string): Route {
  if (pathname === "/") return { kind: "root" };

  // A malformed percent-escape must never reach the router: decoding the
  // dynamic params would fail there with a 500.
  let segments: string[];
  try {
    segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return { kind: "malformed" };
  }

  const [first = "", ...rest] = segments;
  if (!isLocale(first)) {
    // /EN, /Ar/products/x → the lowercase locale.
    const lower = first.toLowerCase();
    if (isLocale(lower)) {
      const tail = pathname.split("/").filter(Boolean).slice(1).join("/");
      return { kind: "redirect", pathname: `/${lower}${tail ? `/${tail}` : ""}` };
    }
    return { kind: "global-404" };
  }

  const known =
    rest.length === 0 ||
    (IMAGE_ROUTE.test(rest[0]) && rest.length <= 2) ||
    (rest[0] === "products" &&
      rest.length >= 2 &&
      PRODUCT_SLUGS.has(rest[1]) &&
      (rest.length === 2 || (IMAGE_ROUTE.test(rest[2]) && rest.length <= 4)));
  return known ? { kind: "page" } : { kind: "locale-404", locale: first };
}

/** Plain, self-contained 404 for malformed URLs (no app rendering happens for them). */
const MALFORMED_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Not found · 3D BH</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#020203;color:#ededf0;font:16px/1.6 system-ui,sans-serif"><main style="padding:24px;text-align:center"><p style="margin:0;font-size:56px;font-weight:600;letter-spacing:-0.03em">404</p><p style="margin:8px 0 24px;color:#9a9ca5">This page could not be found. · <span lang="ar" dir="rtl">الصفحة غير موجودة.</span></p><a href="/" style="color:#ededf0">3D BH</a></main></body></html>`;

/**
 * - "/" → /en or /ar (cookie, then Accept-Language), keeping the query
 *   string, and remembers the visitor's country.
 * - Unknown paths get a real 404: the localized page under /en and /ar, the
 *   bilingual global page elsewhere. /EN-style paths redirect to lowercase.
 */
export function proxy(request: NextRequest) {
  const route = classify(request.nextUrl.pathname);
  switch (route.kind) {
    case "page":
      return NextResponse.next();
    case "malformed":
      return new NextResponse(MALFORMED_HTML, {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    case "redirect": {
      const url = request.nextUrl.clone();
      url.pathname = route.pathname;
      return NextResponse.redirect(url, 308);
    }
    case "locale-404":
    case "global-404": {
      const url = request.nextUrl.clone();
      url.pathname = route.kind === "locale-404" ? localeNotFoundPath(route.locale) : GLOBAL_NOT_FOUND_PATH;
      return NextResponse.rewrite(url, { status: 404 });
    }
    case "root":
      return redirectToLocale(request);
  }
}

function redirectToLocale(request: NextRequest) {
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

/*
 * Everything except Next internals (_next, _vercel, dev-only __nextjs),
 * API routes, /.well-known, the icon routes (/icon/192, /apple-icon/180)
 * and any path whose last segment has a dot: static files, sitemap.xml,
 * robots.txt, manifest.webmanifest, .rsc / .segments transport paths.
 */
export const config = {
  matcher: ["/((?!_next/|_vercel/|__nextjs|api/|\\.well-known/|icon/|apple-icon/|.*\\.[^/]+$).*)"],
};
