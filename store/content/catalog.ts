import type { CategoryId, ColorOption, L10n, MaterialInfo, Product } from "@/types";

/*
 * THE CATALOG. Real products, photographed by the shop.
 * - Prices are per piece. BHD uses 3 decimals (2 → 2.000 BHD).
 * - CONFIRM: AED prices are converted from BHD at the fixed peg and rounded.
 *   Set them to whatever the UAE line actually charges.
 * - Photos live in /public/products (cropped 4:5; the first image is the cover).
 * - `stock: null` = made to order. Set a number to show "N ready to ship".
 */

const c = (id: string, en: string, ar: string, hex: string, hex2?: string): ColorOption => ({
  id,
  name: { en, ar },
  hex,
  hex2,
  finish: "matte",
});

const img = (
  src: string,
  width: number,
  height: number,
  blurDataURL: string,
  alt: L10n,
): Product["images"][number] => ({ src, width, height, blurDataURL, alt });

export const CATEGORIES: { id: CategoryId; name: L10n }[] = [
  { id: "cases", name: { en: "Phone cases", ar: "كفرات الجوال" } },
  { id: "fidgets", name: { en: "Fidgets", ar: "ألعاب الفدجت" } },
  { id: "gifts", name: { en: "Gifts", ar: "هدايا" } },
  { id: "education", name: { en: "School models", ar: "مجسمات مدرسية" } },
];

