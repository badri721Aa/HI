import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Static site, no external scripts/analytics/remote images — so this can
// stay tight without a per-request nonce (which would force every page
// into dynamic rendering just for a marketing/tutorial site).
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  frame-src 'none';
  worker-src 'none';
  manifest-src 'self';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

// Not set: Cross-Origin-Embedder-Policy. require-corp would add real
// isolation but can silently break Vercel's own preview tooling on
// non-production deployments — not worth it for a static content site
// with no sensitive per-user data to isolate.
const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), " +
      "gyroscope=(), magnetometer=(), accelerometer=(), fullscreen=(self), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    sri: {
      algorithm: "sha256",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // The chat API has nothing worth crawling or caching, and no
        // reason to ever be indexed as a "page".
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
