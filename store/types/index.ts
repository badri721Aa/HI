export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const REGIONS = ["BH", "AE"] as const;
export type Region = (typeof REGIONS)[number];

export const CURRENCIES = ["BHD", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** A string translated into every supported locale. */
export type L10n = Record<Locale, string>;

export type CategoryId = "lighting" | "vessels" | "desk" | "objects";

/**
 * Procedural model used to render a product in 3D. Each kind maps to a
 * geometry builder in components/3d/geometry.ts, so products never need
 * downloaded mesh files.
 */
export type ModelKind =
  | "ripple-vase"
  | "lattice-lamp"
  | "facet-planter"
  | "spiral-cup"
  | "arc-stand"
  | "hex-coaster"
  | "knot-sculpture"
  | "wave-bowl";

export type MaterialId = "pla-matte" | "pla-silk" | "petg" | "resin" | "tpu";

export type Finish = "matte" | "silk" | "translucent";

export interface ColorOption {
  id: string;
  name: L10n;
  hex: string;
  finish: Finish;
}

export interface SizeOption {
  id: string;
  name: L10n;
  /** Outer dimensions in millimetres. */
  dims: { w: number; d: number; h: number };
  /** Price per unit in each currency. BHD uses 3 decimals, AED uses 2. */
  price: Record<Currency, number>;
}

export interface Product {
  slug: string;
  sku: string;
  name: L10n;
  tagline: L10n;
  description: L10n;
  category: CategoryId;
  model: ModelKind;
  material: MaterialId;
  colors: ColorOption[];
  sizes: SizeOption[];
  /** Units ready to ship. `null` means made to order. */
  stock: number | null;
  /** Production + finishing time range in days for made-to-order units. */
  leadTimeDays: [number, number];
  /** Print time for the default size, in hours. */
  printHours: number;
  /** Layer height in millimetres. */
  layerHeight: number;
  badge?: "new" | "limited";
  featured?: boolean;
}

export interface MaterialInfo {
  id: MaterialId;
  name: L10n;
  summary: L10n;
  /** 1–5 relative scores used by the materials section. */
  scores: { strength: number; detail: number; heat: number; flex: number };
  /** Glass-transition / heat-deflection guide in °C. */
  heatC: number;
}

/** One line item in the order (cart). */
export interface OrderLine {
  slug: string;
  colorId: string;
  sizeId: string;
  qty: number;
}

export interface Customer {
  name: string;
  phone?: string;
  city: string;
  area?: string;
  notes?: string;
}

export type WhatsAppLineId = "bh-primary" | "bh-secondary" | "ae";

export interface WhatsAppLine {
  id: WhatsAppLineId;
  region: Region;
  /** E.164 formatted number, e.g. +97339858885 */
  e164: string;
  /** Human formatted number, e.g. +973 3985 8885 */
  display: string;
  label: L10n;
}
