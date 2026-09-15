import { boutique, whatsappLink } from '@/lib/content'

export function Contact() {
  return (
    <section id="contact" className="bg-[color:var(--color-cream-2)]">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-20 md:py-28">
        <header className="text-center mb-14">
          <p className="serif italic text-[color:var(--color-rose-deep)] mb-2">Say hi</p>
          <h2 className="text-3xl md:text-4xl">Reach the boutique</h2>
          <div className="gold-line w-24 mx-auto my-5" />
          <p className="text-[color:var(--color-ink-soft)] max-w-xl mx-auto">
            The fastest way to reach us is WhatsApp — we reply in minutes during store hours.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <ContactCard
            label="WhatsApp"
            value={boutique.contact.whatsappDisplay}
            href={whatsappLink()}
            highlight
          />
          <ContactCard
            label="Email"
            value={boutique.contact.email}
            href={`mailto:${boutique.contact.email}`}
          />
          <ContactCard
            label="TikTok"
            value={`@${boutique.socials.tiktok.handle}`}
            href={boutique.socials.tiktok.url}
          />
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-6">
          <ContactCard
            label="Snapchat"
            value={`@${boutique.socials.snapchat.handle}`}
            href={boutique.socials.snapchat.addUrl}
          />
          <ContactCard
            label="Store"
            value={`${boutique.address.city}, ${boutique.address.country}`}
            href="#visit"
          />
        </div>
      </div>
    </section>
  )
}

function ContactCard({
  label,
  value,
  href,
  highlight,
}: {
  label: string
  value: string
  href: string
  highlight?: boolean
}) {
  const isExternal = href.startsWith('http') || href.startsWith('mailto:')
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className={`card p-6 md:p-8 flex items-center justify-between group ${
        highlight ? 'bg-[color:var(--color-ink)] text-[color:var(--color-cream)]' : ''
      }`}
    >
      <div>
        <p className={`text-xs tracking-[0.35em] mb-2 ${highlight ? 'text-[color:var(--color-blush)]' : 'text-[color:var(--color-ink-soft)]'}`}>
          {label.toUpperCase()}
        </p>
        <p className={`serif text-xl md:text-2xl ${highlight ? 'text-[color:var(--color-cream)]' : 'text-[color:var(--color-ink)]'}`}>
          {value}
        </p>
      </div>
      <span
        aria-hidden
        className={`text-2xl transition-transform group-hover:translate-x-1 ${
          highlight ? 'text-[color:var(--color-cream)]' : 'text-[color:var(--color-rose-deep)]'
        }`}
      >
        →
      </span>
    </a>
  )
}
