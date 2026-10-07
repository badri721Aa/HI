import type { CategoryId, ColorOption, L10n, MaterialInfo, Product } from "@/types";

/*
 * SAMPLE CATALOG — replace with the real products, prices and stock.
 * Prices are per unit. BHD uses 3 decimals (e.g. 9.5 → 9.500 BHD).
 * Every product renders in 3D from its `model` kind; no image files needed.
 */

const c = (id: string, en: string, ar: string, hex: string, finish: ColorOption["finish"] = "matte"): ColorOption => ({
  id,
  name: { en, ar },
  hex,
  finish,
});

const BONE = c("bone", "Bone", "عظمي", "#E6E0D4");
const GRAPHITE = c("graphite", "Graphite", "جرافيت", "#3A3A41");
const SAND = c("sand", "Sand", "رملي", "#CDB89B");
const SAGE = c("sage", "Sage", "مريمية", "#9DAA95");
const CLAY = c("clay", "Clay", "طيني", "#B4664B");

export const CATEGORIES: { id: CategoryId; name: L10n }[] = [
  { id: "lighting", name: { en: "Lighting", ar: "إضاءة" } },
  { id: "vessels", name: { en: "Vessels", ar: "أوانٍ" } },
  { id: "desk", name: { en: "Desk", ar: "مكتب" } },
  { id: "objects", name: { en: "Objects", ar: "قطع فنية" } },
];

