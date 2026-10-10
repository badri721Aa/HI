import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { HOURS_CONFIRMED, WHATSAPP_LINES, site } from "@/lib/site";
import { REGION_CONFIG } from "@/lib/site";
import { getDictionary } from "@/lib/i18n";
import { bidiRuns } from "@/components/seo/og-text";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  homeMetadata,
  languageAlternates,
  layoutMetadata,
  notFoundMetadata,
  openingHours,
  organizationJsonLd,
  productJsonLd,
  productMetadata,
} from "@/lib/seo";
import sitemap from "@/app/sitemap";

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
    expect(p.images.length).toBeGreaterThan(0);
    expect(images).toEqual([
      ...p.images.map((i) => `${site.url}${i.src}`),
      `${site.url}/en/products/gear-shifter/opengraph-image`,
    ]);
    for (const url of images) expect(() => new URL(url)).not.toThrow();
  });

  it("gives every offer shipping details for its own country", () => {
    for (const o of offersOf(productJsonLd(product("keycap-clicker"), "en"))) {
      const region = (o.eligibleRegion as Json).identifier as "BH" | "AE";
      const details = o.shippingDetails as Json;
      expect(details["@type"]).toBe("OfferShippingDetails");
      expect(details.shippingDestination).toEqual({ "@type": "DefinedRegion", addressCountry: region });
      const transit = (details.deliveryTime as Json).transitTime as Json;
      expect(transit).toMatchObject({
        minValue: REGION_CONFIG[region].deliveryDays[0],
        maxValue: REGION_CONFIG[region].deliveryDays[1],
        unitCode: "DAY",
      });
      // The fee is quoted in the chat, so no rate is claimed.
      if (REGION_CONFIG[region].deliveryFee === null) expect(details).not.toHaveProperty("shippingRate");
    }
    const timed: Product = { ...product("keycap-clicker"), leadTimeDays: [2, 4] };
    for (const o of offersOf(productJsonLd(timed, "en"))) {
      expect(((o.shippingDetails as Json).deliveryTime as Json).handlingTime).toMatchObject({ minValue: 2, maxValue: 4 });
    }
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

describe("breadcrumbJsonLd", () => {
  it("mirrors the visible breadcrumb, ending on the product URL", () => {
    const p = product("gear-shifter");
    const ld = breadcrumbJsonLd(p, "ar");
    expect(ld["@type"]).toBe("BreadcrumbList");
    const items = ld.itemListElement as Json[];
    expect(items.map((i) => i.position)).toEqual(items.map((_, k) => k + 1));
    expect(items[0]).toMatchObject({ "@type": "ListItem", item: `${site.url}/ar#collection` });
    expect(items.at(-1)).toMatchObject({ name: p.name.ar, item: `${site.url}/ar/products/gear-shifter` });
    expect(JSON.stringify(ld)).not.toMatch(/undefined|NaN|null/);
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
      if (HOURS_CONFIRMED) expect((point.hoursAvailable as Json[]).length).toBeGreaterThan(0);
      else expect(point.hoursAvailable).toBeUndefined();
    }
    expect(Object.keys(WHATSAPP_LINES)).toHaveLength(3);
  });

  it("serves Bahrain and the UAE", () => {
    const areas = (store("ar").areaServed as Json[]).map((a) => a.identifier);
    expect(areas.sort()).toEqual(["AE", "BH"]);
  });

  it("groups opening hours with Friday afternoon on its own", () => {
    const hours = openingHours() as Json[];
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

  it("labels the share cards in the page's language", () => {
    const image = (meta: ReturnType<typeof layoutMetadata>) => (meta.openGraph?.images as Json[])[0];
    expect(image(layoutMetadata("ar"))).toMatchObject({ url: "/ar/opengraph-image", width: 1200, height: 630 });
    expect(image(layoutMetadata("ar")).alt).toMatch(/[\u0600-\u06FF]/);
    const p = product("keycap-clicker");
    const card = image(productMetadata(p, "ar"));
    expect(card.url).toBe("/ar/products/keycap-clicker/opengraph-image");
    expect(card.alt).toContain(p.name.ar);
    expect(image(productMetadata(p, "en")).alt).toContain(p.name.en);
  });

  it("gives the home page its share card with alt text, so the image file beside it cannot drop the alt", () => {
    for (const locale of ["en", "ar"] as const) {
      const og = homeMetadata(locale).openGraph;
      // The page's Open Graph replaces the layout's wholesale, so it must match it.
      expect(og, locale).toEqual(layoutMetadata(locale).openGraph);
      expect((og?.images as Json[])[0]).toMatchObject({
        url: `/${locale}/opengraph-image`,
        alt: getDictionary(locale).site.meta.ogAlt,
      });
    }
    expect((homeMetadata("ar").openGraph?.images as Json[])[0].alt).toMatch(/[\u0600-\u06FF]/);
  });

  it("keeps product descriptions to the short tagline", () => {
    for (const p of PRODUCTS) expect(productMetadata(p, "en").description, p.slug).toBe(p.tagline.en);
  });

  it("gives the 404 its own title, no canonical and noindex", () => {
    const meta = notFoundMetadata("ar");
    expect(meta.title).toBe("الصفحة غير موجودة");
    expect(meta.alternates).toEqual({ canonical: null });
    expect(meta.robots).toMatchObject({ index: false });
  });

  it("gives each locale its own canonical", () => {
    expect(layoutMetadata("ar").alternates?.canonical).toBe("/ar");
    const meta = productMetadata(product("keycap-clicker"), "en");
    expect(meta.alternates?.canonical).toBe("/en/products/keycap-clicker");
    expect(meta.title).toBe("Keycap Clicker");
  });
});

describe("sitemap", () => {
  it("lists each product's real photos, and the share card for the home page", () => {
    const entries = sitemap();
    for (const p of PRODUCTS) {
      const entry = entries.find((e) => e.url === `${site.url}/ar/products/${p.slug}`);
      expect(entry?.images, p.slug).toEqual(p.images.map((i) => `${site.url}${i.src}`));
    }
    expect(entries.find((e) => e.url === `${site.url}/en`)?.images).toEqual([`${site.url}/en/opengraph-image`]);
  });
});

describe("bidiRuns (Arabic share card text)", () => {
  const EDGE = /^[.,:;!?\u2026\u060C\u061B\u061F]|[.,:;!?\u2026\u060C\u061B\u061F]$/;

  it("splits a final full stop off the last word, to be drawn on its left", () => {
    expect(bidiRuns("فوق طبقة.")).toEqual([
      { text: "فوق", rtl: true },
      { text: "طبقة", rtl: true, after: "." },
    ]);
  });

  it("splits mid-sentence marks off their word too", () => {
    const runs = bidiRuns("زر كيبورد في ميداليتك. اضغطه كلما أردت.");
    expect(runs.find((r) => r.text === "ميداليتك")).toEqual({ text: "ميداليتك", rtl: true, after: "." });
    expect(bidiRuns("بحجم الكف: خمس")[1]).toEqual({ text: "الكف", rtl: true, after: ":" });
    expect(bidiRuns("بأربعة ألوان، تبرز")[1]).toEqual({ text: "ألوان", rtl: true, after: "،" });
  });

  it("leaves no edge punctuation inside any Arabic line the cards draw", () => {
    const t = getDictionary("ar");
    const lines = [...t.home.hero.titleLines, t.common.brandLine, ...PRODUCTS.flatMap((p) => [p.name.ar, p.tagline.ar])];
    for (const line of lines) {
      const runs = bidiRuns(line);
      for (const run of runs) expect(run.text, line).not.toMatch(EDGE);
      if (line.endsWith(".")) expect(runs.at(-1)?.after, line).toBe(".");
    }
  });

  it("judges a word's direction without its punctuation, and mirrors brackets and quotes", () => {
    // "(R)،" is Latin despite the Arabic comma; on a right-to-left line ")" is drawn on its right, "،(" on its left.
    expect(bidiRuns("والرجوع (R)، على")[1]).toEqual({ text: "R", rtl: false, before: ")", after: "،(" });
    expect(bidiRuns("«كلمة»")).toEqual([{ text: "كلمة", rtl: true, before: "»", after: "«" }]);
    // Punctuation-only words read entirely right to left.
    expect(bidiRuns("كلمة (")[1]).toEqual({ text: ")", rtl: false });
  });

  it("keeps a bracket or quote whose partner is inside the run", () => {
    expect(bidiRuns("كلمة PLA (PETG)")[1]).toEqual({ text: "PLA (PETG)", rtl: false });
    expect(bidiRuns('كلمة "3D" BH')[1]).toEqual({ text: '"3D" BH', rtl: false });
    expect(bidiRuns("كلمة PLA (PETG).")[1]).toEqual({ text: "PLA (PETG)", rtl: false, after: "." });
  });

  it("splits only the outer edges of a left-to-right run", () => {
    expect(bidiRuns("من PLA، PETG.")).toEqual([
      { text: "من", rtl: true },
      { text: "PLA، PETG", rtl: false, after: "." },
    ]);
  });

  it("keeps signs and inner punctuation with their word", () => {
    expect(bidiRuns("اطلب +973 3985 8885")).toEqual([
      { text: "اطلب", rtl: true },
      { text: "+973 3985 8885", rtl: false },
    ]);
    expect(bidiRuns("من 3.000 د.ب · 30.00 د.إ").map((r) => r.text)).toEqual(["من", "3.000", "د.ب", "·", "30.00", "د.إ"]);
    expect(bidiRuns("الطبقة 638 / 1100")).toEqual([
      { text: "الطبقة", rtl: true },
      { text: "638 / 1100", rtl: false },
    ]);
  });
});