export const PRODUCTS: Product[] = [
  {
    slug: "hex-phone-case",
    sku: "LU-CASE-01",
    name: { en: "Hex Phone Case", ar: "كفر الخلايا السداسية" },
    tagline: {
      en: "A honeycomb back in two shades of blue, with a grippy textured finish.",
      ar: "ظهر بنقشة خلايا النحل بدرجتين من الأزرق، بملمس خشن يمنع الانزلاق.",
    },
    description: {
      en: "Printed to fit your iPhone, with cut-outs for the buttons and the camera. Tell us your model when you add it to your order. Other colours on request.",
      ar: "يُطبع ليناسب جهاز الآيفون الخاص بك، مع فتحات للأزرار والكاميرا. اكتب موديل جهازك عند إضافته إلى الطلب. ألوان أخرى متوفرة عند الطلب.",
    },
    category: "cases",
    colors: [c("sky-blue", "Sky blue", "أزرق سماوي", "#4fa3db", "#a9d3f0")],
    sizes: [{ id: "fitted", name: { en: "Fitted to your iPhone", ar: "حسب موديل الآيفون" }, price: { BHD: 2, AED: 20 } }],
    variantNote: {
      label: { en: "iPhone model", ar: "موديل الآيفون" },
      placeholder: { en: "e.g. iPhone 15", ar: "مثال: iPhone 15" },
      required: true,
    },
    images: [
      img("/products/hex-phone-case.webp", 920, 1150, "data:image/webp;base64,UklGRmwAAABXRUJQVlA4IGAAAACQAgCdASoKAAwAAoBCJbACdEcAfoACEyG9Roa7AAD+lyni1+6aridi3vkuV+D7CUs2TwVa2itC/CUzRXc5uuqnx1fIAQlMwdRjKY0uAJmE3zgYZLukwT/mfy8av5kAAAA=", {
        en: "Blue 3D-printed iPhone case with a raised hexagon pattern, held in a hand",
        ar: "كفر آيفون أزرق مطبوع ثلاثي الأبعاد بنقشة سداسية بارزة في يد",
      }),
    ],
    stock: null,
    featured: true,
  },
  {
    slug: "keycap-clicker",
    sku: "LU-FDG-01",
    name: { en: "Keycap Clicker", ar: "ميدالية الكيكاب" },
    tagline: {
      en: "A keyboard key on your keyring. Press it as often as you like.",
      ar: "زر كيبورد في ميداليتك. اضغطه كلما أردت.",
    },
    description: {
      en: "A fidget clicker the size of a single key, on a metal chain and split ring. Small enough for a school bag or a set of car keys.",
      ar: "كليكر بحجم زر واحد، مع سلسلة وحلقة معدنية. صغير بما يكفي لحقيبة المدرسة أو مفاتيح السيارة.",
    },
    category: "fidgets",
    colors: [c("yellow", "Yellow", "أصفر", "#f2b300")],
    sizes: [{ id: "one", name: { en: "One size", ar: "مقاس واحد" }, price: { BHD: 1, AED: 10 } }],
    images: [
      img("/products/keycap-clicker.webp", 800, 1000, "data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADQAQCdASoKAAwAAoBCJQBOgB5PG8rQAAD+eMDs/rlqTJhielKq0caJ0vdm32DMqXe0mujEPB1URKYBV5CPTz+xgvHXx8MAAAA=", {
        en: "Yellow 3D-printed keycap clicker on a metal keyring",
        ar: "ميدالية كيكاب صفراء مطبوعة ثلاثية الأبعاد مع حلقة معدنية",
      }),
    ],
    stock: null,
  },
  {
    slug: "gear-shifter",
    sku: "LU-FDG-02",
    name: { en: "Gear Shifter", ar: "القير المصغّر" },
    tagline: {
      en: "A palm-sized H-pattern shifter: five gears and reverse on a diamond-knurled base.",
      ar: "قير بنمط H بحجم الكف: خمس سرعات والرجوع (R)، على قاعدة بنقشة الألماس.",
    },
    description: {
      en: "A desk fidget for car people. The red knob moves through the gate just like the real thing.",
      ar: "لعبة مكتبية لعشاق السيارات. المقبض الأحمر يتنقل بين السرعات كأنه قير حقيقي.",
    },
    category: "fidgets",
    colors: [c("black-red", "Black & red", "أسود وأحمر", "#1c1c20", "#e0322b")],
    sizes: [{ id: "one", name: { en: "One size", ar: "مقاس واحد" }, price: { BHD: 1, AED: 10 } }],
    images: [
      img("/products/gear-shifter.webp", 440, 550, "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAADwAQCdASoKAAwAAoBCJQBWABuyFXK6xAAA/hj6WByq2+5yYOHDkZtz0jiDLkn4W657J7lI0/tfizDgR22uCgbPJYPz4CEQ9ERRNCNZZhSfsR70K3PgAA==", {
        en: "Black 3D-printed gear shifter with a red knob and a diamond-pattern base",
        ar: "قير مصغّر أسود مطبوع ثلاثي الأبعاد بمقبض أحمر وقاعدة بنقشة الألماس",
      }),
      img("/products/gear-shifter-set.webp", 674, 450, "data:image/webp;base64,UklGRkoAAABXRUJQVlA4ID4AAACQAQCdASoKAAcAAoBCJZwAAlbbcTgA/sBRsY7tdHLzIKdQVxHjyTGj2q/GrLcP1AguUdXkZpfi2AJvs8agAA==", {
        en: "Three gear shifters side by side on the printer bed",
        ar: "ثلاثة قيرات مصغّرة جنباً إلى جنب على سطح الطابعة",
      }),
    ],
    stock: null,
  },
  {
    slug: "dumpling-steamer",
    sku: "LU-GFT-01",
    name: { en: "Dumpling in a Steamer", ar: "دمبلنغ في سلة البخار" },
    tagline: {
      en: "A smiling dumpling that hides under the lid of its own little steamer basket.",
      ar: "دمبلنغ مبتسم يختبئ تحت غطاء سلة البخار الصغيرة.",
    },
    description: {
      en: "Printed in three colours: a pink dumpling with a printed face, inside a bamboo-coloured steamer with a lift-off lid. Small enough to sit in your palm.",
      ar: "مطبوع بثلاثة ألوان: دمبلنغ وردي بوجه مطبوع داخل سلة بلون الخيزران بغطاء يُرفع. صغير بحجم راحة اليد.",
    },
    category: "gifts",
    colors: [c("pink-bamboo", "Pink & bamboo", "وردي وخيزراني", "#e8506a", "#e3cc98")],
    sizes: [{ id: "small", name: { en: "Small", ar: "صغير" }, price: { BHD: 1.5, AED: 15 } }],
    images: [
      img("/products/dumpling-steamer.webp", 640, 800, "data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAAAQAgCdASoKAAwAAoBCJQBOgCKKiSZltaAAAP7tLt+lA1VKWaAbSAN6wbSRDYKHX7D9e6J1jJm2zVPQ4RRIDSmf5V+O/0x2ABrO0ccPGH0tiBW9xdGrRFM4AAA=", {
        en: "Pink 3D-printed dumpling with a smiling face peeking out of a bamboo-coloured steamer",
        ar: "دمبلنغ وردي مبتسم مطبوع ثلاثي الأبعاد يطل من سلة بخار بلون الخيزران",
      }),
    ],
    stock: null,
  },
  {
    slug: "plant-cell-model",
    sku: "LU-EDU-01",
    name: { en: "Plant Cell Model", ar: "مجسم الخلية النباتية" },
    tagline: {
      en: "A four-colour plant cell with the nucleus, chloroplasts and vacuole in relief.",
      ar: "خلية نباتية بأربعة ألوان، تبرز فيها النواة والبلاستيدات الخضراء والفجوة العصارية.",
    },
    description: {
      en: "Made for science class and school projects. The cell wall, membrane, cytoplasm and organelles are raised, colour-coded parts you can point to.",
      ar: "مصمم لحصص العلوم والمشاريع المدرسية. جدار الخلية والغشاء والسيتوبلازم والعضيات أجزاء بارزة وملونة يسهل الإشارة إليها وشرحها.",
    },
    category: "education",
    colors: [c("multicolour", "Multicolour", "متعدد الألوان", "#2fae68", "#f2c230")],
    sizes: [{ id: "one", name: { en: "One size", ar: "مقاس واحد" }, price: { BHD: 3, AED: 30 } }],
    images: [
      img("/products/plant-cell-model.webp", 1000, 1250, "data:image/webp;base64,UklGRnQAAABXRUJQVlA4IGgAAAAQAgCdASoKAAwAAoBCJbACdAERH2jvxWHgAP7vkRy16+lT40XYZx8YvKsyt8M8zihU7F9e/5k7DUbipUqvvVUsIoWT6+1xb9MYnnln6+nZ7aS9/KxwjTtUuL+5DniBuvZAI88GhcqQAA==", {
        en: "Multicolour 3D-printed plant cell model with raised organelles",
        ar: "مجسم خلية نباتية متعدد الألوان مطبوع ثلاثي الأبعاد بعضيات بارزة",
      }),
    ],
    stock: null,
  },
];

