import { boutique } from '@/lib/content'

export function Footer() {
  return (
    <footer className="bg-[color:var(--color-ink)] text-[color:var(--color-cream)]">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-14">
        <div className="grid md:grid-cols-3 gap-10">
          <div>
            <p className="serif text-3xl italic text-[color:var(--color-blush)]">{boutique.name}</p>
            <div className="gold-line w-16 my-4" />
            <p className="text-sm text-[color:var(--color-cream)]/70 leading-relaxed max-w-xs">
              {boutique.bio}
            </p>
          </div>

          <div>
            <p className="text-xs tracking-[0.35em] text-[color:var(--color-blush)] mb-4">STORE</p>
            <p className="text-sm text-[color:var(--color-cream)]/80 leading-relaxed">
              {boutique.address.line1}
              <br />
              {boutique.address.line2}
              <br />
              {boutique.address.city}, {boutique.address.country}
            </p>
          </div>

          <div>
            <p className="text-xs tracking-[0.35em] text-[color:var(--color-blush)] mb-4">FOLLOW</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={boutique.socials.tiktok.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[color:var(--color-blush)] transition"
                >
                  TikTok — @{boutique.socials.tiktok.handle}
                </a>
              </li>
              <li>
                <a
                  href={boutique.socials.snapchat.addUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[color:var(--color-blush)] transition"
                >
                  Snapchat — @{boutique.socials.snapchat.handle}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${boutique.contact.email}`}
                  className="hover:text-[color:var(--color-blush)] transition"
                >
                  {boutique.contact.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="gold-line w-full mt-14 mb-6 opacity-40" />
        <p className="text-xs text-[color:var(--color-cream)]/50 text-center">
          © {new Date().getFullYear()} {boutique.name}. Made in Bahrain.
        </p>
      </div>
    </footer>
  )
}