export const PRODUCTS: Product[] = [
  {
    slug: "mashrabiya-lamp",
    sku: "INF-LMP-01",
    name: { en: "Mashrabiya Lamp", ar: "مصباح المشربية" },
    tagline: {
      en: "An eight-point star lattice that throws its pattern across the room.",
      ar: "شبكة نجمة ثمانية ترسم ظلالها على جدران الغرفة.",
    },
    description: {
      en: "The lattice is printed as one piece, with no glue and no joins. Ships wired with a warm 2700K LED bulb and a 2 m fabric cable with an inline switch.",
      ar: "تُطبع الشبكة قطعة واحدة بلا لصق ولا وصلات. يصلك المصباح موصولاً بلمبة LED دافئة 2700K وسلك قماشي بطول مترين مع مفتاح.",
    },
    category: "lighting",
    model: "lattice-lamp",
    material: "pla-matte",
    colors: [BONE, GRAPHITE, CLAY],
    sizes: [
      { id: "table", name: { en: "Table", ar: "طاولة" }, dims: { w: 140, d: 140, h: 240 }, price: { BHD: 18, AED: 180 } },
      { id: "large", name: { en: "Large", ar: "كبير" }, dims: { w: 180, d: 180, h: 320 }, price: { BHD: 26, AED: 255 } },
    ],
    stock: null,
    leadTimeDays: [3, 5],
    printHours: 19,
    layerHeight: 0.16,
    badge: "new",
    featured: true,
  },
  {
    slug: "ripple-vase",
    sku: "INF-VAS-01",
    name: { en: "Ripple Vase", ar: "مزهرية التموّج" },
    tagline: {
      en: "Twelve soft ridges, twisted a quarter turn from base to lip.",
      ar: "اثنا عشر تموّجاً ناعماً تلتف ربع دورة من القاعدة إلى الحافة.",
    },
    description: {
      en: "Printed as one continuous spiral wall, so the outside has no seam. Made for dried stems; add a glass liner if you want fresh flowers.",
      ar: "يُطبع جداراً حلزونياً متصلاً فلا يظهر أي خط وصل من الخارج. مناسب للزهور المجففة، وأضف إناءً زجاجياً داخلياً للزهور الطبيعية.",
    },
    category: "vessels",
    model: "ripple-vase",
    material: "pla-matte",
    colors: [BONE, GRAPHITE, SAND, SAGE],
    sizes: [
      { id: "s", name: { en: "Small", ar: "صغير" }, dims: { w: 120, d: 120, h: 160 }, price: { BHD: 6.5, AED: 65 } },
      { id: "m", name: { en: "Medium", ar: "وسط" }, dims: { w: 150, d: 150, h: 220 }, price: { BHD: 9.5, AED: 95 } },
      { id: "l", name: { en: "Large", ar: "كبير" }, dims: { w: 180, d: 180, h: 300 }, price: { BHD: 13.5, AED: 135 } },
    ],
    stock: 6,
    leadTimeDays: [2, 3],
    printHours: 7,
    layerHeight: 0.2,
    featured: true,
  },
  {
    slug: "dune-bowl",
    sku: "INF-BWL-01",
    name: { en: "Dune Bowl", ar: "وعاء الكثبان" },
    tagline: {
      en: "Rippled like wind over sand. For keys, fruit, or nothing at all.",
      ar: "متموّج كأثر الريح على الرمل. للمفاتيح أو الفاكهة أو للزينة فقط.",
    },
    description: {
      en: "Silk PLA gives each ridge a metallic edge that shifts as you walk past. Wipe clean with a damp cloth.",
      ar: "يمنح الـPLA الحريري كل تموّج لمعة معدنية تتغير مع زاوية النظر. يُنظف بقطعة قماش رطبة.",
    },
    category: "vessels",
    model: "wave-bowl",
    material: "pla-silk",
    colors: [
      c("silk-sand", "Silk Sand", "رملي حريري", "#D6C09F", "silk"),
      c("silk-silver", "Silk Silver", "فضي حريري", "#C9CDD3", "silk"),
      c("silk-copper", "Silk Copper", "نحاسي حريري", "#B8794A", "silk"),
    ],
    sizes: [
      { id: "m", name: { en: "Medium", ar: "وسط" }, dims: { w: 200, d: 200, h: 70 }, price: { BHD: 9, AED: 90 } },
      { id: "l", name: { en: "Large", ar: "كبير" }, dims: { w: 260, d: 260, h: 90 }, price: { BHD: 14, AED: 140 } },
    ],
    stock: 4,
    leadTimeDays: [2, 3],
    printHours: 8,
    layerHeight: 0.2,
  },
  {
    slug: "facet-planter",
    sku: "INF-PLT-01",
    name: { en: "Facet Planter", ar: "أصيص الأوجه" },
    tagline: {
      en: "Low-poly planter with a drainage hole and a matching saucer.",
      ar: "أصيص بأوجه هندسية مع فتحة تصريف وصحن مطابق.",
    },
    description: {
      en: "Sized for succulents and small indoor plants. The saucer is printed separately so water never sits against the pot.",
      ar: "مناسب للصباريات والنباتات الداخلية الصغيرة. يُطبع الصحن منفصلاً حتى لا تتجمع المياه حول الأصيص.",
    },
    category: "vessels",
    model: "facet-planter",
    material: "pla-matte",
    colors: [BONE, GRAPHITE, CLAY],
    sizes: [
      { id: "s", name: { en: "Small", ar: "صغير" }, dims: { w: 100, d: 100, h: 90 }, price: { BHD: 4.5, AED: 45 } },
      { id: "m", name: { en: "Medium", ar: "وسط" }, dims: { w: 140, d: 140, h: 125 }, price: { BHD: 6, AED: 60 } },
      { id: "l", name: { en: "Large", ar: "كبير" }, dims: { w: 180, d: 180, h: 160 }, price: { BHD: 8.5, AED: 85 } },
    ],
    stock: 12,
    leadTimeDays: [1, 2],
    printHours: 5,
    layerHeight: 0.24,
  },
  {
    slug: "trefoil-knot",
    sku: "INF-OBJ-01",
    name: { en: "Trefoil Knot", ar: "العقدة الثلاثية" },
    tagline: {
      en: "The simplest knot in mathematics, cast in resin at 0.05 mm.",
      ar: "أبسط عقدة في الرياضيات، مطبوعة بالريزن بدقة 0.05 مم.",
    },
    description: {
      en: "Printed in resin, washed, UV-cured and hand-sanded, so layer lines all but disappear. Each run is limited to twenty pieces.",
      ar: "تُطبع بالريزن ثم تُغسل وتُعالج بالأشعة فوق البنفسجية وتُصقل يدوياً حتى تختفي خطوط الطبقات تقريباً. كل دفعة محدودة بعشرين قطعة.",
    },
    category: "objects",
    model: "knot-sculpture",
    material: "resin",
    colors: [c("pearl", "Pearl", "لؤلؤي", "#ECE7DF", "silk"), c("obsidian", "Obsidian", "أوبسيديان", "#18181C", "silk")],
    sizes: [
      { id: "s", name: { en: "Small", ar: "صغير" }, dims: { w: 90, d: 90, h: 60 }, price: { BHD: 7.5, AED: 75 } },
      { id: "m", name: { en: "Medium", ar: "وسط" }, dims: { w: 140, d: 140, h: 90 }, price: { BHD: 12, AED: 120 } },
    ],
    stock: null,
    leadTimeDays: [2, 4],
    printHours: 9,
    layerHeight: 0.05,
    badge: "limited",
  },
  {
    slug: "twist-pen-cup",
    sku: "INF-DSK-01",
    name: { en: "Twist Pen Cup", ar: "حامل الأقلام الملتوي" },
    tagline: {
      en: "A hexagon rotated sixty degrees on its way up.",
      ar: "سداسي يدور ستين درجة وهو يرتفع.",
    },
    description: {
      en: "Weighted base so it doesn't tip when you grab a pen. Fits standard pens, scissors and a 30 cm ruler.",
      ar: "قاعدة ثقيلة فلا ينقلب عند سحب القلم. يتسع للأقلام والمقص ومسطرة 30 سم.",
    },
    category: "desk",
    model: "spiral-cup",
    material: "pla-silk",
    colors: [
      c("silk-silver", "Silk Silver", "فضي حريري", "#C9CDD3", "silk"),
      c("silk-copper", "Silk Copper", "نحاسي حريري", "#B8794A", "silk"),
      c("silk-pearl", "Silk Pearl", "لؤلؤي حريري", "#ECE7DF", "silk"),
    ],
    sizes: [{ id: "one", name: { en: "One size", ar: "مقاس واحد" }, dims: { w: 85, d: 85, h: 110 }, price: { BHD: 3.5, AED: 35 } }],
    stock: 20,
    leadTimeDays: [1, 2],
    printHours: 3,
    layerHeight: 0.2,
  },
  {
    slug: "arc-phone-stand",
    sku: "INF-DSK-02",
    name: { en: "Arc Phone Stand", ar: "حامل الهاتف القوسي" },
    tagline: {
      en: "Holds a phone at 65°, with a channel for the charging cable.",
      ar: "يحمل الهاتف بزاوية 65° مع مجرى لسلك الشحن.",
    },
    description: {
      en: "Printed in PETG, which handles heat better than PLA, so it is fine on a sunny desk. Fits phones up to 85 mm wide, with or without a case.",
      ar: "مطبوع من PETG الذي يتحمل الحرارة أكثر من PLA، فلا مشكلة على مكتب مشمس. يناسب الهواتف حتى عرض 85 مم مع الغطاء أو بدونه.",
    },
    category: "desk",
    model: "arc-stand",
    material: "petg",
    colors: [GRAPHITE, BONE, c("ice", "Ice", "ثلجي", "#CFE6EA", "translucent")],
    sizes: [{ id: "one", name: { en: "One size", ar: "مقاس واحد" }, dims: { w: 80, d: 90, h: 120 }, price: { BHD: 4, AED: 40 } }],
    stock: 15,
    leadTimeDays: [1, 2],
    printHours: 2.5,
    layerHeight: 0.2,
  },
  {
    slug: "hex-coasters",
    sku: "INF-OBJ-02",
    name: { en: "Hex Coasters", ar: "قواعد أكواب سداسية" },
    tagline: {
      en: "Flexible TPU coasters that grip the table and the glass.",
      ar: "قواعد مرنة من TPU تثبت على الطاولة وتمسك الكوب.",
    },
    description: {
      en: "Concentric ridges keep condensation off the table. Dishwasher-safe on the top rack.",
      ar: "التموجات الدائرية تمنع وصول قطرات التكثف إلى الطاولة. آمنة في الرف العلوي لغسالة الصحون.",
    },
    category: "objects",
    model: "hex-coaster",
    material: "tpu",
    colors: [GRAPHITE, SAND, SAGE],
    sizes: [
      { id: "set-4", name: { en: "Set of 4", ar: "طقم ٤ قطع" }, dims: { w: 100, d: 87, h: 6 }, price: { BHD: 5, AED: 50 } },
      { id: "set-6", name: { en: "Set of 6", ar: "طقم ٦ قطع" }, dims: { w: 100, d: 87, h: 6 }, price: { BHD: 7, AED: 70 } },
    ],
    stock: 10,
    leadTimeDays: [1, 2],
    printHours: 4,
    layerHeight: 0.2,
  },
];

export const MATERIALS: MaterialInfo[] = [
  {
    id: "pla-matte",
    name: { en: "PLA Matte", ar: "PLA مطفي" },
    summary: {
      en: "Plant-based, crisp detail, a soft stone-like surface. Keep it out of parked cars in summer.",
      ar: "مصنوع من مصادر نباتية، تفاصيل حادة وسطح ناعم يشبه الحجر. أبعده عن السيارة المتوقفة في الصيف.",
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
    id: "resin",
    name: { en: "Resin", ar: "ريزن" },
    summary: {
      en: "UV-cured at 0.05 mm layers. Lines you can barely see, edges you can feel.",
      ar: "يُعالج بالأشعة فوق البنفسجية بطبقات 0.05 مم. خطوط بالكاد تُرى وحواف دقيقة.",
    },
    scores: { strength: 3, detail: 5, heat: 2, flex: 1 },
    heatC: 60,
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
