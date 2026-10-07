import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { WHATSAPP_LINES, site } from "@/lib/site";
import {
  absoluteUrl,
  languageAlternates,
  layoutMetadata,
  organizationJsonLd,
  productJsonLd,
  productMetadata,
} from "@/lib/seo";

type Json = Record<string, unknown>;

const product = (slug: string) => {
  const p = getProduct(slug);
  if (!p) throw new Error(`missing product ${slug}`);
  return p;
};

const offersOf = (ld: Json) => ld.offers as Json[];

describe("productJsonLd", () => {
  it("is a schema.org Product with the product's identity", () => {
    const p = product("keycap-clicker");
    const ld = productJsonLd(p, "en");
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("Keycap Clicker");
    expect(ld.sku).toBe(p.sku);
    expect(ld.url).toBe(`${site.url}/en/products/keycap-clicker`);
    expect(ld.brand).toEqual({ "@type": "Brand", name: site.name });
  });

  it("emits one Offer per size per currency with correctly formatted prices", () => {
    const offers = offersOf(productJsonLd(product("hex-phone-case"), "en"));
    expect(offers).toHaveLength(2);
    const byCurrency = Object.fromEntries(offers.map((o) => [o.priceCurrency, o]));
    expect(byCurrency.BHD.price).toBe("2.000");
    expect(byCurrency.AED.price).toBe("20.00");
    expect((byCurrency.BHD.eligibleRegion as Json).identifier).toBe("BH");
    expect((byCurrency.AED.eligibleRegion as Json).identifier).toBe("AE");
  });

  it("prices every catalog product as strings with 3 (BHD) or 2 (AED) decimals", () => {
    for (const p of PRODUCTS) {
      const offers = offersOf(productJsonLd(p, "en"));
      expect(offers).toHaveLength(p.sizes.length * 2);
      for (const offer of offers) {
        expect(typeof offer.price, p.slug).toBe("string");
        expect(offer.price, p.slug).toMatch(offer.priceCurrency === "BHD" ? /^\d+\.\d{3}$/ : /^\d+\.\d{2}$/);
        expect(Number(offer.price), p.slug).toBeGreaterThan(0);
      }
    }
    const cell = offersOf(productJsonLd(product("plant-cell-model"), "en"));
    expect(cell.map((o) => o.price).sort()).toEqual(["3.000", "30.00"]);
  });

  it("marks made-to-order pieces as MadeToOrder, and stocked ones as InStock", () => {
    const madeToOrder = offersOf(productJsonLd(product("keycap-clicker"), "en"));
    for (const o of madeToOrder) expect(o.availability).toBe("https://schema.org/MadeToOrder");

    const stocked: Product = { ...product("keycap-clicker"), stock: 6 };
    for (const o of offersOf(productJsonLd(stocked, "en"))) {
      expect(o.availability).toBe("https://schema.org/InStock");
      expect(o).not.toHaveProperty("deliveryLeadTime");
    }
  });

  it("adds a delivery lead time only when the catalog gives one", () => {
    for (const o of offersOf(productJsonLd(product("keycap-clicker"), "en"))) expect(o).not.toHaveProperty("deliveryLeadTime");
    const timed: Product = { ...product("keycap-clicker"), leadTimeDays: [2, 4] };
    for (const o of offersOf(productJsonLd(timed, "en"))) {
      expect(o.deliveryLeadTime).toMatchObject({ minValue: 2, maxValue: 4, unitCode: "DAY" });
    }
  });

  it("has no material key when the product has no material", () => {
    for (const p of PRODUCTS.filter((x) => !x.material)) {
      expect(productJsonLd(p, "en"), p.slug).not.toHaveProperty("material");
    }
    const petg: Product = { ...product("keycap-clicker"), material: "petg" };
    expect(productJsonLd(petg, "en").material).toBe("PETG");
  });

  it("lists absolute URLs for every photo, then the OG card", () => {
    const p = product("gear-shifter");
    const images = productJsonLd(p, "en").image as string[];
    expect(images).toEqual([
      `${site.url}/products/gear-shifter.webp`,
      `${site.url}/products/gear-shifter-set.webp`,
      `${site.url}/en/products/gear-shifter/opengraph-image`,
    ]);
    for (const url of images) expect(() => new URL(url)).not.toThrow();
  });

  it("is localized for Arabic", () => {
    const ld = productJsonLd(product("plant-cell-model"), "ar");
    expect(ld.name).toBe("مجسم الخلية النباتية");
    expect(ld.url).toBe(`${site.url}/ar/products/plant-cell-model`);
    expect(ld.category).toBe("مجسمات مدرسية");
    expect(offersOf(ld).map((o) => o.price).sort()).toEqual(["3.000", "30.00"]);
  });

  it("serializes to JSON without undefined or NaN", () => {
    for (const p of PRODUCTS) {
      for (const locale of ["en", "ar"] as const) {
        const json = JSON.stringify(productJsonLd(p, locale));
        expect(json).not.toMatch(/undefined|NaN|null/);
      }
    }
  });
});

