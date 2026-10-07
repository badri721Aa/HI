import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, languageWeights, pickLocale, proxy } from "@/proxy";

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

  it("only runs on the bare root", () => {
    expect(config.matcher).toEqual(["/"]);
  });

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
