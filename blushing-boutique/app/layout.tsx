import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { boutique } from '@/lib/content'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: `${boutique.name} — ${boutique.tagline}`,
  description: boutique.bio,
  metadataBase: new URL('https://blushingbh.com'),
  openGraph: {
    title: boutique.name,
    description: boutique.bio,
    url: 'https://blushingbh.com',
    siteName: boutique.name,
    locale: 'en_BH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: boutique.name,
    description: boutique.bio,
  },
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  )
}
