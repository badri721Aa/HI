'use client'
/**
 * Boot screen: the island at dusk with the Beacon on its summit (CSS and one SVG — no WebGL here),
 * the wordmark, seven shards that light as loading advances, a progress bar that never runs
 * backwards, rotating tips, and the error state.
 */
import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from './controls'
import { BackIcon, StarIcon } from './icons'
import { cx, LABEL, STANDALONE, WORDMARK_TOP } from './theme'
import styles from './ui.module.css'
import { Wordmark } from './Wordmark'

const TIPS = [
  'Press 1 to 6, or roll the mouse wheel, to switch weapons. The last two slots are won from bosses.',
  'Press B to build. Left click places a block, right click breaks one, and R turns stairs.',
  'Dash with Q or a right click. It crosses gaps a jump cannot, and it works in mid-air.',
  'Jump again in mid-air for a double jump. It carries you onto rooftops and ledges.',
  'Press R to go limp and tumble like a ragdoll. Hills are more fun that way.',
  'Portals on the island lead to other worlds. A boss waits in each one, guarding a new weapon.',
  'Play Online from the title or pause menu: quick join a public room, or create a private one and share its code.',
  'Running slowly? Settings, then Graphics, then "Run device setup again" picks a lighter preset for your device.',
  'Lanterns are checkpoints. Light one, and you return to it after a fall.',
  'Lost? Press M for the map. It pins a hint to every shard you have not found.',
  'Creative mode has no enemies. Double-tap Space to fly, and build anything you like.',
]
const TIP_MS = 6000
const SHARDS = 7

