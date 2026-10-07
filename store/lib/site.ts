import type { Currency, L10n, Region, WhatsAppLine, WhatsAppLineId } from "@/types";

/**
 * Business configuration. Everything a shop owner is likely to change lives
 * here or in /content. Values marked CONFIRM are sensible defaults that
 * should be checked against how the business actually operates.
 */
export const site = {
  /** Brand name. Shown in the header, metadata and WhatsApp messages. */
  name: "Layer Up",
  /** Short code used in order references, e.g. LU-7K3Q2 */
  orderPrefix: "LU",
  url: resolveSiteUrl(),
  instagram: null as string | null,
  email: null as string | null,
} as const;

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const WHATSAPP_LINES: Record<WhatsAppLineId, WhatsAppLine> = {
  "bh-primary": {
    id: "bh-primary",
    region: "BH",
    e164: "+97339858885",
    display: "+973 3985 8885",
    label: { en: "Bahrain · Line 1", ar: "البحرين · الخط ١" },
  },
  "bh-secondary": {
    id: "bh-secondary",
    region: "BH",
    e164: "+97363669666",
    display: "+973 6366 9666",
    label: { en: "Bahrain · Line 2", ar: "البحرين · الخط ٢" },
  },
  ae: {
    id: "ae",
    region: "AE",
    e164: "+971504644502",
    display: "+971 50 464 4502",
    label: { en: "UAE", ar: "الإمارات" },
  },
};

export interface RegionConfig {
  id: Region;
  name: L10n;
  currency: Currency;
  /** IANA timezone for opening-hours checks. */
  timeZone: string;
  /** Line used when the customer has not picked one. */
  defaultLine: WhatsAppLineId;
  lines: WhatsAppLineId[];
  cities: { id: string; name: L10n }[];
  /** CONFIRM: delivery window in days after the piece is ready. */
  deliveryDays: [number, number];
  /** CONFIRM: flat delivery fee. `null` = quoted in the WhatsApp chat. */
  deliveryFee: number | null;
  /** Standard VAT rate. Only shown when `vat.enabled` is true. */
  vatRate: number;
}

export const REGION_CONFIG: Record<Region, RegionConfig> = {
  BH: {
    id: "BH",
    name: { en: "Bahrain", ar: "البحرين" },
    currency: "BHD",
    timeZone: "Asia/Bahrain",
    defaultLine: "bh-primary",
    lines: ["bh-primary", "bh-secondary"],
    cities: [
      { id: "manama", name: { en: "Manama", ar: "المنامة" } },
      { id: "muharraq", name: { en: "Muharraq", ar: "المحرق" } },
      { id: "riffa", name: { en: "Riffa", ar: "الرفاع" } },
      { id: "isa-town", name: { en: "Isa Town", ar: "مدينة عيسى" } },
      { id: "hamad-town", name: { en: "Hamad Town", ar: "مدينة حمد" } },
      { id: "juffair", name: { en: "Juffair", ar: "الجفير" } },
      { id: "seef", name: { en: "Seef", ar: "السيف" } },
      { id: "budaiya", name: { en: "Budaiya", ar: "البديع" } },
      { id: "saar", name: { en: "Saar", ar: "سار" } },
      { id: "sitra", name: { en: "Sitra", ar: "سترة" } },
      { id: "aali", name: { en: "A'ali", ar: "عالي" } },
      { id: "amwaj", name: { en: "Amwaj Islands", ar: "جزر أمواج" } },
      { id: "diyar", name: { en: "Diyar Al Muharraq", ar: "ديار المحرق" } },
      { id: "zallaq", name: { en: "Zallaq", ar: "الزلاق" } },
      { id: "other-bh", name: { en: "Other area", ar: "منطقة أخرى" } },
    ],
    deliveryDays: [1, 2],
    deliveryFee: null,
    vatRate: 0.1,
  },
  AE: {
    id: "AE",
    name: { en: "UAE", ar: "الإمارات" },
    currency: "AED",
    timeZone: "Asia/Dubai",
    defaultLine: "ae",
    lines: ["ae"],
    cities: [
      { id: "dubai", name: { en: "Dubai", ar: "دبي" } },
      { id: "abu-dhabi", name: { en: "Abu Dhabi", ar: "أبوظبي" } },
      { id: "sharjah", name: { en: "Sharjah", ar: "الشارقة" } },
      { id: "ajman", name: { en: "Ajman", ar: "عجمان" } },
      { id: "al-ain", name: { en: "Al Ain", ar: "العين" } },
      { id: "rak", name: { en: "Ras Al Khaimah", ar: "رأس الخيمة" } },
      { id: "fujairah", name: { en: "Fujairah", ar: "الفجيرة" } },
      { id: "uaq", name: { en: "Umm Al Quwain", ar: "أم القيوين" } },
    ],
    deliveryDays: [2, 4],
    deliveryFee: null,
    vatRate: 0.05,
  },
};

/** CONFIRM: only enable if the business is VAT-registered in the region. */
export const vat = { enabled: false } as const;

/**
 * CONFIRM: hours the WhatsApp lines are answered, in each region's local time.
 * Day indexes follow JavaScript: 0 = Sunday … 6 = Saturday.
 */
export const HOURS: Record<number, [open: string, close: string] | null> = {
  0: ["10:00", "22:00"],
  1: ["10:00", "22:00"],
  2: ["10:00", "22:00"],
  3: ["10:00", "22:00"],
  4: ["10:00", "22:00"],
  5: ["14:00", "22:00"],
  6: ["10:00", "22:00"],
};

/**
 * Both currencies are pegged to the US dollar (BHD 0.376, AED 3.6725), so the
 * cross rate is fixed and needs no live API. Used only when a product has no
 * explicit price in a currency.
 */
export const AED_PER_BHD = 3.6725 / 0.376;
