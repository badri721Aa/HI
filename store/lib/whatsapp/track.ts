import { track } from "@vercel/analytics";
import type { Currency, Locale, Region, WhatsAppLineId } from "@/types";

/*
 * Vercel Analytics events for the two WhatsApp sends. Only shape and size of
 * the request: never names, phone numbers, addresses or notes. Fire and
 * forget: a failure here must never get between the visitor and wa.me.
 */

export interface OrderSentEvent {
  region: Region;
  line: WhatsAppLineId;
  /** Pieces, counting quantities. */
  items: number;
  /** Distinct order lines. */
  lines: number;
  currency: Currency;
  subtotal: number;
  lang: Locale;
  /** The compact receipt (no SKUs or dimensions) was sent. */
  compact: boolean;
}

export interface CustomSentEvent {
  region: Region;
  line: WhatsAppLineId;
  lang: Locale;
}

function send(name: string, data: Record<string, string | number | boolean>) {
  try {
    track(name, data);
  } catch {
    // Analytics blocked or not loaded: nothing to do.
  }
}

export function trackOrderSent(e: OrderSentEvent) {
  send("order_whatsapp", {
    region: e.region,
    line: e.line,
    items: e.items,
    lines: e.lines,
    currency: e.currency,
    subtotal: e.subtotal,
    lang: e.lang,
    compact: e.compact,
  });
}

export function trackCustomSent(e: CustomSentEvent) {
  send("custom_whatsapp", { region: e.region, line: e.line, lang: e.lang });
}