describe("organizationJsonLd", () => {
  const graph = (locale: "en" | "ar") => (organizationJsonLd(locale)["@graph"] as Json[]) ?? [];
  const store = (locale: "en" | "ar") => graph(locale).find((n) => n["@type"] === "OnlineStore") as Json;

  it("describes the store and the website", () => {
    const nodes = graph("en");
    expect(nodes.map((n) => n["@type"]).sort()).toEqual(["OnlineStore", "WebSite"]);
    expect(store("en").name).toBe(site.name);
    expect(store("en").url).toBe(`${site.url}/en`);
  });

  it("has the three WhatsApp lines as contact points", () => {
    const points = store("en").contactPoint as Json[];
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.telephone).sort()).toEqual(["+97339858885", "+97363669666", "+971504644502"].sort());
    expect(points.map((p) => p.url).sort()).toEqual(
      ["https://wa.me/97339858885", "https://wa.me/97363669666", "https://wa.me/971504644502"].sort(),
    );
    for (const point of points) {
      expect(point["@type"]).toBe("ContactPoint");
      expect(["BH", "AE"]).toContain(point.areaServed);
      expect((point.hoursAvailable as Json[]).length).toBeGreaterThan(0);
    }
    expect(Object.keys(WHATSAPP_LINES)).toHaveLength(3);
  });

  it("serves Bahrain and the UAE", () => {
    const areas = (store("ar").areaServed as Json[]).map((a) => a.identifier);
    expect(areas.sort()).toEqual(["AE", "BH"]);
  });

  it("groups opening hours with Friday afternoon on its own", () => {
    const hours = (store("en").contactPoint as Json[])[0].hoursAvailable as Json[];
    const friday = hours.find((h) => (h.dayOfWeek as string[]).includes("Friday"));
    expect(friday).toMatchObject({ opens: "14:00", closes: "22:00", dayOfWeek: ["Friday"] });
    const days = hours.flatMap((h) => h.dayOfWeek as string[]);
    expect(new Set(days).size).toBe(days.length);
  });
});

describe("URLs and metadata", () => {
  it("builds absolute URLs on the site origin", () => {
    expect(absoluteUrl()).toBe(`${site.url}/`);
    expect(absoluteUrl("/en")).toBe(`${site.url}/en`);
    expect(absoluteUrl("en")).toBe(`${site.url}/en`);
  });

  it("lists both languages and an English x-default", () => {
    expect(languageAlternates("/products/x")).toEqual({
      en: "/en/products/x",
      ar: "/ar/products/x",
      "x-default": "/en/products/x",
    });
  });

  it("gives each locale its own canonical", () => {
    expect(layoutMetadata("ar").alternates?.canonical).toBe("/ar");
    const meta = productMetadata(product("keycap-clicker"), "en");
    expect(meta.alternates?.canonical).toBe("/en/products/keycap-clicker");
    expect(meta.title).toBe("Keycap Clicker");
  });
});