/** Deterministic pseudo-random stream (identical on server and client — no hydration drift). */
function seeded(seed: number): () => number {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Far stars as one box-shadow list (a single element); they thin out towards the horizon glow. */
const FAR_STARS = (() => {
  const rnd = seeded(7)
  return Array.from({ length: 130 }, () => {
    const y = rnd() ** 1.4 * 60
    const o = (0.22 + rnd() * 0.5) * (1 - y / 80)
    return `${(rnd() * 100).toFixed(2)}vw ${y.toFixed(2)}vh 0 ${rnd() < 0.16 ? 0.5 : 0}px rgba(243,238,230,${o.toFixed(2)})`
  }).join(',')
})()

/** The bright few that twinkle. */
const TWINKLERS = (() => {
  const rnd = seeded(23)
  return Array.from({ length: 22 }, () => ({
    x: rnd() * 100,
    y: rnd() ** 1.3 * 48,
    r: 1.6 + rnd() * 1.4,
    o: 0.55 + rnd() * 0.45,
    t: 2.6 + rnd() * 4.4,
    d: -rnd() * 6,
  }))
})()

/** Glints on the water under the Beacon; they widen towards the viewer. Positions are % of the island box. */
const GLINTS = (() => {
  const rnd = seeded(41)
  return Array.from({ length: 9 }, (_, i) => ({
    top: 67.5 + i * 3.5,
    w: 5 + i * 1.7 + rnd() * 2,
    x: 63.16 + (rnd() - 0.5) * (1 + i * 0.5),
    o: 0.85 - i * 0.06,
    t: 2.2 + rnd() * 2.2,
    d: -rnd() * 4,
  }))
})()

/** Island profile in a 760 × 400 box whose waterline is y = 260; the summit plateau carries the Beacon. */
const ISLE_EDGE =
  'M10 260C60 252 90 240 130 232C170 224 190 196 230 188C262 182 280 150 318 138C350 128 372 100 410 86C430 79 446 72 462 70L498 70C520 74 540 96 566 118C590 138 604 150 630 158C664 168 690 204 716 232C730 246 742 256 752 260'
const FAR_ISLE = 'M-230 260C-190 246-160 232-120 228C-90 225-70 208-40 207C-12 206 4 220 30 232C56 244 90 254 120 260Z'
/** Pines standing on the slopes: x, ground y, scale. */
const PINES: Array<[number, number, number]> = [
  [205, 198, 1], [222, 191, 1.3], [248, 180, 0.9], [300, 150, 1.2], [316, 140, 0.9], [345, 124, 1.1], [390, 96, 0.9],
  [540, 96, 1], [556, 110, 1.3], [585, 136, 0.9], [640, 162, 1.2], [656, 170, 0.9], [676, 188, 1],
]
const PINE_PATH = PINES.map(([x, y, s]) => `M${x - 4.5 * s} ${y + 3}L${x} ${y - 16 * s}L${x + 4.5 * s} ${y + 3}Z`).join('')
/** Two palms on the beach and the little pier, drawn as strokes. */
const STROKES =
  'M150 229Q147 213 154 199M154 199q-10-6-18 0M154 199q-6-10-15-9M154 199q8-9 17-5M154 199q11-3 16 6M154 199q1-11 9-13' +
  'M178 217Q182 201 174 189M174 189q10-6 18 1M174 189q6-10 15-8M174 189q-8-9-17-4M174 189q-11-2-15 7M174 189q-1-11-9-12' +
  'M26 247H102M36 247V260M58 247V260M80 247V260'
/** Lit windows: x, y. */
const WINDOWS: Array<[number, number]> = [[262, 178], [287, 160], [601, 151], [334, 133]]

export function LoadingScreen({ progress, label, error, state }: { progress: number; label: string; error: string | null; state: 'open' | 'closed' }) {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTip(i => (i + 1) % TIPS.length), TIP_MS)
    return () => clearInterval(t)
  }, [])

  // The bar only ever moves forward, whatever the loader reports.
  const target = Math.min(1, Math.max(0, progress))
  const [best, setBest] = useState(target)
  if (target > best) setBest(target)
  const p = Math.max(best, target)
  const pct = Math.round(p * 100)

  return (
    <div
      data-loading
      data-state={state}
      className={cx(styles.presence, styles.loading, 'absolute inset-0 z-[80] overflow-hidden')}
      // The Beacon brightens as the island comes together.
      style={{ animationDuration: state === 'closed' ? '700ms' : '0ms', '--lit': error ? 0.15 : 0.25 + 0.75 * p } as CSSProperties}
      aria-busy={!error && state === 'open'}
    >
      <Scene />

      <div className="absolute inset-0 flex flex-col px-[clamp(20px,6vw,88px)] py-[clamp(24px,7vh,72px)]">
        <div className={WORDMARK_TOP}>
          <Wordmark animate />
        </div>

        <div className={cx('mt-[clamp(26px,6vh,56px)]', error ? 'w-[min(100%,560px)]' : 'w-[min(100%,clamp(340px,26vw,480px))]')}>
          {error ? (
            <div className={styles.rise} role="alert">
              <div className={cx(LABEL, 'text-[#E8664F]')}>The island could not load</div>
              <p className="mt-3 max-w-[460px] text-[14px] leading-relaxed text-[#F3EEE6]/75">{friendlyError(error)}</p>
              <p className="mt-2 max-w-[460px] break-words font-mono text-[11px] leading-relaxed text-[#F3EEE6]/40">{error}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={() => window.location.reload()}>
                  Try again
                </Button>
                {!STANDALONE && (
                  <Link href="/games" className={styles.btn} data-variant="secondary">
                    <BackIcon className="h-4 w-4" /> Back to the Arcade
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <div aria-hidden className="flex gap-3">
                {Array.from({ length: SHARDS }, (_, i) => (
                  <StarIcon key={i} data-lit={p * (SHARDS + 0.4) >= i + 1} className={cx(styles.shard, 'h-[18px] w-[18px]')} />
                ))}
              </div>
              <div
                className="relative mt-4 h-[6px]"
                role="progressbar"
                aria-label="Loading"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className="absolute inset-0 overflow-hidden rounded-full bg-[#F3EEE6]/[0.14]">
                  <div className={cx(styles.loadFill, 'absolute inset-0 overflow-hidden rounded-full bg-[#F5B455]')} style={{ transform: `translateX(${pct - 100}%)` }}>
                    <span className={cx(styles.loadSheen, 'absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-[#FFF1D6]/70 to-transparent')} />
                  </div>
                </div>
                <div className={cx(styles.loadHead, 'pointer-events-none absolute inset-0')} style={{ transform: `translateX(${pct}%)` }}>
                  <span className="absolute -left-[5px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full bg-[#FFE9C4] shadow-[0_0_14px_4px_rgba(245,180,85,0.7)]" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-4 text-[13px]">
                <span className="truncate text-[#F3EEE6]/70" role="status">
                  {label}…
                </span>
                <span className="font-semibold tabular-nums text-[#F3EEE6]">{pct}%</span>
              </div>
            </>
          )}
        </div>

        {!error && (
          <div className="mt-auto max-w-[520px]">
            <div className={cx(LABEL, 'text-[#F5B455]')}>Tip</div>
            <p key={tip} className={cx(styles.tip, 'mt-2 min-h-[3.2em] text-[14px] leading-relaxed text-[#F3EEE6]/80')} style={{ '--t': `${TIP_MS}ms` } as CSSProperties}>
              {TIPS[tip]}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Sky, stars, sea and the island silhouette. Purely decorative. */
function Scene() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className={styles.loadSky} />
      <span className={styles.starField} style={{ boxShadow: FAR_STARS }} />
      {TWINKLERS.map((s, i) => (
        <span
          key={i}
          className={cx(styles.twinkle, 'absolute rounded-full bg-[#FFF6E6]')}
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, '--o': s.o, '--t': `${s.t}s`, '--d': `${s.d}s` } as CSSProperties}
        />
      ))}
      <span className={styles.shootingStar} style={{ left: '52%', top: '9%', '--a': '154deg', '--dx': '-300px', '--dy': '146px', '--t': '9s', '--d': '1.2s' } as CSSProperties} />
      <span className={styles.shootingStar} style={{ left: '88%', top: '20%', '--a': '162deg', '--dx': '-240px', '--dy': '78px', '--t': '13s', '--d': '6.5s' } as CSSProperties} />
      <div className={styles.loadSea} />

      <div className={styles.isle}>
        <svg viewBox="0 0 760 400" overflow="visible" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="sf-load-fade" gradientUnits="userSpaceOnUse" x1="0" y1="262" x2="0" y2="384">
              <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="sf-load-mask">
              <rect x="-240" y="260" width="1240" height="140" fill="url(#sf-load-fade)" />
            </mask>
            <g id="sf-load-isle">
              <path d={`${ISLE_EDGE}Z`} />
              <path d={PINE_PATH} />
              <path d="M470 71L474.5 31H485.5L490 71ZM471 27h18v4h-18ZM473 16L480 7L487 16Z" />
              <path d={`${STROKES}M480 7V2M476 16V27M484 16V27`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </g>
          </defs>
          <path d={FAR_ISLE} fill="#2a2440" />
          <g mask="url(#sf-load-mask)">
            <use href="#sf-load-isle" transform="translate(0 520) scale(1 -1)" fill="#06080d" color="#06080d" />
          </g>
          <use href="#sf-load-isle" fill="#090c13" color="#090c13" />
          {/* Last light catching the island's edge. */}
          <path d={ISLE_EDGE} fill="none" stroke="#F7B27A" strokeOpacity="0.3" strokeWidth="1.2" />
          {/* The lamp room. */}
          <rect x="476.5" y="17" width="7" height="10" fill="#FFE2B0" style={{ opacity: 'var(--lit)' }} />
          {WINDOWS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.5" fill="#F5B455" className={styles.twinkle} style={{ '--o': 0.9, '--t': `${3.4 + i}s`, '--d': `${-i * 1.3}s` } as CSSProperties} />
          ))}
        </svg>
        <div className={styles.reflect} />
        {GLINTS.map((g, i) => (
          <span key={i} className={styles.shimmer} style={{ left: `${g.x}%`, top: `${g.top}%`, width: `${g.w}%`, '--o': g.o, '--t': `${g.t}s`, '--d': `${g.d}s` } as CSSProperties} />
        ))}
        <div className={styles.beacon}>
          <span className={styles.beaconHalo} />
          <span className={styles.beaconFlare} />
        </div>
      </div>
      <div className={cx(styles.loadShade, 'absolute inset-0')} />
    </div>
  )
}

function friendlyError(msg: string): string {
  if (/webgl|context/i.test(msg)) return 'Your browser could not start WebGL. Try enabling hardware acceleration, or open the game in another browser.'
  return 'Something went wrong while building the island. Reloading usually fixes it.'
}
