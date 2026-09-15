import { boutique } from '@/lib/content'

export function About() {
  return (
    <section id="about" className="relative py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-4xl px-5 md:px-8 text-center">
        <p className="serif italic text-[color:var(--color-rose-deep)] mb-2">Our story</p>
        <h2 className="text-3xl md:text-4xl mb-4">Chosen one piece at a time</h2>
        <div className="gold-line w-24 mx-auto my-6" />
        <p className="text-base md:text-lg text-[color:var(--color-ink-soft)] leading-relaxed">
          {boutique.name} is a Bahraini boutique built on a simple idea: bring in pieces
          we would wear ourselves. Every drop is small, every cut is checked in
          person, and every customer is welcomed by name. Whether you are shopping
          for a wedding season, a first day back, or something to put on for
          yourself — we would love to help you find it.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
          {[
            {
              title: 'Curated',
              body: 'Small drops, thoughtfully picked. Never a full warehouse.',
            },
            {
              title: 'Local',
              body: 'Made for Bahrain, delivered across the Kingdom.',
            },
            {
              title: 'Personal',
              body: 'DM us on WhatsApp — we style, we hold, we deliver.',
            },
          ].map((f) => (
            <div key={f.title} className="card p-8 text-left">
              <p className="serif text-2xl text-[color:var(--color-ink)] mb-2">{f.title}</p>
              <div className="gold-line w-10 my-3" />
              <p className="text-sm text-[color:var(--color-ink-soft)] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
