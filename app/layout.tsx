import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'
import { PanicHide } from '@/components/panic-hide'

export const metadata: Metadata = {
  title: 'No Signal',
  description: '',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PanicHide />
        <Nav />
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
