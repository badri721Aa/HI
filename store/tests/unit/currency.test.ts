import { describe, expect, it } from "vitest";
import type { SizeOption } from "@/types";
import { AED_PER_BHD } from "@/lib/site";
import {
  CURRENCY_DECIMALS,
  CURRENCY_LABEL,
  currencyForRegion,
  formatAmount,
  formatCurrency,
  fromMinor,
  priceFor,
  toMinor,
} from "@/lib/currency";

describe("formatCurrency", () => {
  it("formats BHD with three decimals", () => {
    expect(formatCurrency(2, "BHD")).toBe("2.000 BHD");
    expect(formatCurrency(1.5, "BHD")).toBe("1.500 BHD");
    expect(formatCurrency(0.25, "BHD")).toBe("0.250 BHD");
    expect(formatCurrency(1250, "BHD")).toBe("1,250.000 BHD");
  });

  it("formats AED with two decimals", () => {
    expect(formatCurrency(20, "AED")).toBe("20.00 AED");
    expect(formatCurrency(15, "AED")).toBe("15.00 AED");
    expect(formatCurrency(1250.5, "AED")).toBe("1,250.50 AED");
  });

  it("uses Arabic currency labels with Latin digits on /ar", () => {
    expect(formatCurrency(1.5, "BHD", "ar")).toBe("1.500 د.ب");
    expect(formatCurrency(15, "AED", "ar")).toBe("15.00 د.إ");
  });

  it("defaults to the English label", () => {
    expect(formatCurrency(9.5, "BHD")).toBe(formatCurrency(9.5, "BHD", "en"));
  });

  it("rounds to the currency's minor unit instead of printing float noise", () => {
    expect(formatCurrency(0.1 + 0.2, "BHD")).toBe("0.300 BHD");
    expect(formatCurrency(19.999, "AED")).toBe("20.00 AED");
  });

  it("never prints non-Latin digits or stray symbols", () => {
    for (const locale of ["en", "ar"] as const) {
      for (const currency of ["BHD", "AED"] as const) {
        const out = formatCurrency(1234.5, currency, locale);
        expect(out).not.toMatch(/[٠-٩]/);
        expect(out).not.toMatch(/NaN|undefined|null/);
        expect(out.startsWith("1,234.5")).toBe(true);
      }
    }
  });
});

describe("formatAmount", () => {
  it("omits the label and keeps grouping", () => {
    expect(formatAmount(1250.5, "BHD")).toBe("1,250.500");
    expect(formatAmount(95, "AED")).toBe("95.00");
  });
});

describe("toMinor / fromMinor", () => {
  it("uses fils for BHD and fils for AED (3 and 2 decimals)", () => {
    expect(CURRENCY_DECIMALS).toEqual({ BHD: 3, AED: 2 });
    expect(toMinor(1.5, "BHD")).toBe(1500);
    expect(toMinor(15, "AED")).toBe(1500);
    expect(fromMinor(1500, "BHD")).toBe(1.5);
    expect(fromMinor(1500, "AED")).toBe(15);
  });

  it("returns integers even for values that are inexact in binary", () => {
    for (const v of [0.1, 0.2, 0.3, 1.005, 2.675, 9.995, 123.456]) {
      expect(Number.isInteger(toMinor(v, "BHD"))).toBe(true);
      expect(Number.isInteger(toMinor(v, "AED"))).toBe(true);
    }
    expect(toMinor(0.1 + 0.2, "BHD")).toBe(300);
  });

  it("sums without drift: 3 × 1.5 BHD = 4.500", () => {
    const unit = toMinor(1.5, "BHD");
    const total = fromMinor(unit * 3, "BHD");
    expect(total).toBe(4.5);
    expect(formatCurrency(total, "BHD")).toBe("4.500 BHD");
  });

  it("sums many small amounts exactly", () => {
    let minor = 0;
    for (let i = 0; i < 10; i++) minor += toMinor(0.1, "BHD");
    expect(fromMinor(minor, "BHD")).toBe(1);
    // Naive float addition would not be exact; minor units are.
    let naive = 0;
    for (let i = 0; i < 10; i++) naive += 0.1;
    expect(naive).not.toBe(1);
  });

  it("round-trips every catalog-style price", () => {
    for (const v of [0.5, 1, 1.5, 2, 3, 9.5, 13.5, 26]) {
      expect(fromMinor(toMinor(v, "BHD"), "BHD")).toBe(v);
      expect(fromMinor(toMinor(v * 10, "AED"), "AED")).toBe(v * 10);
    }
  });
});

describe("currencyForRegion", () => {
  it("maps Bahrain to BHD and the UAE to AED", () => {
    expect(currencyForRegion("BH")).toBe("BHD");
    expect(currencyForRegion("AE")).toBe("AED");
  });

  it("has a label in both locales for each currency", () => {
    expect(CURRENCY_LABEL.BHD).toEqual({ en: "BHD", ar: "د.ب" });
    expect(CURRENCY_LABEL.AED).toEqual({ en: "AED", ar: "د.إ" });
  });
});

describe("priceFor", () => {
  const size = (price: Partial<SizeOption["price"]>) =>
    ({ price }) as unknown as Pick<SizeOption, "price">;

  it("uses the explicit catalog price in each currency", () => {
    const s = size({ BHD: 2, AED: 20 });
    expect(priceFor(s, "BHD")).toBe(2);
    expect(priceFor(s, "AED")).toBe(20);
  });

  it("prefers an explicit price even when it differs from the peg", () => {
    const s = size({ BHD: 1, AED: 12 });
    expect(priceFor(s, "AED")).toBe(12);
  });

  it("falls back to the peg for a missing AED price, rounded up to 5 AED", () => {
    // 2 BHD ≈ 19.53 AED → 20 AED
    expect(priceFor(size({ BHD: 2 }), "AED")).toBe(20);
    // 9.5 BHD ≈ 92.79 AED → 95 AED
    expect(priceFor(size({ BHD: 9.5 }), "AED")).toBe(95);
    const p = priceFor(size({ BHD: 7.25 }), "AED");
    expect(p % 5).toBe(0);
    expect(p).toBeGreaterThanOrEqual(7.25 * AED_PER_BHD);
  });

  it("falls back to the peg for a missing BHD price, rounded up to 0.500 BHD", () => {
    // 20 AED ≈ 2.048 BHD → 2.500 BHD
    expect(priceFor(size({ AED: 20 }), "BHD")).toBe(2.5);
    // 15 AED ≈ 1.536 BHD → 2.000 BHD
    expect(priceFor(size({ AED: 15 }), "BHD")).toBe(2);
    const p = priceFor(size({ AED: 33 }), "BHD");
    expect((p * 2) % 1).toBe(0);
    expect(p).toBeGreaterThanOrEqual(33 / AED_PER_BHD);
  });

  it("ignores a non-finite explicit price and uses the peg instead", () => {
    expect(priceFor(size({ BHD: 2, AED: Number.NaN }), "AED")).toBe(20);
  });

  it("uses the fixed USD-peg cross rate", () => {
    expect(AED_PER_BHD).toBeCloseTo(9.767, 3);
  });
});
