import { describe, expect, it } from "vitest";
import type { Region, WhatsAppLineId } from "@/types";
import {
  MAX_WHATSAPP_URL_LENGTH,
  generateWhatsAppLink,
  isWithinUrlLimit,
  resolveLine,
} from "@/lib/whatsapp";

/** The `text` query parameter, decoded exactly as WhatsApp will read it. */
function textOf(link: string): string | null {
  return new URL(link).searchParams.get("text");
}

describe("generateWhatsAppLink", () => {
  it("builds https://wa.me/<digits>?text=<encodeURIComponent(message)>", () => {
    const msg = "Hi, I'd like to place an order.";
    expect(generateWhatsAppLink("+973 3985 8885", msg)).toBe(
      `https://wa.me/97339858885?text=${encodeURIComponent(msg)}`,
    );
  });

  it("cleans the phone number the same way as toWaDigits", () => {
    expect(generateWhatsAppLink("00971 050 464 4502", "x")).toBe("https://wa.me/971504644502?text=x");
    expect(generateWhatsAppLink("(+973) 6366-9666", "x")).toBe("https://wa.me/97363669666?text=x");
  });

  it("leaves out the text parameter when there is no message", () => {
    expect(generateWhatsAppLink("+973 3985 8885")).toBe("https://wa.me/97339858885");
    expect(generateWhatsAppLink("+973 3985 8885", "")).toBe("https://wa.me/97339858885");
    expect(generateWhatsAppLink("+973 3985 8885", "   \n ")).toBe("https://wa.me/97339858885");
  });

  it("encodes newlines as %0A", () => {
    const link = generateWhatsAppLink("+97339858885", "line 1\nline 2");
    expect(link).toBe("https://wa.me/97339858885?text=line%201%0Aline%202");
    expect(link).not.toContain("\n");
  });

  it("escapes characters that would otherwise break the query string", () => {
    const msg = "Tom & Jerry #1? 2+2 *bold* 100% a=b";
    const link = generateWhatsAppLink("+97339858885", msg);
    const query = link.split("?text=")[1];
    for (const raw of ["&", "#", "?", "+", " ", "="]) expect(query).not.toContain(raw);
    // encodeURIComponent keeps "*" literal, and WhatsApp reads it as bold markup (intended).
    expect(query).toContain("*bold*");
    expect(query).toContain("%26"); // &
    expect(query).toContain("%23"); // #
    expect(query).toContain("%3F"); // ?
    expect(query).toContain("%2B"); // +
    expect(textOf(link)).toBe(msg);
  });

  it("round-trips Arabic, emoji-free punctuation and mixed scripts", () => {
    const msg = "مرحباً، أرغب في تقديم طلب.\n*طلب رقم 3DBH-7K3Q2*\n1.500 د.ب — iPhone 15 Pro";
    const link = generateWhatsAppLink("+971504644502", msg);
    expect(link.startsWith("https://wa.me/971504644502?text=")).toBe(true);
    // Only URL-safe ASCII in the link itself.
    expect(link).toMatch(/^[\x21-\x7E]+$/);
    expect(textOf(link)).toBe(msg);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe(msg);
  });

  it("throws when there is no phone number", () => {
    expect(() => generateWhatsAppLink("", "hello")).toThrow();
    expect(() => generateWhatsAppLink("   ", "hello")).toThrow();
    expect(() => generateWhatsAppLink("+", "hello")).toThrow();
  });
});

describe("resolveLine", () => {
  const id = (region?: Region | null, line?: WhatsAppLineId | null) => resolveLine(region, line).id;

  it("defaults Bahrain to the primary line", () => {
    expect(id("BH")).toBe("bh-primary");
    expect(resolveLine("BH").e164).toBe("+97339858885");
  });

  it("honours the second Bahrain line in Bahrain", () => {
    expect(id("BH", "bh-secondary")).toBe("bh-secondary");
    expect(resolveLine("BH", "bh-secondary").e164).toBe("+97363669666");
    expect(id("BH", "bh-primary")).toBe("bh-primary");
  });

  it("routes the UAE to its own line and ignores Bahrain lines there", () => {
    expect(id("AE")).toBe("ae");
    expect(id("AE", "bh-secondary")).toBe("ae");
    expect(id("AE", "bh-primary")).toBe("ae");
    expect(resolveLine("AE").e164).toBe("+971504644502");
  });

  it("ignores the UAE line for Bahrain", () => {
    expect(id("BH", "ae")).toBe("bh-primary");
  });

  it("falls back to Bahrain when the region is unknown", () => {
    expect(id(null)).toBe("bh-primary");
    expect(id(undefined)).toBe("bh-primary");
    expect(id(null, "bh-secondary")).toBe("bh-secondary");
    expect(id("XX" as Region)).toBe("bh-primary");
  });

  it("returns lines that belong to the region they serve", () => {
    for (const region of ["BH", "AE"] as const) {
      for (const line of [undefined, "bh-primary", "bh-secondary", "ae"] as const) {
        expect(resolveLine(region, line).region).toBe(region);
      }
    }
  });
});

describe("isWithinUrlLimit", () => {
  it("accepts URLs up to MAX_WHATSAPP_URL_LENGTH characters", () => {
    expect(MAX_WHATSAPP_URL_LENGTH).toBe(4000);
    expect(isWithinUrlLimit("x".repeat(MAX_WHATSAPP_URL_LENGTH))).toBe(true);
    expect(isWithinUrlLimit("x".repeat(MAX_WHATSAPP_URL_LENGTH + 1))).toBe(false);
    expect(isWithinUrlLimit(generateWhatsAppLink("+97339858885", "hi"))).toBe(true);
  });

  it("measures the encoded length, which is what grows with Arabic text", () => {
    const arabic = "ب".repeat(700);
    const link = generateWhatsAppLink("+97339858885", arabic);
    // Each Arabic letter is two UTF-8 bytes → six characters once percent-encoded.
    expect(link.length).toBe("https://wa.me/97339858885?text=".length + 700 * 6);
    expect(isWithinUrlLimit(link)).toBe(false);
  });
});
