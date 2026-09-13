import type { NextConfig } from 'next'

const SUPABASE_HOST = 'gvxnzgogfaifmsdkingq.supabase.co'

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              `default-src 'self'`,
              `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
              `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
              `font-src 'self' https://fonts.gstatic.com`,
              `img-src 'self' data: blob: https://lh3.googleusercontent.com https://cdn.discordapp.com`,
              `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://accounts.google.com https://fonts.googleapis.com`,
              `frame-src 'none'`,
              `object-src 'none'`,
              `base-uri 'self'`,
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
