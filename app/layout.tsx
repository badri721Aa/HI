import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'
import { Nav } from '@/components/nav'
import { PanicHide } from '@/components/panic-hide'

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
    <html lang="en">
      <body className={`${inter.variable} ${nacelle.variable} bg-gray-950 font-inter text-base text-gray-200 antialiased`}>
        <div className="flex min-h-screen flex-col overflow-hidden supports-[overflow:clip]:overflow-clip">
          <PanicHide />
          <Nav />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
