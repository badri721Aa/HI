import { defineMessages } from "../config";

/** Metadata, footer and system pages (404, error, offline). */
export const siteCopy = defineMessages({
  en: {
    meta: {
      title: "3D-printed objects, made to order",
      description:
        "Phone cases, fidget toys, gifts and school models, 3D-printed to order. Order on WhatsApp with delivery across Bahrain and the UAE.",
      ogAlt: "A 3D-printed vase mid-print, layer lines glowing",
      productOgAlt: "A 3D-printed piece caught mid-print, with its price, material and size",
    },
    footer: {
      tagline: "3D-printed objects, made to order in small batches.",
      shop: "Shop",
      help: "Help",
      contact: "Contact",
      notify: {
        title: "New pieces, first.",
        body: "Get one WhatsApp message when we release something new. No spam, no lists sold.",
        button: "Notify me on WhatsApp",
        message: "Hi, please let me know when you release new pieces.",
      },
      privacy: "No tracking cookies. Orders go straight to WhatsApp.",
      rights: "© {year} {brand}. All rights reserved.",
    },
    notFound: {
      code: "404",
      title: "This page failed mid-print.",
      body: "The link may be old, or the page has moved. The collection is still here.",
      cta: "Back to the collection",
    },
    error: {
      title: "Something jammed.",
      body: "An error stopped this page from loading. Try again, or message us on WhatsApp and we'll help.",
      retry: "Try again",
    },
    offline: {
      title: "You're offline.",
      body: "Reconnect to browse the collection. You can still reach us on:",
    },
    /** Labels the desktop cursor ring shows over `data-cursor="<key>"` elements. */
    cursor: {
      view: "View",
      drag: "Drag",
      open: "Open",
    },
  },
  ar: {
    meta: {
      title: "قطع مطبوعة ثلاثية الأبعاد، تُصنع عند الطلب",
      description:
        "كفرات جوال وألعاب فدجت وهدايا ومجسمات مدرسية مطبوعة ثلاثية الأبعاد عند الطلب. اطلب عبر واتساب مع التوصيل في البحرين والإمارات.",
      ogAlt: "مزهرية أثناء الطباعة ثلاثية الأبعاد وخطوط طبقاتها مضيئة",
      productOgAlt: "قطعة مطبوعة ثلاثية الأبعاد أثناء طباعتها، مع سعرها وخامتها ومقاسها",
    },
    footer: {
      tagline: "قطع مطبوعة ثلاثية الأبعاد، تُصنع عند الطلب بكميات صغيرة.",
      shop: "المتجر",
      help: "المساعدة",
      contact: "تواصل معنا",
      notify: {
        title: "القطع الجديدة، أولاً.",
        body: "رسالة واحدة على واتساب عند إطلاق قطعة جديدة. بلا إزعاج.",
        button: "أبلغني عبر واتساب",
        message: "مرحباً، أرجو إبلاغي عند إطلاق قطع جديدة.",
      },
      privacy: "لا نستخدم ملفات تتبع. الطلبات تذهب مباشرة إلى واتساب.",
      rights: "© {year} {brand}. جميع الحقوق محفوظة.",
    },
    notFound: {
      code: "404",
      title: "توقفت طباعة هذه الصفحة في منتصفها.",
      body: "قد يكون الرابط قديماً أو نُقلت الصفحة. المجموعة ما زالت هنا.",
      cta: "العودة إلى المجموعة",
    },
    error: {
      title: "حدث تعطّل.",
      body: "منع خطأ ما تحميل هذه الصفحة. حاول مرة أخرى أو راسلنا على واتساب وسنساعدك.",
      retry: "حاول مرة أخرى",
    },
    offline: {
      title: "أنت غير متصل.",
      body: "أعد الاتصال لتصفح المجموعة. ويمكنك التواصل معنا على:",
    },
    cursor: {
      view: "عرض",
      drag: "اسحب",
      open: "فتح",
    },
  },
});
