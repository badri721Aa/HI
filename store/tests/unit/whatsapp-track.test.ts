import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@vercel/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

const { trackCustomSent, trackOrderSent } = await import("@/lib/whatsapp/track");

beforeEach(() => {
  track.mockReset();
});

describe("trackOrderSent", () => {
  it("sends order_whatsapp with the order's shape only", () => {
    trackOrderSent({
      region: "BH",
      line: "bh-secondary",
      items: 3,
      lines: 2,
      currency: "BHD",
      subtotal: 5,
      lang: "ar",
      compact: false,
    });
    expect(track).toHaveBeenCalledExactlyOnceWith("order_whatsapp", {
      region: "BH",
      line: "bh-secondary",
      items: 3,
      lines: 2,
      currency: "BHD",
      subtotal: 5,
      lang: "ar",
      compact: false,
    });
  });

  it("never forwards anything beyond the agreed fields (no names, phones, addresses or notes)", () => {
    const withExtras = {
      region: "AE",
      line: "ae",
      items: 1,
      lines: 1,
      currency: "AED",
      subtotal: 20,
      lang: "en",
      compact: true,
      name: "Fatima Ali",
      phone: "+973 3985 8885",
      area: "Block 338",
      notes: "Ring twice",
    } as const;
    trackOrderSent(withExtras);
    const [, data] = track.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(data).sort()).toEqual(["compact", "currency", "items", "lang", "line", "lines", "region", "subtotal"]);
    expect(JSON.stringify(data)).not.toMatch(/Fatima|3985|Block|Ring/);
  });

  it("never throws, so it can't block the link to WhatsApp", () => {
    track.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() =>
      trackOrderSent({ region: "BH", line: "bh-primary", items: 1, lines: 1, currency: "BHD", subtotal: 1, lang: "en", compact: false }),
    ).not.toThrow();
  });
});

describe("trackCustomSent", () => {
  it("sends custom_whatsapp with region, line and language", () => {
    trackCustomSent({ region: "AE", line: "ae", lang: "en" });
    expect(track).toHaveBeenCalledExactlyOnceWith("custom_whatsapp", { region: "AE", line: "ae", lang: "en" });
  });

  it("drops anything else it is handed", () => {
    trackCustomSent({ region: "BH", line: "bh-primary", lang: "ar", description: "x", name: "y" } as never);
    expect(track.mock.calls[0][1]).toEqual({ region: "BH", line: "bh-primary", lang: "ar" });
  });
});
