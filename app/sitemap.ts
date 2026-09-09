import type { MetadataRoute } from "next"

import { TUTORIALS } from "@/lib/tutorials"

const siteUrl = "https://nosignal.solar"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/tutorials`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/tools`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/glossary`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...TUTORIALS.map((t) => ({
      url: `${siteUrl}/tutorials/${t.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ]
}
