/**
 * "Starfall Isle" feature card for the /games arcade page. Styled in that
 * page's language (zinc text, mono labels, hairline borders, rounded-2xl)
 * with the game's sunset amber as its single accent.
 */
import Link from 'next/link'

const TAGS = ['3D', 'Adventure', 'Keyboard · Gamepad · Touch']

export function StarfallFeaturedBanner() {
  return (
    <Link
      href="/games/starfall"
      className="group relative mb-8 block overflow-hidden rounded-2xl transition-[border-color] duration-200 hover:border-white/[0.14]"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="relative z-10 order-2 flex flex-col justify-center p-6 md:order-1 md:p-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5B455]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#F5B455]/80">Featured · Original</span>
          </div>
          <h2 className="font-nacelle text-2xl font-semibold tracking-tight text-zinc-100">Starfall Isle</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
            A third-person island adventure at golden hour. Find the seven fallen star shards and relight the Beacon on the summit.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {TAGS.map(t => (
              <span key={t} className="rounded-full border border-white/[0.06] px-2.5 py-0.5 font-mono text-[9px] text-zinc-500">
                {t}
              </span>
            ))}
          </div>
          <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-[#F5B455] px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-[background-color,transform] duration-150 group-hover:bg-[#F8C677] group-active:scale-[0.98]">
            Play now
            <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
          </span>
        </div>

        <div className="relative order-1 h-44 overflow-hidden md:order-2 md:h-auto md:min-h-[240px]">
          <IslandArt />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0e0e10] via-transparent to-transparent md:bg-gradient-to-r md:via-[#0e0e10]/30" />
        </div>
      </div>
    </Link>
  )
}

/** Golden-hour island silhouette with the Beacon on the summit. */
function IslandArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 300"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.03]"
    >
      <defs>
        <linearGradient id="sfb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141b29" />
          <stop offset="0.42" stopColor="#4a3443" />
          <stop offset="0.68" stopColor="#b8684c" />
          <stop offset="0.86" stopColor="#eea062" />
          <stop offset="1" stopColor="#f6c684" />
        </linearGradient>
        <linearGradient id="sfb-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d4a4f" />
          <stop offset="1" stopColor="#141a22" />
        </linearGradient>
        <radialGradient id="sfb-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1d2" />
          <stop offset="0.35" stopColor="#ffd59a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f5b455" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sfb-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff0cf" />
          <stop offset="0.3" stopColor="#f5b455" stopOpacity="0.7" />
          <stop offset="1" stopColor="#f5b455" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sfb-streak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f5b455" stopOpacity="0" />
          <stop offset="1" stopColor="#fff0cf" />
        </linearGradient>
      </defs>

      <rect width="600" height="300" fill="url(#sfb-sky)" />
      {/* stars */}
      <g fill="#f3eee6">
        <circle cx="120" cy="34" r="1" opacity="0.6" />
        <circle cx="236" cy="58" r="0.8" opacity="0.45" />
        <circle cx="352" cy="26" r="1.1" opacity="0.7" />
        <circle cx="468" cy="52" r="0.8" opacity="0.5" />
        <circle cx="548" cy="22" r="1" opacity="0.55" />
        <circle cx="62" cy="80" r="0.8" opacity="0.35" />
      </g>
      {/* falling stars */}
      <g strokeLinecap="round">
        <line x1="380" y1="40" x2="452" y2="78" stroke="url(#sfb-streak)" strokeWidth="1.6" />
        <line x1="168" y1="70" x2="214" y2="94" stroke="url(#sfb-streak)" strokeWidth="1.1" opacity="0.7" />
      </g>
      <circle cx="452" cy="78" r="2.2" fill="#fff0cf" />

      {/* sun on the horizon */}
      <circle cx="430" cy="212" r="70" fill="url(#sfb-sun)" opacity="0.8" />
      <circle cx="430" cy="214" r="22" fill="#ffe3b3" />

      {/* far headland */}
      <path d="M470 214 C500 200 528 196 560 203 C580 207 592 210 600 212 L600 216 L470 216 Z" fill="#6f4a4a" opacity="0.8" />
      {/* the island */}
      <path
        d="M40 216 C70 206 96 200 126 196 C150 186 170 170 196 160 C214 152 232 136 252 124 C266 116 282 112 296 114 C314 116 326 128 342 140 C360 152 384 166 404 178 C424 190 446 202 476 216 Z"
        fill="#2a2029"
      />
      <path d="M126 196 C150 188 168 176 190 168 C176 182 160 194 140 204 Z" fill="#3a2b33" opacity="0.8" />
      {/* village roofs and a windmill */}
      <g fill="#1c161d">
        <path d="M150 198 l8 -8 l8 8 z M170 194 l7 -7 l7 7 z" />
        <rect x="198" y="168" width="4" height="22" />
        <path d="M200 168 l12 -10 M200 168 l-12 -8 M200 168 l10 12 M200 168 l-10 10" stroke="#1c161d" strokeWidth="2" />
      </g>
      {/* beacon tower + light */}
      <rect x="290" y="96" width="10" height="20" fill="#1c161d" />
      <path d="M287 98 h16 l-3 -6 h-10 z" fill="#1c161d" />
      <circle cx="295" cy="88" r="26" fill="url(#sfb-glow)" />
      <circle cx="295" cy="89" r="3.4" fill="#fff4da" />

      {/* sea */}
      <rect y="216" width="600" height="84" fill="url(#sfb-sea)" />
      <g stroke="#ffd59a" strokeLinecap="round">
        <line x1="402" y1="226" x2="458" y2="226" strokeWidth="2" opacity="0.7" />
        <line x1="414" y1="238" x2="446" y2="238" strokeWidth="1.6" opacity="0.5" />
        <line x1="420" y1="252" x2="440" y2="252" strokeWidth="1.2" opacity="0.35" />
        <line x1="80" y1="232" x2="132" y2="232" strokeWidth="1" opacity="0.18" />
        <line x1="210" y1="246" x2="270" y2="246" strokeWidth="1" opacity="0.14" />
      </g>
      <line x1="295" y1="222" x2="295" y2="262" stroke="#f5b455" strokeWidth="1.4" opacity="0.25" />
    </svg>
  )
}
