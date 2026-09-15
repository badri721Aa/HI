import { boutique, whatsappLink } from '@/lib/content'

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="gradient-blush absolute inset-0 -z-10" />
      <div className="absolute inset-0 -z-10 opacity-40" style={{
        background:
          'radial-gradient(600px circle at 15% 20%, rgba(255,255,255,0.7), transparent 60%), radial-gradient(500px circle at 85% 60%, rgba(217,138,127,0.35), transparent 60%)',
      }} />

      <div className="mx-auto max-w-6xl px-5 md:px-8 pt-16 md:pt-28 pb-20 md:pb-32">
        <div className="grid md:grid-cols-[1.15fr_0.85fr] gap-10 md:gap-16 items-center">
          <div className="animate-[fade-up_0.7s_cubic-bezier(0.22,1,0.36,1)_both]">
            <p className="serif italic text-[color:var(--color-rose-deep)] tracking-wide mb-4">
              Est. Bahrain — Riffa
            </p>
            <h1 className="serif text-5xl md:text-6xl leading-[1.05] text-[color:var(--color-ink)]">
              {boutique.tagline.split(',')[0]},
              <br />
              <span className="italic text-[color:var(--color-rose-deep)]">from Bahrain.</span>
            </h1>
            <div className="gold-line w-32 my-6" />
            <p className="text-base md:text-lg text-[color:var(--color-ink-soft)] max-w-xl leading-relaxed">
              {boutique.bio}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#gallery"
                className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-cream)] px-6 py-3 text-sm hover:bg-[color:var(--color-rose-deep)] transition"
              >
                View the lookbook
                <span aria-hidden>→</span>
              </a>
              <a
                href={whatsappLink('Hi Blushing, I would like to place an order.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-ink)]/20 bg-white/60 text-[color:var(--color-ink)] px-6 py-3 text-sm hover:bg-white transition"
              >
                Order on WhatsApp
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-[color:var(--color-blush)]/40 shadow-[0_30px_80px_-30px_rgba(181,106,95,0.5)]">
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center px-6">
                  <div className="serif text-6xl italic text-[color:var(--color-rose-deep)] mb-4">B</div>
                  <p className="serif text-2xl text-[color:var(--color-ink)]">Blushing</p>
                  <p className="text-sm tracking-[0.35em] text-[color:var(--color-ink-soft)] mt-1">
                    BOUTIQUE
                  </p>
                  <div className="gold-line w-24 mx-auto my-5" />
                  <p className="text-xs text-[color:var(--color-ink-soft)]">
                    New arrivals every week
                  </p>
                </div>
              </div>
              <div className="absolute -top-6 -right-6 w-40 h-40 rounded-full bg-white/60 blur-2xl" />
              <div className="absolute -bottom-6 -left-6 w-40 h-40 rounded-full bg-[color:var(--color-rose)]/40 blur-2xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
