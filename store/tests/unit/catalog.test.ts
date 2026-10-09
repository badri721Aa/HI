import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CURRENCIES, LOCALES, type L10n, type MaterialId } from "@/types";
import { CATEGORIES, MATERIALS, NOT_FOUND_SLUG, PRODUCTS, getMaterial, getProduct } from "@/content/catalog";
import { CURRENCY_DECIMALS } from "@/lib/currency";
import { site } from "@/lib/site";
import { LIMITS } from "@/lib/whatsapp";
import { decodeDataUri, imageSize } from "./helpers/image-size";
import { MODEL_KINDS } from "./helpers/model-kinds";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PUBLIC = join(ROOT, "public");

const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const filled = (text: L10n | undefined) => LOCALES.every((l) => typeof text?.[l] === "string" && text[l].trim() !== "");

/** True when `value` has at most `decimals` decimal places (tolerant of binary float noise). */
function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

describe("catalog: products", () => {
  it("has products", () => {
    expect(PRODUCTS.length).toBeGreaterThan(0);
  });

  it("has unique, URL-safe slugs", () => {
    const slugs = PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug, slug).toMatch(SLUG);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });

  it(`has unique SKUs that start with the order prefix (${site.orderPrefix}-)`, () => {
    const skus = PRODUCTS.map((p) => p.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const sku of skus) {
      expect(sku.startsWith(`${site.orderPrefix}-`), sku).toBe(true);
      expect(sku, sku).toMatch(/^[A-Z0-9-]+$/);
    }
  });

  it("has unique names in each locale", () => {
    for (const locale of LOCALES) {
      const names = PRODUCTS.map((p) => p.name[locale]);
      expect(new Set(names).size, locale).toBe(names.length);
    }
  });

  it("has name, tagline and description in both locales", () => {
    for (const p of PRODUCTS) {
      expect(filled(p.name), `${p.slug}.name`).toBe(true);
      expect(filled(p.tagline), `${p.slug}.tagline`).toBe(true);
      expect(filled(p.description), `${p.slug}.description`).toBe(true);
    }
  });

  it("belongs to a known category, and every category has a product", () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRODUCTS) expect(ids, p.slug).toContain(p.category);
    for (const c of CATEGORIES) {
      expect(filled(c.name), c.id).toBe(true);
      expect(PRODUCTS.some((p) => p.category === c.id), `category ${c.id} is empty`).toBe(true);
    }
  });

  it("finds products by slug", () => {
    for (const p of PRODUCTS) expect(getProduct(p.slug)).toBe(p);
    expect(getProduct("does-not-exist")).toBeUndefined();
  });

  it("has a stock count that is null (made to order) or a whole number ≥ 0", () => {
    for (const p of PRODUCTS) {
      if (p.stock !== null) {
        expect(Number.isInteger(p.stock), p.slug).toBe(true);
        expect(p.stock, p.slug).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("catalog: colours and sizes", () => {
  it("has at least one colour and one size, with unique ids", () => {
    for (const p of PRODUCTS) {
      expect(p.colors.length, p.slug).toBeGreaterThan(0);
      expect(p.sizes.length, p.slug).toBeGreaterThan(0);
      expect(new Set(p.colors.map((c) => c.id)).size, p.slug).toBe(p.colors.length);
      expect(new Set(p.sizes.map((s) => s.id)).size, p.slug).toBe(p.sizes.length);
    }
  });

  it("uses six-digit hex colours, including the second tone", () => {
    for (const p of PRODUCTS) {
      for (const c of p.colors) {
        expect(c.hex, `${p.slug}/${c.id}`).toMatch(HEX);
        if (c.hex2 !== undefined) {
          expect(c.hex2, `${p.slug}/${c.id}.hex2`).toMatch(HEX);
          expect(c.hex2.toLowerCase(), `${p.slug}/${c.id}: hex2 repeats hex`).not.toBe(c.hex.toLowerCase());
        }
        expect(["matte", "silk", "translucent"]).toContain(c.finish);
        expect(filled(c.name), `${p.slug}/${c.id}.name`).toBe(true);
        expect(c.id, c.id).toMatch(SLUG);
      }
    }
  });

  it("prices every size above zero, BHD with ≤ 3 decimals and AED with ≤ 2", () => {
    expect(CURRENCY_DECIMALS).toEqual({ BHD: 3, AED: 2 });
    for (const p of PRODUCTS) {
      for (const s of p.sizes) {
        const where = `${p.slug}/${s.id}`;
        for (const currency of CURRENCIES) {
          const price = s.price[currency];
          expect(Number.isFinite(price), `${where} ${currency}`).toBe(true);
          expect(price, `${where} ${currency}`).toBeGreaterThan(0);
          expect(hasAtMostDecimals(price, CURRENCY_DECIMALS[currency]), `${where} ${currency} ${price}`).toBe(true);
        }
        expect(filled(s.name), `${where}.name`).toBe(true);
        expect(s.id, where).toMatch(SLUG);
      }
    }
  });

  it("has positive dimensions in mm when a size lists them", () => {
    for (const p of PRODUCTS) {
      for (const s of p.sizes) {
        if (!s.dims) continue;
        for (const axis of ["w", "d", "h"] as const) {
          expect(s.dims[axis], `${p.slug}/${s.id}.${axis}`).toBeGreaterThan(0);
          expect(s.dims[axis], `${p.slug}/${s.id}.${axis}`).toBeLessThan(1000);
        }
      }
    }
  });
});

describe("catalog: reserved slugs", () => {
  it("never uses the 404 slug the proxy rewrites to", () => {
    expect(PRODUCTS.map((p) => p.slug)).not.toContain(NOT_FOUND_SLUG);
  });
});

describe("catalog: photos", () => {
  it("has at least one photo per product", () => {
    for (const p of PRODUCTS) expect(p.images.length, p.slug).toBeGreaterThan(0);
  });

  it("leads with the edited cover and always includes the shop's original photo", () => {
    for (const p of PRODUCTS) {
      expect(p.images[0].kind, p.slug).toBe("cutout");
      expect(p.images.some((i) => i.kind === "original"), p.slug).toBe(true);
    }
  });

  it("points every image at a real file under public/ whose size matches the declared one", () => {
    for (const p of PRODUCTS) {
      for (const image of p.images) {
        expect(image.src.startsWith("/"), image.src).toBe(true);
        expect(image.src, image.src).toMatch(/\.(webp|avif|jpe?g|png)$/);
        const file = join(PUBLIC, image.src);
        expect(existsSync(file), `missing ${file}`).toBe(true);
        const size = imageSize(readFileSync(file));
        expect(size, `unreadable ${image.src}`).not.toBeNull();
        expect([size?.width, size?.height], image.src).toEqual([image.width, image.height]);
      }
    }
  });

  it("keeps product photos reasonably small", () => {
    for (const p of PRODUCTS) {
      for (const image of p.images) {
        expect(statSync(join(PUBLIC, image.src)).size, image.src).toBeLessThan(400 * 1024);
      }
    }
  });

  it("uses a 4:5 cover photo", () => {
    for (const p of PRODUCTS) {
      const cover = p.images[0];
      expect(Math.abs(cover.width / cover.height - 0.8), `${p.slug}: ${cover.width}×${cover.height}`).toBeLessThanOrEqual(
        0.01,
      );
    }
  });

  it("has a tiny base64 blur placeholder with the photo's proportions", () => {
    for (const p of PRODUCTS) {
      for (const image of p.images) {
        expect(image.blurDataURL.startsWith("data:image/"), image.src).toBe(true);
        expect(image.blurDataURL.length, image.src).toBeLessThan(1024);
        const decoded = decodeDataUri(image.blurDataURL);
        expect(decoded, image.src).not.toBeNull();
        const size = imageSize(decoded!.bytes);
        expect(size, `${image.src}: blur preview is not a readable image`).not.toBeNull();
        expect(decoded!.mime).toBe(`image/${size!.format}`);
        expect(Math.max(size!.width, size!.height), image.src).toBeLessThanOrEqual(32);
        const ratio = size!.width / size!.height;
        expect(Math.abs(ratio - image.width / image.height), image.src).toBeLessThan(0.1);
      }
    }
  });

  it("describes every photo in both locales", () => {
    for (const p of PRODUCTS) {
      for (const image of p.images) {
        expect(filled(image.alt), `${image.src}.alt`).toBe(true);
        expect(image.alt.ar, image.src).toMatch(/[\u0600-\u06FF]/);
        expect(image.alt.en.length, image.src).toBeGreaterThan(10);
      }
    }
  });

  it("has a PNG or JPEG link-preview photo for every product (Satori cannot read WebP)", () => {
    for (const p of PRODUCTS) {
      const candidates = ["png", "jpg", "jpeg"].map((ext) => join(ROOT, "assets", "og-photos", `${p.slug}.${ext}`));
      const file = candidates.find((f) => existsSync(f));
      expect(file, `${p.slug} has no assets/og-photos/${p.slug}.png`).toBeDefined();
      const size = imageSize(readFileSync(file!));
      expect(size?.format === "png" || size?.format === "jpeg", file).toBe(true);
    }
  });
});

describe("catalog: optional fields", () => {
  it("uses known materials and models when given", () => {
    for (const p of PRODUCTS) {
      if (p.material !== undefined) expect(() => getMaterial(p.material!), p.slug).not.toThrow();
      if (p.model !== undefined) expect(MODEL_KINDS, p.slug).toContain(p.model);
    }
  });

  it("has sensible print data when given", () => {
    for (const p of PRODUCTS) {
      if (p.printHours !== undefined) expect(p.printHours, p.slug).toBeGreaterThan(0);
      if (p.layerHeight !== undefined) {
        expect(p.layerHeight, p.slug).toBeGreaterThan(0);
        expect(p.layerHeight, p.slug).toBeLessThanOrEqual(1);
      }
      if (p.leadTimeDays !== undefined) {
        const [min, max] = p.leadTimeDays;
        expect(Number.isInteger(min) && Number.isInteger(max), p.slug).toBe(true);
        expect(min, p.slug).toBeGreaterThan(0);
        expect(max, p.slug).toBeGreaterThanOrEqual(min);
      }
      if (p.badge !== undefined) expect(["new", "limited"]).toContain(p.badge);
    }
  });

  it("labels every variant note in both locales", () => {
    for (const p of PRODUCTS) {
      if (!p.variantNote) continue;
      expect(filled(p.variantNote.label), `${p.slug}.variantNote.label`).toBe(true);
      expect(filled(p.variantNote.placeholder), `${p.slug}.variantNote.placeholder`).toBe(true);
      // The placeholder must fit in the input it sits in.
      for (const l of LOCALES) expect(p.variantNote.placeholder[l].length).toBeLessThanOrEqual(LIMITS.note);
    }
  });

  it("asks for the iPhone model on the phone case", () => {
    const phoneCase = getProduct("hex-phone-case");
    expect(phoneCase).toBeDefined();
    expect(phoneCase!.variantNote?.required).toBe(true);
    expect(phoneCase!.variantNote?.label.en).toMatch(/iPhone/);
  });
});

describe("catalog: materials", () => {
  it("has unique ids, names in both locales and scores from 1 to 5", () => {
    const ids = MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MATERIALS) {
      expect(filled(m.name), m.id).toBe(true);
      expect(filled(m.summary), m.id).toBe(true);
      for (const score of Object.values(m.scores)) {
        expect(Number.isInteger(score) && score >= 1 && score <= 5, m.id).toBe(true);
      }
      expect(m.heatC, m.id).toBeGreaterThan(0);
    }
  });

  it("throws for an unknown material", () => {
    expect(() => getMaterial("unobtainium" as MaterialId)).toThrow(/Unknown material/);
  });
});
