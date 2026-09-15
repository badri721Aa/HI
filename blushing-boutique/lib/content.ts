export const boutique = {
  name: 'Blushing Boutique',
  tagline: 'Elevated everyday elegance, from Bahrain.',
  bio:
    'A curated Bahraini boutique of refined pieces — chosen one by one, kept in season, worn every day. Visit us in Riffa, or slide into our DMs.',

  address: {
    line1: 'Block No. 913, Bukhara',
    line2: 'Building No. 634, Road No. 1311',
    city: 'Riffa',
    country: 'Kingdom of Bahrain',
  },

  contact: {
    email: 'Info@blushing-boutique.com',
    whatsapp: '97333179279',
    whatsappDisplay: '+973 3317 9279',
  },

  socials: {
    tiktok: {
      handle: 'blushing.bh',
      url: 'https://www.tiktok.com/@blushing.bh',
    },
    snapchat: {
      handle: 'bx301a',
      url: 'https://www.snapchat.com/@bx301a',
      addUrl: 'https://www.snapchat.com/add/bx301a',
    },
  },

  hours: [
    { day: 'Sun – Thu', open: '10:00', close: '22:00' },
    { day: 'Fri', open: '16:00', close: '22:00' },
    { day: 'Sat', open: '10:00', close: '22:00' },
  ],
} as const

/**
 * Paste your TikTok video URLs here — copy the full URL from any TikTok post
 * (right-click the video → "Copy link" or share sheet).
 * Format must be: https://www.tiktok.com/@blushing.bh/video/<numeric-id>
 * Each entry renders as an embedded, tappable TikTok card in the gallery.
 */
export const tiktokVideos: string[] = [
  // 'https://www.tiktok.com/@blushing.bh/video/7000000000000000000',
  // 'https://www.tiktok.com/@blushing.bh/video/7000000000000000001',
  // 'https://www.tiktok.com/@blushing.bh/video/7000000000000000002',
]

export const whatsappLink = (message?: string) =>
  `https://wa.me/${boutique.contact.whatsapp}${
    message ? `?text=${encodeURIComponent(message)}` : ''
  }`

export const googleMapsUrl = () => {
  const q = encodeURIComponent(
    `${boutique.address.line1}, ${boutique.address.line2}, ${boutique.address.city}, ${boutique.address.country}`,
  )
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}
