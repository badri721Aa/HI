'use client'

import { useEffect, useRef } from 'react'

function extractVideoId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/)
  return m ? m[1] : null
}

function extractHandle(url: string): string | null {
  const m = url.match(/@([^/]+)/)
  return m ? m[1] : null
}

export function TikTokEmbed({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const videoId = extractVideoId(url)
  const handle = extractHandle(url)

  useEffect(() => {
    const scriptId = 'tiktok-embed-script'
    if (document.getElementById(scriptId)) {
      ;(window as unknown as { tiktokEmbedLoad?: () => void }).tiktokEmbedLoad?.()
      return
    }
    const s = document.createElement('script')
    s.id = scriptId
    s.src = 'https://www.tiktok.com/embed.js'
    s.async = true
    document.body.appendChild(s)
  }, [])

  if (!videoId || !handle) return null

  return (
    <div ref={ref} className="card overflow-hidden">
      <blockquote
        className="tiktok-embed"
        cite={url}
        data-video-id={videoId}
        style={{ maxWidth: '100%', minWidth: '280px', margin: 0 }}
      >
        <section>
          <a target="_blank" rel="noopener noreferrer" title={`@${handle}`} href={`https://www.tiktok.com/@${handle}?refer=embed`}>
            @{handle}
          </a>
        </section>
      </blockquote>
    </div>
  )
}
