import type { MetadataRoute } from "next";
import { getDictionary } from "@/lib/i18n";
import { site } from "@/lib/site";

/**
 * One manifest for both languages. start_url "/" goes through proxy.ts, which
 * sends each visitor to /en or /ar. Icons come from app/icon.tsx ("any") and
 * app/apple-icon.tsx (full-bleed, used as the maskable icon).
 */
export default function manifest(): MetadataRoute.Manifest {
  const en = getDictionary("en");
  const ar = getDictionary("ar");
  return {
    id: "/",
    name: `${site.name} — 3D-printed objects`,
    short_name: site.name,
    description: en.site.meta.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#020203",
    theme_color: "#020203",
    categories: ["shopping", "lifestyle"],
    lang: "en",
    dir: "ltr",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: en.common.nav.collection, url: "/en#collection" },
      { name: en.common.nav.custom, url: "/en#custom" },
      { name: ar.common.nav.collection, url: "/ar#collection" },
    ],
  };
}
