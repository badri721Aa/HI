import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { PRODUCTS } from "@/content/catalog";
import { GLOBAL_NOT_FOUND_PATH, classify, config, languageWeights, localeNotFoundPath, pickLocale, proxy } from "@/proxy";

describe("languageWeights", () => {
  it("is zero for both languages without a header", () => {
    expect(languageWeights(null)).toEqual({ en: 0, ar: 0 });
    expect(languageWeights("")).toEqual({ en: 0, ar: 0 });
  });

  it("reads regional tags by their primary language", () => {
    expect(languageWeights("ar-BH")).toEqual({ en: 0, ar: 1 });
    expect(languageWeights("en-US")).toEqual({ en: 1, ar: 0 });
    expect(languageWeights("AR-ae")).toEqual({ en: 0, ar: 1 });
  });

  it("keeps the highest q per language", () => {
    expect(languageWeights("ar-BH,ar;q=0.9,en;q=0.8")).toEqual({ en: 0.8, ar: 1 });
    expect(languageWeights("en;q=0.2, en-GB;q=0.7")).toEqual({ en: 0.7, ar: 0 });
  });

  it("ignores languages the shop doesn't serve and the wildcard", () => {
    expect(languageWeights("fr;q=0.9, ar;q=0.8")).toEqual({ en: 0, ar: 0.8 });
    expect(languageWeights("*;q=0.5, de")).toEqual({ en: 0, ar: 0 });
  });

  it("treats q=0 as not acceptable and clamps out-of-range q values", () => {
    expect(languageWeights("ar;q=0, en;q=0.5")).toEqual({ en: 0.5, ar: 0 });
    expect(languageWeights("ar;q=7")).toEqual({ en: 0, ar: 1 });
    expect(languageWeights("ar;q=-1")).toEqual({ en: 0, ar: 0 });
  });

  it("defaults a malformed q to 1", () => {
    expect(languageWeights("ar;q=abc")).toEqual({ en: 0, ar: 1 });
  });

  it("tolerates spaces and empty entries", () => {
    expect(languageWeights(" en-US ; q=0.4 ,, ar ; q = 0.9 ")).toEqual({ en: 0.4, ar: 0.9 });
  });
});

describe("pickLocale", () => {
  it.each([
    ["ar", "ar"],
    ["ar-BH", "ar"],
    ["ar-BH,ar;q=0.9,en;q=0.8", "ar"],
    ["en-US", "en"],
    ["en-US,en;q=0.9,ar;q=0.8", "en"],
    ["fr;q=0.9, ar;q=0.8", "ar"],
    ["fr-FR, de;q=0.9", "en"],
    ["", "en"],
    ["*", "en"],
  ])("Accept-Language %j → %s", (header, expected) => {
    expect(pickLocale(undefined, header)).toBe(expected);
  });

  it("falls back to English without a header", () => {
    expect(pickLocale(undefined, null)).toBe("en");
  });

  it("prefers Arabic on a tie", () => {
    expect(pickLocale(undefined, "en;q=0.5, ar;q=0.5")).toBe("ar");
  });

  it("lets the lang cookie win over the header", () => {
    expect(pickLocale("en", "ar-BH")).toBe("en");
    expect(pickLocale("ar", "en-US")).toBe("ar");
    expect(pickLocale("ar", null)).toBe("ar");
  });

  it("ignores an invalid lang cookie", () => {
    expect(pickLocale("fr", "ar")).toBe("ar");
    expect(pickLocale("", "en")).toBe("en");
    expect(pickLocale("AR", "en")).toBe("en");
  });
});

