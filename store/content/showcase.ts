import type { ShowcaseProduct } from "@/types";

/*
 * 3D showcase pieces for the brand scenes (hero print, "How it's made", 404).
 * They are not for sale and never appear in the collection, sitemap or cart;
 * they exist so the site can show printing happening, layer by layer.
 */

const bone = { id: "bone", name: { en: "Bone", ar: "عظمي" }, hex: "#e6e0d4", finish: "matte" } as const;

export const SHOWCASE = {
  vase: {
    slug: "showcase-ripple-vase",
    sku: "SHOWCASE-VASE",
    name: { en: "Ripple vase", ar: "مزهرية متموجة" },
    tagline: { en: "", ar: "" },
    description: { en: "", ar: "" },
    category: "gifts",
    model: "ripple-vase",
    material: "pla-matte",
    colors: [bone],
    sizes: [{ id: "m", name: { en: "Medium", ar: "وسط" }, dims: { w: 150, d: 150, h: 220 }, price: { BHD: 0, AED: 0 } }],
    images: [],
    stock: null,
    printHours: 7,
    layerHeight: 0.2,
  },
  lamp: {
    slug: "showcase-lattice-lamp",
    sku: "SHOWCASE-LAMP",
    name: { en: "Lattice lamp", ar: "مصباح شبكي" },
    tagline: { en: "", ar: "" },
    description: { en: "", ar: "" },
    category: "gifts",
    model: "lattice-lamp",
    material: "pla-matte",
    colors: [bone, { id: "graphite", name: { en: "Graphite", ar: "جرافيت" }, hex: "#3a3a41", finish: "matte" }],
    sizes: [{ id: "table", name: { en: "Table", ar: "طاولة" }, dims: { w: 140, d: 140, h: 240 }, price: { BHD: 0, AED: 0 } }],
    images: [],
    stock: null,
    printHours: 19,
    layerHeight: 0.16,
  },
} satisfies Record<string, ShowcaseProduct>;
