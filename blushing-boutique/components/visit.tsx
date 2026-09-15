import { boutique, googleMapsUrl } from '@/lib/content'

export function Visit() {
  const q = encodeURIComponent(
    `${boutique.address.line1}, ${boutique.address.line2}, ${boutique.address.city}, ${boutique.address.country}`,
  )
  const embedUrl = `https://www.google.com/maps?q=${q}&output=embed`

  return (
    <section id="visit" className="mx-auto max-w-6xl px-5 md:px-8 py-20 md:py-28">
      <header className="text-center mb-12">
        <p className="serif italic text-[color:var(--color-rose-deep)] mb-2">Visit us</p>
        <h2 className="text-3xl md:text-4xl">The Riffa store</h2>
        <div className="gold-line w-24 mx-auto my-5" />
      </header>

      <div className="grid md:grid-cols-2 gap-8 items-stretch">
        <div className="card overflow-hidden aspect-[4/3] md:aspect-auto min-h-[320px]">
          <iframe
            title="Blushing Boutique — Riffa location"
            src={embedUrl}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>

        <div className="card p-8 md:p-10 flex flex-col justify-between">
          <div>
            <p className="text-xs tracking-[0.35em] text-[color:var(--color-ink-soft)] mb-3">ADDRESS</p>
            <p className="serif text-xl md:text-2xl text-[color:var(--color-ink)] leading-snug">
              {boutique.address.line1}
              <br />
              {boutique.address.line2}
              <br />
              {boutique.address.city}, {boutique.address.country}
            </p>
            <div className="gold-line w-16 my-6" />
            <p className="text-xs tracking-[0.35em] text-[color:var(--color-ink-soft)] mb-3">HOURS</p>
            <ul className="space-y-1.5 text-[color:var(--color-ink)]">
              {boutique.hours.map((h) => (
                <li key={h.day} className="flex justify-between border-b border-dashed border-[color:var(--color-blush)]/40 pb-1.5 last:border-0">
                  <span className="text-sm">{h.day}</span>
                  <span className="text-sm tabular-nums text-[color:var(--color-ink-soft)]">
                    {h.open} — {h.close}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <a
            href={googleMapsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-cream)] px-6 py-3 text-sm hover:bg-[color:var(--color-rose-deep)] transition"
          >
            Get directions
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </section>
  )
}