describe("proxy", () => {
  const request = (headers: Record<string, string> = {}, url = "https://shop.example/") =>
    new NextRequest(url, { headers });

  it("redirects / to the visitor's language with a 307", () => {
    const ar = proxy(request({ "accept-language": "ar-BH,ar;q=0.9" }));
    expect(ar.status).toBe(307);
    expect(new URL(ar.headers.get("location")!).pathname).toBe("/ar");

    const en = proxy(request({ "accept-language": "en-US" }));
    expect(new URL(en.headers.get("location")!).pathname).toBe("/en");
  });

  it("follows the lang cookie", () => {
    const res = proxy(request({ "accept-language": "ar", cookie: "lang=en" }));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/en");
  });

  it("keeps the query string", () => {
    const res = proxy(request({ "accept-language": "ar" }, "https://shop.example/?utm_source=ig"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/ar");
    expect(location.searchParams.get("utm_source")).toBe("ig");
  });

  it("is never cached across visitors", () => {
    const res = proxy(request({ "accept-language": "ar" }));
    expect(res.headers.get("vary")).toMatch(/Accept-Language/i);
    expect(res.headers.get("vary")).toMatch(/Cookie/i);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("remembers a valid geo country in a readable cookie", () => {
    const res = proxy(request({ "x-vercel-ip-country": "ae" }));
    const cookie = res.cookies.get("geo_country");
    expect(cookie?.value).toBe("AE");
    expect(cookie?.httpOnly).toBeFalsy();
    expect(cookie?.secure).toBe(true);
  });

  it("ignores a missing or malformed geo header", () => {
    expect(proxy(request()).cookies.get("geo_country")).toBeUndefined();
    expect(proxy(request({ "x-vercel-ip-country": "XYZ" })).cookies.get("geo_country")).toBeUndefined();
    expect(proxy(request({ "x-vercel-ip-country": "1" })).cookies.get("geo_country")).toBeUndefined();
  });
});

describe("proxy matcher", () => {
  const runs = (path: string) => unstable_doesMiddlewareMatch({ config, url: `https://shop.example${path}` });

  it.each(["/", "/en", "/ar/", "/shop", "/fr", "/EN", "/en/products/gear-shifter", "/en/products/nope", "/en/a/b/c", "/%E0%A4%A", "/en/products/%ZZ", "/en/opengraph-image"])(
    "runs on %s",
    (path) => expect(runs(path)).toBe(true),
  );

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/_vercel/insights/view",
    "/api/region",
    "/.well-known/apple-app-site-association",
    "/.well-known/security.txt",
    "/icon/192",
    "/apple-icon/maskable",
    "/icon.svg",
    "/favicon.ico",
    "/sitemap.xml",
    "/robots.txt",
    "/manifest.webmanifest",
    "/sw.js",
    "/offline.html",
    "/products/hex-phone-case.webp",
    "/en/products/gear-shifter.rsc",
  ])("leaves %s alone", (path) => expect(runs(path)).toBe(false));
});

describe("routing", () => {
  const slug = PRODUCTS[0].slug;
  const run = (path: string) => proxy(new NextRequest(`https://shop.example${path}`));

  it("passes the real pages and their image routes through", () => {
    for (const path of [
      "/en",
      "/ar/",
      `/en/products/${slug}`,
      `/ar/products/${slug}/`,
      "/en/opengraph-image",
      `/ar/products/${slug}/opengraph-image`,
    ]) {
      expect(classify(path), path).toEqual({ kind: "page" });
      const res = run(path);
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
      expect(isRewrite(res), path).toBe(false);
    }
  });

  it("serves unknown products with the localized 404 and a 404 status", () => {
    for (const locale of ["en", "ar"] as const) {
      const res = run(`/${locale}/products/this-piece-does-not-exist`);
      expect(res.status).toBe(404);
      expect(isRewrite(res)).toBe(true);
      expect(new URL(getRewrittenUrl(res)!).pathname).toBe(localeNotFoundPath(locale));
    }
  });

  it("sends any other unknown path under a locale, however deep, to that locale's 404", () => {
    for (const path of ["/ar/products-typo", "/ar/a/b/c/d", "/en/products", "/en/cart", `/en/products/${slug}/extra`]) {
      const res = run(path);
      expect(res.status, path).toBe(404);
      expect(new URL(getRewrittenUrl(res)!).pathname, path).toBe(path.startsWith("/ar") ? "/ar/products/not-found" : "/en/products/not-found");
    }
  });

  it("sends paths outside both locales to the bilingual global 404", () => {
    for (const path of ["/shop", "/fr", "/cart", "/nope/deeper/still", `/products/${slug}`, "/api"]) {
      const res = run(path);
      expect(res.status, path).toBe(404);
      expect(new URL(getRewrittenUrl(res)!).pathname, path).toBe(GLOBAL_NOT_FOUND_PATH);
    }
    expect(classify(GLOBAL_NOT_FOUND_PATH)).toEqual({ kind: "global-404" });
  });

  it("redirects an upper-case locale to the lowercase one, keeping the rest and the query", () => {
    const res = run(`/EN/products/${slug}?utm_source=wa`);
    expect(res.status).toBe(308);
    const location = new URL(getRedirectUrl(res)!);
    expect(location.pathname).toBe(`/en/products/${slug}`);
    expect(location.searchParams.get("utm_source")).toBe("wa");
    expect(new URL(getRedirectUrl(run("/Ar"))!).pathname).toBe("/ar");
  });

  it("answers malformed percent-escapes with a 404 itself, before any route decodes them", () => {
    for (const path of ["/en/products/%ZZ", "/en/products/%E0%A4%A", "/%E0%A4%A", "/en/%E0%A4%A", "/%"]) {
      expect(classify(path), path).toEqual({ kind: "malformed" });
      const res = run(path);
      expect(res.status, path).toBe(404);
      expect(isRewrite(res), path).toBe(false);
      expect(res.headers.get("x-middleware-next"), path).toBeNull();
      expect(res.headers.get("content-type"), path).toMatch(/text\/html/);
    }
  });

  it("still decodes valid escapes", () => {
    expect(classify(`/en/products/${encodeURIComponent(slug)}`)).toEqual({ kind: "page" });
    expect(classify("/en/products/%D9%85%D8%B2%D9%87%D8%B1%D9%8A%D8%A9")).toEqual({ kind: "locale-404", locale: "en" });
  });
});
