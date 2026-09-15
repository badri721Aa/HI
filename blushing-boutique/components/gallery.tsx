import { boutique, tiktokVideos } from '@/lib/content'
import { TikTokEmbed } from './tiktok-embed'

export function Gallery() {
  return (
    <section id="gallery" className="mx-auto max-w-6xl px-5 md:px-8 py-20 md:py-28">
      <header className="text-center mb-14">
        <p className="serif italic text-[color:var(--color-rose-deep)] mb-2">Lookbook</p>
        <h2 className="text-3xl md:text-4xl">Latest from our TikTok</h2>
        <div className="gold-line w-24 mx-auto my-5" />
        <p className="text-[color:var(--color-ink-soft)] max-w-xl mx-auto">
          Weekly drops, styling notes, and a peek into the store — follow{' '}
          <a
            href={boutique.socials.tiktok.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--color-rose-deep)] underline decoration-[color:var(--color-blush)] underline-offset-4"
          >
            @{boutique.socials.tiktok.handle}
          </a>{' '}
          for the full feed.
        </p>
      </header>

      {tiktokVideos.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tiktokVideos.map((url) => (
            <TikTokEmbed key={url} url={url} />
          ))}
        </div>
      )}

      <div className="text-center mt-12">
        <a
          href={boutique.socials.tiktok.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-ink)]/20 bg-white/70 text-[color:var(--color-ink)] px-6 py-3 text-sm hover:bg-white transition"
        >
          See more on TikTok
          <span aria-hidden>↗</span>
        </a>
      </div>
    </section>
  )
}

function EmptyState() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="card aspect-[9/16] flex flex-col items-center justify-center text-center p-6 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              background:
                'linear-gradient(135deg, #fdf7f4 0%, #f7ece5 45%, #f5c9c1 100%)',
              backgroundSize: '200% 200%',
              animation: 'shimmer 3.5s linear infinite',
            }}
          />
          <div className="relative">
            <p className="serif text-3xl italic text-[color:var(--color-rose-deep)] mb-3">Coming</p>
            <p className="text-xs tracking-[0.3em] text-[color:var(--color-ink-soft)]">SOON</p>
          </div>
        </div>
      ))}
    </div>
  )
}
