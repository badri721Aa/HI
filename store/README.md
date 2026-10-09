# 3D BH — 3D-printing storefront

A bilingual (English / Arabic) storefront for 3D BH, a 3D-printing shop in Bahrain and the UAE.

- Products are shown with real photos. The brand moments are live 3D, rendered from code with no model files to upload: a vase printing in the hero, the "How it's made" scroll story, and the 404 page.
- Orders are sent as a pre-filled WhatsApp message to the right line:

| Region | Line | Number |
| --- | --- | --- |
| Bahrain | Line 1 | +973 3985 8885 |
| Bahrain | Line 2 | +973 6366 9666 |
| UAE | — | +971 50 464 4502 |

Built with Next.js 16 (App Router, cache components), React Three Fiber, Tailwind CSS v4, Motion and Lenis. Deployed on Vercel.

## Run it locally

```bash
cd store
npm install
npm run dev          # http://localhost:3000  → redirects to /en or /ar
```

| Command | What it does |
| --- | --- |
| `npm run build` | production build |
| `npm run start` | serve the production build |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | unit tests (Vitest) |
| `npm run test:e2e` | end-to-end tests (Playwright; run `npm run build` first) |

## Change the business details

| What | Where |
| --- | --- |
| Brand name, order-number prefix | `lib/site.ts` → `site` |
| WhatsApp numbers | `lib/site.ts` → `WHATSAPP_LINES` |
| Cities per region, delivery days, delivery fee, VAT rate | `lib/site.ts` → `REGION_CONFIG` |
| Show VAT on orders (only if VAT-registered) | `lib/site.ts` → `vat.enabled` |
| WhatsApp reply hours | `lib/site.ts` → `HOURS`. They stay hidden (no schedule, no "Replying now") until you set `HOURS_CONFIRMED = true` |
| A note for customers, e.g. a holiday closure (shown in the order drawer and the delivery section) | `lib/site.ts` → `NOTICE` (`null` hides it) |
| Products, prices, stock, colours, sizes, photos | `content/catalog.ts` (each photo is `"cutout"` for the edited cover or `"original"` for your own photo; the gallery labels them) |
| Materials | `content/catalog.ts` → `MATERIALS` |
| Customer reviews (section hidden while empty) | `content/reviews.ts` |
| All site text (English and Arabic) | `lib/i18n/messages/*.ts` |
| Colours, fonts, spacing | `app/globals.css` (`@theme`) and `app/fonts.ts` |

Values marked `CONFIRM` in `lib/site.ts` and `content/catalog.ts` are defaults to check against how the shop really works (hours, delivery days, AED prices, materials).

### Adding a product

1. Put the photo in `public/products/` as a 4:5 portrait WebP (about 1000×1250), cropped close around the piece.
2. Add an entry to `PRODUCTS` in `content/catalog.ts` with the photo, colours (hex; `hex2` for two-tone), sizes and a price per currency. BHD uses 3 decimals (`1.5` → `1.500 BHD`); AED uses 2.
3. Optional fields appear on the product page only when you fill them: dimensions per size, material, layer height, print time, lead time, stock.
4. If customers must tell you something per item (like their iPhone model), add a `variantNote`. It becomes a required field and is printed in the WhatsApp order.
5. For the social-media preview card, also add a small PNG copy of the photo to `assets/og-photos/<slug>.png` (social cards can't read WebP).

The product page, sitemap, social card and structured data are generated automatically.

## How ordering works

1. The visitor adds pieces to their order (saved in their browser).
2. In the order drawer they choose Bahrain or UAE (prices switch between BHD and AED), pick a WhatsApp line (Bahrain has two), and enter their name and city.
3. They see a live preview of the exact message, then press **Send order on WhatsApp**. This opens `https://wa.me/<number>?text=<message>`: the WhatsApp app on phones, WhatsApp Web on desktop.
4. Nothing is sent until they press send in WhatsApp. Price, payment and delivery are confirmed in the chat.

The first visit guesses the region from Vercel's IP-country header (`proxy.ts` / `app/api/region`). The visitor can always switch.

## Deploying on Vercel

The app lives in the `store/` folder of this repository, so the Vercel project uses **Root Directory = `store`**.

### Custom domain

In Vercel → Project → Settings → Domains, add your domain. Then set these records at your registrar. Vercel shows the exact values for your domain in that panel; these are the usual ones:

| Host | Type | Value |
| --- | --- | --- |
| `@` (apex, e.g. `example.com`) | `A` | `76.76.21.21` |
| `www` | `CNAME` | `cname.vercel-dns-0.com` |

Vercel issues and renews the HTTPS certificate automatically. After the domain is live, set the environment variable `NEXT_PUBLIC_SITE_URL=https://your-domain` and redeploy, so canonical URLs, the sitemap and social previews use it.

## Project layout

| Path | Contents |
| --- | --- |
| `app/[lang]/` | pages (home, product pages, 404, errors, OG images) for `en` and `ar` |
| `components/3d/` | procedural geometry, print shader, shared canvas, viewers |
| `components/sections/` | home page sections |
| `components/commerce/` | product cards, quick view, order drawer, WhatsApp checkout |
| `components/layout/` | header and footer |
| `lib/whatsapp/` | number cleaning, message builder, link builder, validation |
| `lib/i18n/` | dictionaries and helpers |
| `tests/` | Vitest unit tests and Playwright end-to-end tests |
