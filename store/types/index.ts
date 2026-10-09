export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const REGIONS = ["BH", "AE"] as const;
export type Region = (typeof REGIONS)[number];

export const CURRENCIES = ["BHD", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** A string translated into every supported locale. */
export type L10n = Record<Locale, string>;

export type CategoryId = "cases" | "fidgets" | "gifts" | "education";

/**
 * Procedural 3D models (components/3d/geometry.ts). Used for the brand
 * scenes (hero print, process, 404); products may optionally reference one.
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
  /** Second colour for two-tone / multicolour prints (swatch shows both). */
  hex2?: string;
  finish: Finish;
}

/** Outer dimensions in millimetres. */
export interface Dims {
  w: number;
  d: number;
  h: number;
}

export interface SizeOption {
  id: string;
  name: L10n;
  /** Outer dimensions in millimetres, when known. */
  dims?: Dims;
  /** Price per unit in each currency. BHD uses 3 decimals, AED uses 2. */
  price: Record<Currency, number>;
}

export interface ProductImage {
  /** Path under /public, e.g. /products/keycap-clicker.webp (4:5 for the cover). */
  src: string;
  width: number;
  height: number;
  /** Tiny base64 preview for next/image placeholder="blur". */
  blurDataURL: string;
  alt: L10n;
  /**
   * "cutout": the cover, with the background replaced and colours corrected.
   * "original": the shop's own photo, only cropped and resized.
   * The gallery labels each, so customers can tell them apart.
   */
  kind: "cutout" | "original";
}

/** A free-text detail the customer must give per item, e.g. their iPhone model. */
export interface VariantNote {
  label: L10n;
  placeholder: L10n;
  required?: boolean;
}

export interface Product {
  slug: string;
  sku: string;
  name: L10n;
  tagline: L10n;
  description: L10n;
  category: CategoryId;
  colors: ColorOption[];
  sizes: SizeOption[];
  /** Photos; the first is the cover. May be empty for 3D-only showcase pieces. */
  images: ProductImage[];
  /** Units ready to ship. `null` means made to order. */
  stock: number | null;
  /** Production time range in days for made-to-order units, when known. */
  leadTimeDays?: [number, number];
  variantNote?: VariantNote;
  /** Optional procedural 3D model. */
  model?: ModelKind;
  material?: MaterialId;
  /** Print time for the default size, in hours, when known. */
  printHours?: number;
  /** Layer height in millimetres, when known. */
  layerHeight?: number;
  badge?: "new" | "limited";
  featured?: boolean;
}

/** A 3D brand piece (hero print, process, 404): always has a model and sizes with dims. */
export type ShowcaseProduct = Omit<Product, "model" | "material" | "layerHeight" | "sizes"> & {
  model: ModelKind;
  material: MaterialId;
  layerHeight: number;
  sizes: (SizeOption & { dims: Dims })[];
};

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
  /** Answer to the product's variantNote (e.g. "iPhone 15 Pro"). */
  note?: string;
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
