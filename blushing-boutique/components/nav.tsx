import { boutique, whatsappLink } from '@/lib/content'

export function Nav() {
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-[color:var(--color-cream)]/70 border-b border-[color:var(--color-blush)]/40">
      <div className="mx-auto max-w-6xl px-5 md:px-8 h-16 flex items-center justify-between">
        <a href="#top" className="serif text-xl md:text-2xl tracking-wide text-[color:var(--color-ink)]">
          {boutique.name}
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm text-[color:var(--color-ink-soft)]">
          <a href="#gallery" className="hover:text-[color:var(--color-rose-deep)] transition">Lookbook</a>
          <a href="#about" className="hover:text-[color:var(--color-rose-deep)] transition">About</a>
          <a href="#visit" className="hover:text-[color:var(--color-rose-deep)] transition">Visit</a>
          <a href="#contact" className="hover:text-[color:var(--color-rose-deep)] transition">Contact</a>
        </div>
        <a
          href={whatsappLink('Hi Blushing, I have a question about a piece.')}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-2 rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-cream)] px-4 py-2 text-sm hover:bg-[color:var(--color-rose-deep)] transition"
        >
          <WhatsAppIcon className="w-4 h-4" />
          Chat
        </a>
      </div>
    </nav>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.298-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  )
}
