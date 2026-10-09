import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// lib/site.ts falls back to http://localhost:3000 for canonical, hreflang, OG,
// JSON-LD, sitemap and robots URLs when neither variable is set (Vercel sets
// the second). Make that loud on any production build or start.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PUBLIC_SITE_URL &&
  !process.env.VERCEL_PROJECT_PRODUCTION_URL
) {
  console.warn(
    "\n[3D BH] Warning: NEXT_PUBLIC_SITE_URL is not set, so canonical URLs, the sitemap, robots.txt, " +
      "Open Graph tags and JSON-LD will point at http://localhost:3000. Set it to the public origin, " +
      "e.g. NEXT_PUBLIC_SITE_URL=https://3dbh.vercel.app\n",
  );
}

/**
 * Static-friendly CSP (no nonces, which would force dynamic rendering).
 * Inline scripts are needed for Next's bootstrap and JSON-LD.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    // AVIF first (smallest), WebP for browsers without AVIF.
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    globalNotFound: true,
  },
  turbopack: {
    // The parent repo has its own lockfile; pin the root to this app.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // Product photos keep their file names when replaced, so cache for a
        // week (not forever) and revalidate in the background.
        source: "/products/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
