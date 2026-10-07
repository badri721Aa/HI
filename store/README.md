# Infill — 3D-printed objects storefront

A bilingual (English / Arabic) storefront for a 3D-printing shop in Bahrain and the UAE.

- Every product is rendered live in 3D from code, so there are no model files to upload.
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
| WhatsApp reply hours | `lib/site.ts` → `HOURS` |
| Products, prices, stock, colours, sizes | `content/catalog.ts` |
| Materials | `content/catalog.ts` → `MATERIALS` |
| Customer reviews (section hidden while empty) | `content/reviews.ts` |
| All site text (English and Arabic) | `lib/i18n/messages/*.ts` |
| Colours, fonts, spacing | `app/globals.css` (`@theme`) and `app/fonts.ts` |

Values marked `CONFIRM` in `lib/site.ts` are sensible defaults (hours, delivery days). Check them against how the shop really works. The catalog is sample data: replace it with real products, prices and stock before launch.

### Adding a product

Add an entry to `PRODUCTS` in `content/catalog.ts`.

- Each product picks a `model` (one of the procedural 3D shapes in `components/3d/geometry.ts`), a material, colours (hex) and sizes.
- Each size has outer dimensions in mm and a price per currency.
- BHD uses 3 decimals (`9.5` → `9.500 BHD`); AED uses 2.
- The product page, sitemap, Open Graph image and structured data are generated automatically.

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