/** CONFIRM: remove any material the shop doesn't print with. */
export const MATERIALS: MaterialInfo[] = [
  {
    id: "pla-matte",
    name: { en: "PLA", ar: "PLA" },
    summary: {
      en: "Plant-based, crisp detail, a soft matte surface. The default for most pieces. Keep it out of parked cars in summer.",
      ar: "مصنوع من مصادر نباتية، تفاصيل حادة وسطح مطفي ناعم. الخيار الأساسي لمعظم القطع. أبعده عن السيارة المتوقفة في الصيف.",
    },
    scores: { strength: 3, detail: 4, heat: 2, flex: 1 },
    heatC: 55,
  },
  {
    id: "pla-silk",
    name: { en: "Silk PLA", ar: "PLA حريري" },
    summary: {
      en: "A metallic sheen that catches light along every layer line.",
      ar: "لمعة معدنية تلتقط الضوء على امتداد كل طبقة.",
    },
    scores: { strength: 2, detail: 3, heat: 2, flex: 1 },
    heatC: 55,
  },
  {
    id: "petg",
    name: { en: "PETG", ar: "PETG" },
    summary: {
      en: "Tougher and more heat tolerant. The right call for anything near a window or in a car.",
      ar: "أقوى وأكثر تحملاً للحرارة. الخيار الأنسب لأي قطعة قرب النافذة أو داخل السيارة.",
    },
    scores: { strength: 4, detail: 3, heat: 3, flex: 2 },
    heatC: 75,
  },
  {
    id: "tpu",
    name: { en: "TPU", ar: "TPU" },
    summary: {
      en: "Rubber-like and grippy. Bends, squashes and springs back.",
      ar: "مرن كالمطاط ومانع للانزلاق. ينثني ويعود لشكله.",
    },
    scores: { strength: 4, detail: 2, heat: 3, flex: 5 },
    heatC: 60,
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getMaterial(id: MaterialInfo["id"]): MaterialInfo {
  const m = MATERIALS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown material: ${id}`);
  return m;
}
