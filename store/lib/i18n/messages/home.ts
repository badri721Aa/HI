import { defineMessages } from "../config";

/** Copy for the home page sections. */
export const home = defineMessages({
  en: {
    hero: {
      eyebrow: "3D-printed objects · Bahrain & UAE",
      titleLines: ["Objects,", "printed layer", "by layer."],
      body: "Phone cases, fidget toys, gifts and school models, printed to order. Pick a piece, send the order on WhatsApp, and we deliver across Bahrain and the UAE.",
      hud: {
        printing: "Printing",
        complete: "Complete",
        layer: "Layer",
        layerHeight: "Layer height",
        nozzle: "Nozzle",
        material: "Material",
        timeLeft: "Time left",
        /** Remaining print time, e.g. "6h 05m". */
        time: "{h}h {m}m",
      },
      scroll: "Scroll",
    },
    collection: {
      eyebrow: "Collection",
      title: "Printed to order, in small batches.",
      body: "Real photos of real prints. Pick a piece and the price follows your region.",
      all: "All",
      count: "{n} pieces",
      from: "From",
      colours: "{n} colours",
      sizes: "{n} sizes",
      empty: "Nothing in this category yet.",
    },
    process: {
      eyebrow: "How it's made",
      title: "From file to your door in four steps.",
      steps: [
        {
          title: "Model",
          body: "Each piece starts as a parametric model, tuned until the walls, curves and tolerances are right for printing.",
          meta: "Wall 1.2 mm · Tolerance ±0.2 mm",
        },
        {
          title: "Slice",
          body: "The model is cut into hundreds of layers, 0.05 to 0.24 mm thick, and the nozzle's path is planned for every one.",
          meta: "1,500 layers for the lamp",
        },
        {
          title: "Print",
          body: "A nozzle at 210°C lays each layer down, switching colours mid-print when a piece needs more than one. Small pieces take under an hour; bigger ones run through the night.",
          meta: "0.4 mm nozzle · 210°C",
        },
        {
          title: "Finish",
          body: "Supports come off, edges are cleaned, and every piece is checked before it is packed and handed to the courier.",
          meta: "Checked by hand",
        },
      ],
    },
    materials: {
      eyebrow: "Materials",
      title: "Four materials, each for a reason.",
      body: "PLA for detail, silk PLA for shine, PETG for heat, TPU for grip.",
      scores: { strength: "Strength", detail: "Detail", heat: "Heat", flex: "Flex" },
      softens: "Softens around {n}°C",
      heatNote: "Bahrain and UAE summers are hard on plastics. Anything meant for a car or a sunny window, we print in PETG.",
    },
    delivery: {
      eyebrow: "Ordering & delivery",
      title: "Order on WhatsApp. Delivered across Bahrain and the UAE.",
      steps: [
        { title: "Pick", body: "Choose a piece, colour and size, and add it to your order." },
        { title: "Send", body: "Your order opens in WhatsApp as a ready-made message. Press send." },
        { title: "Confirm", body: "We reply to confirm the price, colour and delivery date, then start printing." },
      ],
      lines: "WhatsApp",
      days: "Delivered {min}–{max} days after your piece is ready",
      fee: "Delivery fee confirmed in the chat",
      /** Used only when REGION_CONFIG sets a flat deliveryFee. */
      feeFlat: "Delivery fee: {amount}",
      coverage: {
        BH: "Manama, Muharraq, Riffa and every other area.",
        AE: "Dubai, Abu Dhabi, Sharjah and all seven emirates.",
      },
      hours: "WhatsApp hours",
    },
    reviews: {
      eyebrow: "From customers",
      title: "What people say.",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Questions, answered.",
      items: [
        {
          q: "How do I pay?",
          a: "Payment options are confirmed in the WhatsApp chat when you place your order.",
        },
        {
          q: "How long does an order take?",
          a: "Pieces marked as ready ship within a day or two. Made-to-order pieces show their production time on the product, plus delivery.",
        },
        {
          q: "Which iPhone models do the cases fit?",
          a: "Each case is printed for one model. Type yours when you add the case to your order and we'll confirm it in the chat before printing.",
        },
        {
          q: "Can I get a different colour or size?",
          a: "Usually, yes. Most pieces can be printed in any colour we stock and scaled up or down. Ask in the chat.",
        },
        {
          q: "Will it melt in the heat?",
          a: "PLA softens around 55°C, which a parked car in summer easily passes. Indoors it is fine. For cars, balconies or sunny windows we print in PETG.",
        },
        {
          q: "Can you print my own file?",
          a: "Yes. Send an STL, 3MF or OBJ file in the WhatsApp chat, or a photo with measurements and we can model it for you.",
        },
        {
          q: "Do you deliver outside Bahrain and the UAE?",
          a: "Not yet. If you are elsewhere in the GCC, message us and we will see what we can do.",
        },
      ],
    },
  },
  ar: {
    hero: {
      eyebrow: "قطع مطبوعة ثلاثية الأبعاد · البحرين والإمارات",
      titleLines: ["قطعٌ تُطبع", "طبقةً", "فوق طبقة."],
      body: "كفرات جوال وألعاب فدجت وهدايا ومجسمات مدرسية تُطبع عند الطلب. اختر قطعتك وأرسل طلبك عبر واتساب، ونوصله إليك في البحرين والإمارات.",
      hud: {
        printing: "جارٍ الطباعة",
        complete: "اكتملت",
        layer: "الطبقة",
        layerHeight: "سماكة الطبقة",
        nozzle: "الفوهة",
        material: "الخامة",
        timeLeft: "الوقت المتبقي",
        time: "{h} س {m} د",
      },
      scroll: "مرّر",
    },
    collection: {
      eyebrow: "المجموعة",
      title: "تُطبع عند الطلب، بكميات صغيرة.",
      body: "صور حقيقية لقطع مطبوعة فعلاً. اختر قطعتك والسعر يتبع منطقتك.",
      all: "الكل",
      count: "{n} قطع",
      from: "من",
      colours: "{n} ألوان",
      sizes: "{n} مقاسات",
      empty: "لا توجد قطع في هذه الفئة بعد.",
    },
    process: {
      eyebrow: "كيف نصنعها",
      title: "من الملف إلى بابك في أربع خطوات.",
      steps: [
        {
          title: "النمذجة",
          body: "تبدأ كل قطعة بنموذج بارامتري نضبطه حتى تصبح الجدران والانحناءات والتفاوتات مناسبة للطباعة.",
          meta: "سماكة الجدار 1.2 مم · تفاوت ±0.2 مم",
        },
        {
          title: "التقطيع",
          body: "يُقسَّم النموذج إلى مئات الطبقات بسماكة بين 0.05 و0.24 مم، ويُخطَّط مسار الفوهة لكل طبقة.",
          meta: "1,500 طبقة للمصباح",
        },
        {
          title: "الطباعة",
          body: "تضع فوهة بحرارة 210°م كل طبقة فوق الأخرى، وتبدّل اللون أثناء الطباعة حين تحتاج القطعة أكثر من لون. القطع الصغيرة تُطبع في أقل من ساعة، والكبيرة تستمر طوال الليل.",
          meta: "فوهة 0.4 مم · 210°م",
        },
        {
          title: "التشطيب",
          body: "نزيل الدعامات وننظف الحواف ونفحص كل قطعة قبل تغليفها وتسليمها للمندوب.",
          meta: "فحص يدوي",
        },
      ],
    },
    materials: {
      eyebrow: "الخامات",
      title: "أربع خامات، لكلٍ منها سبب.",
      body: "PLA للتفاصيل، وPLA الحريري للمعان، وPETG للحرارة، وTPU للمرونة.",
      scores: { strength: "المتانة", detail: "التفاصيل", heat: "الحرارة", flex: "المرونة" },
      softens: "يلين عند نحو {n}°م",
      heatNote: "صيف البحرين والإمارات قاسٍ على البلاستيك. أي قطعة للسيارة أو لنافذة مشمسة نطبعها من PETG.",
    },
    delivery: {
      eyebrow: "الطلب والتوصيل",
      title: "اطلب عبر واتساب، ونوصل في البحرين والإمارات.",
      steps: [
        { title: "اختر", body: "اختر القطعة واللون والمقاس وأضفها إلى طلبك." },
        { title: "أرسل", body: "يفتح طلبك في واتساب كرسالة جاهزة. اضغط إرسال." },
        { title: "نؤكد", body: "نرد لتأكيد السعر واللون وموعد التوصيل، ثم نبدأ الطباعة." },
      ],
      lines: "واتساب",
      days: "التوصيل خلال {min}–{max} أيام بعد تجهيز القطعة",
      fee: "رسوم التوصيل تُؤكد في المحادثة",
      feeFlat: "رسوم التوصيل: {amount}",
      coverage: {
        BH: "المنامة والمحرق والرفاع وجميع المناطق.",
        AE: "دبي وأبوظبي والشارقة وجميع الإمارات السبع.",
      },
      hours: "ساعات واتساب",
    },
    reviews: {
      eyebrow: "من عملائنا",
      title: "ماذا يقولون.",
    },
    faq: {
      eyebrow: "الأسئلة الشائعة",
      title: "أسئلة وأجوبة.",
      items: [
        {
          q: "كيف أدفع؟",
          a: "نؤكد طرق الدفع في محادثة واتساب عند تقديم طلبك.",
        },
        {
          q: "كم يستغرق الطلب؟",
          a: "القطع الجاهزة تُشحن خلال يوم أو يومين. أما القطع التي تُصنع عند الطلب فمدة تجهيزها مذكورة في صفحة المنتج، يضاف إليها وقت التوصيل.",
        },
        {
          q: "ما موديلات الآيفون التي تناسبها الكفرات؟",
          a: "يُطبع كل كفر لموديل واحد. اكتب موديل جهازك عند إضافة الكفر إلى طلبك، وسنؤكده معك في المحادثة قبل الطباعة.",
        },
        {
          q: "هل يمكن تغيير اللون أو المقاس؟",
          a: "غالباً نعم. يمكن طباعة معظم القطع بأي لون متوفر لدينا وتكبيرها أو تصغيرها. اسألنا في المحادثة.",
        },
        {
          q: "هل تذوب القطع في الحر؟",
          a: "يلين الـPLA عند نحو 55°م، وهي حرارة تتجاوزها السيارة المتوقفة في الصيف بسهولة. داخل المنزل لا مشكلة. للسيارات والشرفات والنوافذ المشمسة نطبع من PETG.",
        },
        {
          q: "هل تطبعون ملفاتي الخاصة؟",
          a: "نعم. أرسل ملف STL أو 3MF أو OBJ في محادثة واتساب، أو صورة مع المقاسات ونصمم النموذج لك.",
        },
        {
          q: "هل توصلون خارج البحرين والإمارات؟",
          a: "ليس بعد. إن كنت في دولة خليجية أخرى راسلنا وسنرى ما يمكننا فعله.",
        },
      ],
    },
  },
});
