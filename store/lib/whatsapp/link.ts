import type { Region, WhatsAppLine, WhatsAppLineId } from "@/types";
import { REGION_CONFIG, WHATSAPP_LINES } from "@/lib/site";
import { toWaDigits } from "./phone";

export const DEFAULT_REGION: Region = "BH";

/**
 * wa.me handles long links, but some in-app browsers truncate URLs past
 * ~4k characters. Order forms cap free text so links stay under this.
 */
export const MAX_WHATSAPP_URL_LENGTH = 4000;

/**
 * Picks the WhatsApp line to send to. Falls back to the region's default
 * line when the requested line is missing or belongs to another region, and
 * to Bahrain when the region itself is unknown.
 */
export function resolveLine(region?: Region | null, lineId?: WhatsAppLineId | null): WhatsAppLine {
  const config = REGION_CONFIG[region ?? DEFAULT_REGION] ?? REGION_CONFIG[DEFAULT_REGION];
  if (lineId && config.lines.includes(lineId)) return WHATSAPP_LINES[lineId];
  return WHATSAPP_LINES[config.defaultLine];
}

/** https://wa.me/97339858885?text=… — opens the app on mobile, WhatsApp Web on desktop. */
export function generateWhatsAppLink(phone: string, message?: string): string {
  const digits = toWaDigits(phone);
  if (!digits) throw new Error("A phone number is required to build a WhatsApp link");
  const base = `https://wa.me/${digits}`;
  return message && message.trim() ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function isWithinUrlLimit(url: string): boolean {
  return url.length <= MAX_WHATSAPP_URL_LENGTH;
}
