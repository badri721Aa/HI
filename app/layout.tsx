import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'
import { Nav } from '@/components/nav'
import { PanicHide } from '@/components/panic-hide'
import { TrollReceiver } from '@/components/troll-receiver'
import { AIWidget } from '@/components/ai-widget'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const nacelle = localFont({
  src: [
    { path: '../public/fonts/nacelle-regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/nacelle-italic.woff2', weight: '400', style: 'italic' },
    { path: '../public/fonts/nacelle-semibold.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/nacelle-semibolditalic.woff2', weight: '600', style: 'italic' },
  ],
  variable: '--font-nacelle',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Alhekma Cheating',
  description: 'School tools. Covert. Encrypted.',
  metadataBase: new URL('https://alhekma-cheating.vercel.app'),
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${nacelle.variable} bg-zinc-950 text-zinc-300 antialiased font-inter`}>
        <div className="relative min-h-screen">
          {/* Subtle ambient top glow */}
          <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-50" />
          <PanicHide />
          <TrollReceiver />
          <AIWidget />
          <Nav />
          <main className="min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
