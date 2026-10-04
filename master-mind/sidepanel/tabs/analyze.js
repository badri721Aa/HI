// Analyze tab: two glass cards.
//  (a) Sentiment & Bias Analyzer: `bias` task → animated objectivity gauge + the passages that shaped it.
//  (b) Fact-Checking & Source Verification: streamed `factcheck` task (web search) → claim accordion,
//      verdict badges, overall assessment and the web sources Claude consulted.
// Results are cached in memory per page key, so switching tabs or returning to a page never re-spends.
import { linkCitations, citeHandler } from '../cite.js'

const NS = 'http://www.w3.org/2000/svg'
const CACHE_MAX = 24

// Static, trusted icon markup (never interpolated with data).
const ICONS = {
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.4"/>',
  shield: '<path d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  play: '<path d="M7 5l11 7-11 7z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.2" fill="currentColor" stroke="none"/>',
  retry: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
  glow: '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="3.5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  expand: '<path d="M7 9l5-5 5 5M7 15l5 5 5-5"/>',
}

const LABEL_COLORS = {
  'Objective': 'var(--mm-lime)',
  'Mostly objective': 'var(--mm-cyan)',
  'Mixed': 'var(--mm-amber)',
  'Opinionated': 'var(--mm-pink)',
  'Strongly biased': 'var(--mm-red)',
}
const KIND_COLORS = {
  'loaded language': 'var(--mm-pink)',
  'one-sided framing': 'var(--mm-amber)',
  'unsupported claim': 'var(--mm-red)',
  'emotional appeal': 'var(--mm-violet)',
  'balanced sourcing': 'var(--mm-lime)',
  'neutral reporting': 'var(--mm-cyan)',
}
const VERDICTS = {
  supported: { label: 'Supported', c: 'var(--mm-lime)' },
  partly: { label: 'Partly supported', c: 'var(--mm-amber)' },
  disputed: { label: 'Disputed', c: 'var(--mm-red)' },
  unverified: { label: 'Unverified', c: 'var(--mm-muted)' },
}
// Gauge gradient, subjective → objective.
const STOPS = [[0, [244, 114, 182]], [0.36, [167, 139, 250]], [0.7, [34, 211, 238]], [1, [163, 230, 53]]]

const CSS = `
#panel-analyze .az-card { display: flex; flex-direction: column; gap: 12px; }
#panel-analyze .az-sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.az-head { display: flex; align-items: center; gap: 11px; }
.az-ico { --c: var(--mm-accent); width: 36px; height: 36px; flex: none; border-radius: 11px; display: grid; place-items: center; color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); box-shadow: 0 0 18px color-mix(in srgb, var(--c) 16%, transparent); }
.az-ico svg { width: 18px; height: 18px; }
.az-titles { flex: 1; min-width: 0; }
.az-titles h2 { font-size: 14.5px; }
.az-titles p { margin: 2px 0 0; font-size: 12px; color: var(--mm-muted); line-height: 1.35; }
.az-head .mm-btn.icon svg { width: 15px; height: 15px; }
.az-intro { margin: 0; font-size: 13px; line-height: 1.55; color: var(--mm-fg-2); }
.az-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.az-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 999px; font: 600 11px/1.2 var(--mm-font); color: var(--mm-fg-2); background: rgba(255,255,255,.04); border: 1px solid var(--mm-border); }
.az-pill svg { width: 12px; height: 12px; color: var(--mm-accent); }
.az-pill button { all: unset; cursor: pointer; color: var(--mm-accent); font-weight: 700; }
.az-pill button:hover { text-decoration: underline; }
.az-pill button:focus-visible { outline: 2px solid var(--mm-accent); outline-offset: 2px; border-radius: 4px; }
.az-cta { width: 100%; padding: 10px 14px; font-size: 13px; }
.az-cta svg { width: 14px; height: 14px; }
.az-status { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: var(--mm-fg-2); min-height: 28px; }
.az-status .grow { flex: 1; min-width: 0; }
.az-status .mm-btn { flex: none; }
.az-status .mm-btn svg { width: 13px; height: 13px; }
.az-sub { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 8px; margin-top: 2px; min-height: 26px; }
.az-sub h3 { font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--mm-muted); font-weight: 700; }
.az-sub .mm-btn svg { width: 13px; height: 13px; }
.az-empty { margin: 0; font-size: 12.5px; color: var(--mm-muted); }
.az-warn { margin: 0; font-size: 12px; color: var(--mm-amber); }
.az-blocked { margin: 28px 0; padding: 26px 18px; text-align: center; border-radius: var(--mm-radius); background: var(--mm-glass); border: 1px dashed var(--mm-border-strong); color: var(--mm-muted); font-size: 13px; }
.az-blocked svg { width: 26px; height: 26px; color: var(--mm-fg-2); margin-bottom: 8px; }
.az-blocked b { display: block; color: var(--mm-fg); font-size: 14px; margin-bottom: 4px; }
.az-fade { animation: az-in .3s var(--mm-ease); }
@keyframes az-in { from { opacity: 0; transform: translateY(4px); } }

/* gauge */
.az-gauge { position: relative; width: 100%; max-width: 272px; margin: 2px auto 0; }
.az-gauge svg { display: block; width: 100%; height: auto; overflow: visible; }
.az-needle { transform-origin: 110px 112px; transform: rotate(-90deg); transition: transform 1.35s cubic-bezier(.2, 1.25, .35, 1); }
.az-readout { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 6px; margin-top: -2px; }
.az-end { font: 700 10px/1.2 var(--mm-font); letter-spacing: .09em; text-transform: uppercase; color: var(--mm-muted); padding-bottom: 6px; }
.az-end.l { color: color-mix(in srgb, var(--mm-pink) 75%, var(--mm-muted)); }
.az-end.r { text-align: right; color: color-mix(in srgb, var(--mm-lime) 75%, var(--mm-muted)); }
.az-score { text-align: center; line-height: 1; }
.az-score b { display: block; font: 800 34px/1 var(--mm-font); letter-spacing: -.03em; color: var(--sc); text-shadow: 0 0 22px color-mix(in srgb, var(--sc) 45%, transparent); font-variant-numeric: tabular-nums; }
.az-score span { display: block; margin-top: 4px; font: 600 10.5px/1 var(--mm-font); letter-spacing: .06em; text-transform: uppercase; color: var(--mm-muted); }
.az-verdict { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }
.az-label { --c: var(--mm-accent); font-size: 11px; padding: 5px 9px; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); box-shadow: 0 0 14px color-mix(in srgb, var(--c) 18%, transparent); }
.az-tone { font-size: 12.5px; color: var(--mm-fg-2); }
.az-tone b { color: var(--mm-fg); font-weight: 600; }
.az-summary { margin: 0; font-size: 13px; line-height: 1.55; color: var(--mm-fg-2); text-align: center; }
.az-skel-gauge { width: 200px; height: 100px; margin: 6px auto 4px; border-radius: 100px 100px 0 0; -webkit-mask: radial-gradient(circle at 50% 100%, transparent 76px, #000 77px); mask: radial-gradient(circle at 50% 100%, transparent 76px, #000 77px); }
#panel-analyze .mm-cite-run { white-space: nowrap; }

/* signals */
.az-sigs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.az-sig { --c: var(--mm-accent); width: 100%; display: flex; flex-direction: column; gap: 6px; padding: 10px 11px; border-radius: 11px; text-align: left; font: inherit; color: var(--mm-fg);
  background: rgba(255,255,255,.025); border: 1px solid var(--mm-border); border-left: 3px solid var(--c); transition: background .15s, border-color .15s, box-shadow .15s; }
button.az-sig { cursor: pointer; }
button.az-sig:hover { background: rgba(255,255,255,.05); border-color: color-mix(in srgb, var(--c) 40%, transparent); border-left-color: var(--c); box-shadow: 0 0 16px color-mix(in srgb, var(--c) 12%, transparent); }
.az-sig-top { display: flex; align-items: center; gap: 8px; width: 100%; }
.az-kind { --c: var(--mm-accent); color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent); border: 1px solid color-mix(in srgb, var(--c) 32%, transparent); }
.az-kind .mm-dot { width: 6px; height: 6px; }
.az-sig-top .mm-cite { margin-left: auto; pointer-events: none; }
.az-quote { font-size: 13px; line-height: 1.5; color: var(--mm-heading); font-style: italic; overflow-wrap: anywhere; }
.az-why { font-size: 12px; line-height: 1.45; color: var(--mm-muted); }

/* fact check */
.fc-raw { margin: 0; max-height: 210px; overflow: auto; padding: 10px 11px; border-radius: 10px; background: #07080C; border: 1px solid var(--mm-border); font: 11.5px/1.55 var(--mm-mono); color: var(--mm-fg-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.fc-raw:empty::before { content: "Waiting for the first results\\2026"; color: var(--mm-muted); }
.fc-tally { display: flex; flex-wrap: wrap; gap: 6px; }
.fc-tally > span { --c: var(--mm-accent); display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 999px; font: 600 11.5px/1.2 var(--mm-font); color: var(--mm-fg-2); background: rgba(255,255,255,.035); border: 1px solid var(--mm-border); }
.fc-tally b { color: var(--c); font-variant-numeric: tabular-nums; }
.fc-tally .mm-dot { width: 7px; height: 7px; }
.fc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fc-item { --c: var(--mm-muted); position: relative; border-radius: 12px; border: 1px solid var(--mm-border); border-left: 3px solid var(--c); background: rgba(255,255,255,.025); transition: background .15s, border-color .15s; }
.fc-item.open { background: rgba(255,255,255,.045); border-color: color-mix(in srgb, var(--c) 30%, transparent); border-left-color: var(--c); }
.fc-item h3 { margin: 0; font-size: inherit; font-weight: inherit; }
.fc-toggle { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 11px 38px 11px 12px; background: none; border: 0; border-radius: 10px; color: var(--mm-fg); font: 600 13px/1.45 var(--mm-font); text-align: left; cursor: pointer; }
.fc-toggle:focus-visible { outline: 2px solid var(--mm-accent); outline-offset: -2px; border-radius: 10px; }
.fc-toggle .chev { position: absolute; top: 12px; right: 11px; width: 16px; height: 16px; color: var(--mm-muted); transition: transform .2s var(--mm-ease); }
.fc-item.open .chev { transform: rotate(180deg); color: var(--mm-fg); }
.fc-toggle .claim { overflow-wrap: anywhere; }
.fc-badge { --c: var(--mm-muted); color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 38%, transparent); }
.fc-badge[data-v="unverified"] { color: var(--mm-fg-2); }
.fc-cites { position: absolute; top: 12px; right: 32px; display: flex; gap: 2px; }
.fc-body { margin: 0 12px; padding: 10px 0 12px; border-top: 1px dashed var(--mm-border); }
.fc-body .mm-md { font-size: 13px; color: var(--mm-fg-2); }
.fc-body .mm-md > :last-child { margin-bottom: 0; }
.fc-overall { padding: 11px 12px; border-radius: 12px; background: linear-gradient(135deg, color-mix(in srgb, var(--mm-accent) 9%, transparent), color-mix(in srgb, var(--mm-accent-2) 7%, transparent)); border: 1px solid color-mix(in srgb, var(--mm-accent) 22%, transparent); }
.fc-overall h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--mm-accent); margin-bottom: 5px; font-weight: 700; }
.fc-overall .mm-md { font-size: 13px; }
.fc-overall .mm-md > :last-child { margin-bottom: 0; }
.fc-sources { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; counter-reset: src; }
.fc-src { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; color: var(--mm-fg); border: 1px solid transparent; transition: background .15s, border-color .15s; }
.mm-root a.fc-src:hover { text-decoration: none; background: rgba(255,255,255,.045); border-color: var(--mm-border); }
.fc-src .n { counter-increment: src; width: 20px; height: 20px; flex: none; display: grid; place-items: center; border-radius: 6px; font: 700 10.5px/1 var(--mm-mono); color: var(--mm-accent); background: color-mix(in srgb, var(--mm-accent) 12%, transparent); }
.fc-src .n::before { content: counter(src); }
.fc-src .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fc-src .t b { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-src .t span { font: 11px/1.2 var(--mm-mono); color: var(--mm-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-src svg { width: 13px; height: 13px; color: var(--mm-muted); flex: none; }
.fc-rawbox summary { cursor: pointer; font-size: 12px; color: var(--mm-muted); padding: 2px 0; list-style-position: inside; }
.fc-rawbox summary:hover { color: var(--mm-fg-2); }
.fc-rawbox .mm-md { margin-top: 8px; font-size: 12.5px; }
`

function injectStyle() {
  if (document.getElementById('mm-style-analyze')) return
  const s = document.createElement('style')
  s.id = 'mm-style-analyze'
  s.textContent = CSS
  document.head.appendChild(s)
}

function icon(name, cls) {
  const s = document.createElementNS(NS, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  s.setAttribute('class', cls || 'mm-icon')
  s.innerHTML = ICONS[name] // static constant markup
  return s
}

function h(tag, cls, text) {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text != null) el.textContent = text
  return el
}

function button(cls, iconName, label, aria) {
  const b = h('button', cls)
  b.type = 'button'
  if (iconName) b.append(icon(iconName))
  if (label) b.append(h('span', null, label))
  if (aria) { b.setAttribute('aria-label', aria); b.title = aria }
  return b
}

function svg(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v))
  parent?.appendChild(el)
  return el
}

const siteOf = href => { try { return new URL(href).hostname.replace(/^www\./, '') } catch { return '' } }
const safeUrl = href => { try { const u = new URL(href); return /^https?:$/.test(u.protocol) ? u.href : null } catch { return null } }

function gaugeColor(v) {
  const t = Math.max(0, Math.min(1, v / 100))
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]
    const [t0, c0] = STOPS[i - 1]
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1)
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(', ')})`
    }
  }
  return 'rgb(163, 230, 53)'
}

function labelFor(v) {
  return v >= 80 ? 'Objective' : v >= 62 ? 'Mostly objective' : v >= 42 ? 'Mixed' : v >= 22 ? 'Opinionated' : 'Strongly biased'
}

/** Defensive copy of the bias task's JSON: clamp numbers, drop malformed signals. */
export function normalizeBias(data) {
  const n = Math.round(Number(data?.objectivity))
  const objectivity = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50
  const label = LABEL_COLORS[data?.label] ? data.label : labelFor(objectivity)
  const signals = (Array.isArray(data?.signals) ? data.signals : [])
    .filter(s => s && typeof s === 'object' && (s.quote || s.reason))
    .map(s => ({
      pid: /^p\d+$/.test(String(s.pid || '').trim()) ? String(s.pid).trim() : '',
      quote: String(s.quote || '').trim().replace(/^["“”']+|["“”']+$/g, ''),
      kind: String(s.kind || '').toLowerCase().trim() || 'signal',
      reason: String(s.reason || '').trim(),
    }))
  return { objectivity, label, tone: String(data?.tone || '').trim(), summary: String(data?.summary || '').trim(), signals }
}

/** Keep adjacent citation chips together and glued to trailing punctuation, so a lone "." never wraps onto its own line. */
function glueCites(root) {
  const runs = []
  for (const chip of root.querySelectorAll('.mm-cite')) {
    const prev = chip.previousSibling
    if (prev?.nodeType === 1 && prev.classList.contains('mm-cite') && runs.length) runs[runs.length - 1].push(chip)
    else runs.push([chip])
  }
  for (const run of runs) {
    const next = run[run.length - 1].nextSibling
    const m = next?.nodeType === 3 ? /^[.,;:!?)\]»”’]+/.exec(next.nodeValue) : null
    if (run.length === 1 && !m) continue
    const wrap = document.createElement('span')
    wrap.className = 'mm-cite-run'
    run[0].before(wrap)
    wrap.append(...run)
    if (m) { next.nodeValue = next.nodeValue.slice(m[0].length); wrap.append(m[0]) }
  }
}

// ───────── fact-check Markdown parsing ─────────
const CLAIM_RE = /^\s{0,3}(?:#{1,6}\s+(?:\*\*|__)?|\*\*|__)\s*(?:\d+[.)]\s*)?Claim(?:\s*#?\d+)?\s*(?:\*\*|__)?\s*[:：\-–—]\s*(?:\*\*|__)?\s*(.*?)\s*(?:\*\*|__)?\s*$/i
const HR_RE = /^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/
const VERDICT_RE = /^\s*(?:[-*>]\s*)?(?:\*\*|__)?\s*Verdict\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*)$/i
const OVERALL_RE = /^\s{0,3}(?:#{1,6}\s+)?(?:\*\*|__)?\s*(?:overall(?: assessment)?|in summary|summary|bottom line|conclusion)\b/i
const PID_RE = /\[(p\d+)\]/g

export function classifyVerdict(raw) {
  const s = String(raw || '').toLowerCase().replace(/[*_`"“”]/g, '').trim()
  if (/^(partly|partially|mostly|largely|somewhat|half)\b|^mixed\b/.test(s)) return 'partly'
  if (/^(unverified|unverifiable|unclear|unknown|inconclusive|insufficient|cannot|can['’]t|could not|not verified|no evidence)/.test(s)) return 'unverified'
  if (/^(disputed|false|incorrect|inaccurate|refuted|misleading|wrong|unsupported|not supported|contradicted|debunked|outdated)/.test(s)) return 'disputed'
  if (/^(supported|true|accurate|correct|confirmed|verified|substantiated)/.test(s)) return 'supported'
  if (/partl|partial|mixed|mostly|largely/.test(s)) return 'partly'
  if (/unverif|unclear|inconclusive/.test(s)) return 'unverified'
  if (/disput|false|incorrect|refut|mislead|unsupported|inaccurate/.test(s)) return 'disputed'
  if (/support|accurate|correct|confirm|\btrue\b/.test(s)) return 'supported'
  return 'unverified'
}

/** Split "Partly supported — the IEA says 38%" into the verdict and the explanation that follows it. */
function splitVerdict(raw) {
  const s = String(raw || '').replace(/\*\*|__/g, '').trim()
  const m = /^(.{1,40}?)(\s+[—–-]\s+|[.:;,]\s+|\s+(?=\())(.+)$/.exec(s)
  if (m && m[1].trim().split(/\s+/).length <= 4) return { verdict: m[1].trim(), rest: m[3].trim() }
  if (s.split(/\s+/).length <= 4) return { verdict: s.replace(/[.!]+$/, ''), rest: '' }
  return { verdict: s, rest: s }
}

/**
 * Parse the factcheck task's Markdown ("## Claim: … [pN]" / "**Verdict:** …" sections, then "---" + overall).
 * Tolerates bold "**Claim 1:**" headings, inline verdict explanations, separators between claims,
 * a missing "---" (an "Overall…" line works too) and narration before the first claim.
 * @returns {{claims: {claim: string, pids: string[], verdict: string, verdictText: string, explanation: string}[], overall: string}}
 */
export function parseFactcheck(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n')
  const claims = []
  let cur = null
  let mode = 'pre' // pre | claim | after
  let after = []
  for (const line of lines) {
    const cm = CLAIM_RE.exec(line)
    if (cm && cm[1].trim()) {
      if (mode === 'after' && cur && after.join('').trim()) cur.lines.push(...after)
      after = []
      cur = { head: cm[1], lines: [] }
      claims.push(cur)
      mode = 'claim'
      continue
    }
    if (HR_RE.test(line)) { if (mode === 'claim') { mode = 'after'; after = [] } else if (mode === 'after') after.push('') ; continue }
    if (mode === 'claim' && /^\s{0,3}#{1,6}\s/.test(line) && OVERALL_RE.test(line)) { mode = 'after'; after = []; continue }
    if (mode === 'claim') cur.lines.push(line)
    else if (mode === 'after') after.push(line)
  }
  let overall = after.join('\n').trim()
  // No separator: peel an "Overall…" paragraph off the last claim.
  if (!overall && claims.length) {
    const last = claims[claims.length - 1]
    const i = last.lines.findIndex((l, idx) => idx > 0 && OVERALL_RE.test(l))
    if (i > 0) {
      overall = last.lines.slice(i).join('\n').trim()
      last.lines = last.lines.slice(0, i)
    }
  }
  // Drop a leading "Overall:" / "**Overall assessment:**" label (the card has its own heading), keep prose like "Overall, …".
  overall = overall.replace(/^(?:#{1,6}\s+)?(?:\*\*|__)?\s*overall(?:\s+assessment)?\s*(?:[:：]\s*(?:\*\*|__)?|(?:\*\*|__)\s*[:：]|(?:\*\*|__)?\s*(?:\n|$))\s*/i, '').trim()

  return {
    overall,
    claims: claims.map(c => {
      let verdictText = ''
      let verdict = 'unverified'
      const body = []
      for (const l of c.lines) {
        const vm = !verdictText && VERDICT_RE.exec(l)
        if (vm) {
          const { verdict: v, rest } = splitVerdict(vm[1])
          verdict = classifyVerdict(v)
          verdictText = v
          if (rest) body.push(rest)
        } else body.push(l)
      }
      const explanation = body.join('\n').trim()
      let pids = [...new Set([...c.head.matchAll(PID_RE)].map(m => m[1]))]
      if (!pids.length) pids = [...new Set([...explanation.matchAll(PID_RE)].map(m => m[1]))].slice(0, 2)
      const claim = c.head.replace(/\s*\[p\d+\]/g, '').replace(/^(\*\*|__)|(\*\*|__)$/g, '').replace(/\s+/g, ' ').trim()
      return { claim, pids, verdict, verdictText, explanation }
    }),
  }
}

// ───────── module ─────────
export function mount(root, ctx) {
  injectStyle()
  root.replaceChildren()
  const jump = citeHandler(ctx)
  const scrollTo = pid => Promise.resolve(jump(pid)).then(r => {
    if (r && r.found === false) ctx.toast('That passage isn’t on the page anymore. Try refreshing.')
  })

  const cache = new Map() // pageKey → { bias?: {data, pids}, fact?: {text, sources, truncated, pids} }
  let key = null // page key the cards currently describe
  let biasRun = null // { ctrl, key }
  let factRun = null
  let gaugeSeq = 0
  let factSeq = 0
  let searchText = null

  const blocked = h('div', 'az-blocked')
  blocked.setAttribute('role', 'status')
  blocked.hidden = true

  const biasCard = card('bias', 'gauge', 'var(--mm-pink)', 'Sentiment & Bias Analyzer', 'How objective is the tone, and which passages tip it?')
  const factCard = card('fact', 'shield', 'var(--mm-lime)', 'Fact-Checking & Source Verification', 'Key claims checked against live web sources.')
  root.append(blocked, biasCard.el, factCard.el)

  function card(id, iconName, color, title, sub) {
    const el = h('section', 'mm-card az-card')
    el.setAttribute('aria-labelledby', `az-${id}-title`)
    const head = h('div', 'az-head')
    const ico = h('div', 'az-ico')
    ico.style.setProperty('--c', color)
    ico.append(icon(iconName))
    const titles = h('div', 'az-titles')
    const h2 = h('h2', null, title)
    h2.id = `az-${id}-title`
    titles.append(h2, h('p', null, sub))
    const tools = h('div', 'mm-row')
    head.append(ico, titles, tools)
    const body = h('div', 'mm-stack')
    // Results are announced once through a short status line instead of making the whole card live
    // (the streaming fact-check output would otherwise flood screen readers).
    const live = h('div', 'az-sr')
    live.setAttribute('role', 'status')
    el.append(head, body, live)
    return { el, body, tools, live }
  }

  const cacheGet = k => (k ? cache.get(k) : null)
  function cacheSet(k, part, value) {
    const entry = cache.get(k) || {}
    entry[part] = value
    cache.delete(k)
    cache.set(k, entry) // most recent last
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  }

  function cta(label, iconName, onClick) {
    const b = button('mm-btn primary az-cta', iconName, label)
    b.addEventListener('click', onClick)
    return b
  }

  function rerunButton(label, onClick) {
    const b = button('mm-btn ghost icon sm', 'retry', null, label)
    b.addEventListener('click', onClick)
    return b
  }

  function statusRow(text, onStop) {
    const row = h('div', 'az-status')
    row.setAttribute('role', 'status')
    const label = h('span', 'grow', text)
    row.append(h('span', 'mm-spinner'), label)
    if (onStop) {
      const stop = button('mm-btn sm', 'stop', 'Stop', 'Stop this analysis')
      stop.addEventListener('click', onStop)
      row.append(stop)
    }
    return { row, label }
  }

  function errorView(body, err, retry) {
    const box = ctx.errorBox(err)
    const again = button('mm-btn sm', 'retry', 'Try again')
    again.addEventListener('click', retry)
    const row = h('div', 'mm-row')
    row.append(again)
    body.replaceChildren(box, row)
  }

  async function pageForRun() {
    const page = await ctx.getPage()
    if (!page) throw new Error(ctx.pageError || 'Couldn’t read this page. Try refreshing it.')
    if (!page.paragraphs?.length) throw new Error('This page has no readable text to analyze.')
    return page
  }

  // ───────── (a) bias ─────────
  function biasIdle() {
    biasCard.tools.replaceChildren()
    const intro = h('p', 'az-intro', 'Rates how objective the writing is, names its tone, and points to the exact passages (loaded language, one-sided framing, balanced sourcing…) that drove the score.')
    biasCard.body.replaceChildren(intro, cta('Analyze tone', 'gauge', runBias))
  }

  function biasLoading(paragraphs) {
    biasCard.tools.replaceChildren()
    const what = paragraphs ? `Reading the tone of ${paragraphs} paragraph${paragraphs === 1 ? '' : 's'}…` : 'Reading the page…'
    const { row } = statusRow(what, () => biasRun?.ctrl.abort())
    const skel = h('div', 'mm-skeleton az-skel-gauge')
    const l1 = h('div', 'mm-skeleton')
    const l2 = h('div', 'mm-skeleton')
    l2.style.width = '72%'
    biasCard.body.replaceChildren(row, skel, l1, l2)
  }

  async function runBias() {
    biasRun?.ctrl.abort()
    const ctrl = new AbortController()
    const run = { ctrl, key: null }
    biasRun = run
    const stale = () => biasRun !== run || (run.key && run.key !== key)
    biasLoading(ctx.page?.paragraphs?.length || 0)
    try {
      const page = await pageForRun()
      if (stale()) return
      if (page.key !== key) show(page) // the tab moved on before onPage arrived: bring the other card along
      run.key = page.key
      biasLoading(page.paragraphs.length)
      const res = await ctx.runTask('bias', { page }, { signal: ctrl.signal })
      if (stale()) return
      const entry = { data: normalizeBias(res?.data), pids: page.paragraphs.map(p => p.id) }
      cacheSet(page.key, 'bias', entry)
      renderBias(entry, true)
      biasCard.live.textContent = `Tone analysis ready: objectivity ${entry.data.objectivity} out of 100, ${entry.data.label}.`
    } catch (e) {
      if (stale()) return
      if (e?.code === 'ABORT' || ctrl.signal.aborted) {
        // Stopped by the user: fall back to the last result for this page, if there is one.
        const prev = cacheGet(run.key || key)?.bias
        if (prev) renderBias(prev, false); else biasIdle()
        ctx.toast('Tone analysis stopped')
      } else errorView(biasCard.body, e, runBias)
    } finally {
      if (biasRun === run) biasRun = null
    }
  }

  function gauge(value, animate) {
    const id = `az-grad-${++gaugeSeq}`
    const wrap = h('div', 'az-gauge')
    const s = svg('svg', { viewBox: '0 0 220 124', role: 'img', 'aria-label': `Objectivity ${value} out of 100` })
    const defs = svg('defs', {}, s)
    const grad = svg('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '0' }, defs)
    for (const [t, c] of STOPS) svg('stop', { offset: `${t * 100}%`, 'stop-color': `rgb(${c.join(',')})` }, grad)
    const glowId = `${id}-glow`
    const filter = svg('filter', { id: glowId, x: '-20%', y: '-40%', width: '140%', height: '180%' }, defs)
    svg('feGaussianBlur', { stdDeviation: '5', result: 'b' }, filter)
    const merge = svg('feMerge', {}, filter)
    svg('feMergeNode', { in: 'b' }, merge)
    svg('feMergeNode', { in: 'SourceGraphic' }, merge)
    const arc = 'M 22 112 A 88 88 0 0 1 198 112'
    svg('path', { d: arc, fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': 18, 'stroke-linecap': 'round' }, s)
    svg('path', { d: arc, fill: 'none', stroke: `url(#${id})`, 'stroke-width': 12, 'stroke-linecap': 'round', filter: `url(#${glowId})`, opacity: '.95' }, s)
    // ticks every 10 points, longer at 0 / 50 / 100
    for (let v = 0; v <= 100; v += 10) {
      const a = Math.PI * (1 - v / 100)
      const major = v % 50 === 0
      const r1 = major ? 64 : 68
      const r2 = 74
      svg('line', {
        x1: (110 + r1 * Math.cos(a)).toFixed(2), y1: (112 - r1 * Math.sin(a)).toFixed(2),
        x2: (110 + r2 * Math.cos(a)).toFixed(2), y2: (112 - r2 * Math.sin(a)).toFixed(2),
        stroke: major ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.16)', 'stroke-width': major ? 2 : 1.4, 'stroke-linecap': 'round',
      }, s)
    }
    const color = gaugeColor(value)
    const needle = svg('g', { class: 'az-needle' }, s)
    svg('path', { d: 'M 106.2 112 L 110 34 L 113.8 112 Z', fill: color, opacity: '.95' }, needle)
    svg('circle', { cx: 110, cy: 34, r: 2.6, fill: '#fff' }, needle)
    svg('circle', { cx: 110, cy: 112, r: 10, fill: '#0B0C10', stroke: color, 'stroke-width': 2.5 }, s)
    svg('circle', { cx: 110, cy: 112, r: 3.2, fill: color }, s)
    wrap.append(s)
    const target = -90 + value * 1.8
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { needle.style.transform = `rotate(${target}deg)` }))
    else { needle.style.transition = 'none'; needle.style.transform = `rotate(${target}deg)` }
    return wrap
  }

  function countUp(el, to, animate) {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = String(to); return }
    const t0 = performance.now()
    const dur = 1100
    const step = now => {
      const k = Math.min(1, (now - t0) / dur)
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1 && el.isConnected) requestAnimationFrame(step)
    }
    el.textContent = '0'
    requestAnimationFrame(step)
  }

  function renderBias(entry, animate) {
    const { data } = entry
    const valid = new Set(entry.pids)
    biasCard.tools.replaceChildren(rerunButton('Analyze tone again', runBias))
    const wrap = h('div', 'mm-stack az-fade')
    wrap.style.gap = '12px'

    const g = gauge(data.objectivity, animate)
    const readout = h('div', 'az-readout')
    const score = h('div', 'az-score')
    score.style.setProperty('--sc', gaugeColor(data.objectivity))
    const num = h('b')
    num.setAttribute('aria-hidden', 'true')
    score.append(num, h('span', null, 'Objectivity'))
    readout.append(h('span', 'az-end l', 'Subjective'), score, h('span', 'az-end r', 'Objective'))
    countUp(num, data.objectivity, animate)

    const verdict = h('div', 'az-verdict')
    const label = h('span', 'mm-badge az-label', data.label)
    label.style.setProperty('--c', LABEL_COLORS[data.label])
    verdict.append(label)
    if (data.tone) {
      const tone = h('span', 'az-tone', 'Tone: ')
      tone.append(h('b', null, data.tone))
      verdict.append(tone)
    }
    wrap.append(g, readout, verdict)
    if (data.summary) {
      const summary = h('p', 'az-summary', data.summary)
      linkCitations(summary, scrollTo, { validPids: valid })
      glueCites(summary)
      wrap.append(summary)
    }

    const sub = h('div', 'az-sub')
    sub.append(h('h3', null, 'Key passages'))
    const glowPids = [...new Set(data.signals.map(s => s.pid).filter(p => valid.has(p)))]
    if (glowPids.length) {
      const all = button('mm-btn sm', 'glow', 'Highlight all on page', `Highlight all ${glowPids.length} passages on the page`)
      all.addEventListener('click', () => {
        ctx.sendToTab('MM_GLOW', { pids: glowPids, ms: 6000 })
          .then(r => ctx.toast(r?.ok === false ? 'Couldn’t highlight the page. Try refreshing it.' : `Highlighted ${glowPids.length} passage${glowPids.length === 1 ? '' : 's'} on the page`))
          .catch(() => ctx.toast('Couldn’t reach the page. Try refreshing it.'))
      })
      sub.append(all)
    }
    wrap.append(sub)

    if (!data.signals.length) wrap.append(h('p', 'az-empty', 'No specific passages were flagged.'))
    else {
      const list = h('ul', 'az-sigs')
      for (const sig of data.signals) {
        const li = h('li')
        const linkable = valid.has(sig.pid)
        const item = h(linkable ? 'button' : 'div', 'az-sig')
        if (linkable) {
          item.type = 'button'
          item.title = 'Show this passage on the page'
          item.addEventListener('click', () => scrollTo(sig.pid))
        }
        const kc = KIND_COLORS[sig.kind] || 'var(--mm-fg-2)'
        item.style.setProperty('--c', kc)
        const top = h('span', 'az-sig-top')
        const kind = h('span', 'mm-badge az-kind')
        kind.style.setProperty('--c', kc)
        const dot = h('span', 'mm-dot')
        dot.style.setProperty('--c', kc)
        kind.append(dot, sig.kind)
        top.append(kind)
        if (linkable) {
          const chip = h('span', 'mm-cite', `¶${sig.pid.slice(1)}`)
          chip.dataset.pid = sig.pid
          chip.setAttribute('aria-label', `source paragraph ${sig.pid.slice(1)}`)
          top.append(chip)
        }
        item.append(top)
        if (sig.quote) item.append(h('span', 'az-quote', `“${sig.quote}”`))
        if (sig.reason) item.append(h('span', 'az-why', sig.reason))
        li.append(item)
        list.append(li)
      }
      wrap.append(list)
    }
    biasCard.body.replaceChildren(wrap)
  }

  // ───────── (b) fact check ─────────
  function factIdle() {
    factCard.tools.replaceChildren()
    const intro = h('p', 'az-intro', 'Claude picks the 3–5 most important checkable claims on this page and verifies each one with live web search, preferring primary and reputable sources. Every verdict links back to the paragraph it came from.')
    const meta = h('div', 'az-meta')
    const pill = h('span', 'az-pill')
    searchText = document.createTextNode('')
    pill.append(icon('globe'), searchText)
    updateSearchPill()
    const change = h('button', null, 'Change')
    change.type = 'button'
    change.setAttribute('aria-label', 'Change the web search limit in settings')
    change.addEventListener('click', () => ctx.openHub('settings'))
    pill.append(change)
    meta.append(pill)
    factCard.body.replaceChildren(intro, meta, cta('Check facts', 'shield', runFact))
  }

  function updateSearchPill() {
    if (!searchText) return
    const n = Number(ctx.settings?.factCheckSearches) || 5
    searchText.textContent = `Up to ${n} web search${n === 1 ? '' : 'es'} per check · `
  }

  async function runFact() {
    factRun?.ctrl.abort()
    const ctrl = new AbortController()
    const run = { ctrl, key: null }
    factRun = run
    const stale = () => factRun !== run || (run.key && run.key !== key)
    factCard.tools.replaceChildren()
    const { row, label } = statusRow('Picking the key claims…', () => factRun?.ctrl.abort())
    const raw = h('pre', 'fc-raw mm-caret')
    raw.setAttribute('aria-label', 'Live fact-check output')
    raw.tabIndex = 0
    factCard.body.replaceChildren(row, raw)
    let text = ''
    let timer = 0
    const paint = () => {
      timer = 0
      if (stale()) return
      const stick = raw.scrollHeight - raw.scrollTop - raw.clientHeight < 40
      raw.textContent = text
      if (stick) raw.scrollTop = raw.scrollHeight
      const n = (text.match(/^\s{0,3}(?:#{1,6}\s+|\*\*)\s*(?:\d+[.)]\s*)?Claim\b/gim) || []).length
      label.textContent = n ? `Verified ${n} claim${n === 1 ? '' : 's'} so far · still searching…` : 'Searching the web and weighing sources…'
    }
    try {
      const page = await pageForRun()
      if (stale()) return
      if (page.key !== key) show(page)
      run.key = page.key
      label.textContent = 'Searching the web and weighing sources…'
      const res = await ctx.runTask('factcheck', { page }, {
        signal: ctrl.signal,
        onText: d => {
          if (stale()) return
          text += d
          if (!timer) timer = setTimeout(paint, 90)
        },
      })
      clearTimeout(timer)
      if (stale()) return
      const entry = { text: res?.text || text, sources: Array.isArray(res?.sources) ? res.sources : [], truncated: !!res?.truncated, pids: page.paragraphs.map(p => p.id) }
      cacheSet(page.key, 'fact', entry)
      const n = renderFact(entry)
      factCard.live.textContent = n ? `Fact-check ready: ${n} claim${n === 1 ? '' : 's'} checked.` : 'Fact-check ready.'
    } catch (e) {
      clearTimeout(timer)
      if (stale()) return
      if (e?.code === 'ABORT' || ctrl.signal.aborted) {
        const prev = cacheGet(run.key || key)?.fact
        if (prev) renderFact(prev); else factIdle()
        ctx.toast('Fact-check stopped')
      } else errorView(factCard.body, e, runFact)
    } finally {
      if (factRun === run) factRun = null
    }
  }

  function md(markdown, valid) {
    const el = h('div', 'mm-md')
    el.innerHTML = ctx.renderMarkdown(markdown) // DOMPurify-sanitized
    for (const a of el.querySelectorAll('a[href]')) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
    linkCitations(el, scrollTo, { validPids: valid })
    glueCites(el)
    return el
  }

  function citeChip(pid) {
    const b = h('button', 'mm-cite', `¶${pid.slice(1)}`)
    b.type = 'button'
    b.dataset.pid = pid
    b.title = `Jump to paragraph ${pid.slice(1)} on the page`
    b.setAttribute('aria-label', `Show source paragraph ${pid.slice(1)}`)
    b.addEventListener('click', () => scrollTo(pid))
    return b
  }

  function renderFact(entry) {
    const valid = new Set(entry.pids)
    factCard.tools.replaceChildren(rerunButton('Check facts again', runFact))
    const wrap = h('div', 'mm-stack az-fade')
    const parsed = parseFactcheck(entry.text)
    factSeq++

    if (!parsed.claims.length) {
      // Unexpected format: show Claude's answer as-is rather than nothing.
      if (entry.text.trim()) wrap.append(md(entry.text, valid))
      else wrap.append(h('p', 'az-empty', 'Claude didn’t return any checkable claims for this page.'))
    } else {
      const tally = h('div', 'fc-tally')
      tally.setAttribute('aria-label', 'Verdict summary')
      for (const v of Object.keys(VERDICTS)) {
        const count = parsed.claims.filter(c => c.verdict === v).length
        if (!count) continue
        const pill = h('span')
        pill.style.setProperty('--c', VERDICTS[v].c)
        const dot = h('span', 'mm-dot')
        dot.style.setProperty('--c', VERDICTS[v].c)
        pill.append(dot, h('b', null, String(count)), ` ${VERDICTS[v].label}`)
        tally.append(pill)
      }
      const sub = h('div', 'az-sub')
      sub.append(h('h3', null, `${parsed.claims.length} claim${parsed.claims.length === 1 ? '' : 's'} checked`))
      const toggleAll = button('mm-btn ghost sm', 'expand', 'Expand all')
      sub.append(toggleAll)

      const list = h('ul', 'fc-list')
      const items = parsed.claims.map((c, i) => {
        const vid = `fc-${factSeq}-${i}`
        const li = h('li', 'fc-item')
        li.style.setProperty('--c', VERDICTS[c.verdict].c)
        li.dataset.verdict = c.verdict
        const head = h('h3')
        const btn = h('button', 'fc-toggle')
        btn.type = 'button'
        btn.id = `${vid}-h`
        btn.setAttribute('aria-expanded', 'false')
        btn.setAttribute('aria-controls', `${vid}-b`)
        const badge = h('span', 'mm-badge fc-badge', VERDICTS[c.verdict].label)
        badge.dataset.v = c.verdict
        badge.style.setProperty('--c', VERDICTS[c.verdict].c)
        if (c.verdictText && c.verdictText.toLowerCase() !== VERDICTS[c.verdict].label.toLowerCase()) badge.title = `Claude’s verdict: ${c.verdictText}`
        const claim = h('span', 'claim', c.claim)
        btn.append(badge, claim, icon('chev', 'mm-icon chev'))
        head.append(btn)
        li.append(head)
        const pids = c.pids.filter(p => valid.has(p))
        if (pids.length) {
          const cites = h('span', 'fc-cites')
          for (const p of pids.slice(0, 3)) cites.append(citeChip(p))
          li.append(cites)
        }
        const body = h('div', 'fc-body')
        body.id = `${vid}-b`
        body.setAttribute('role', 'region')
        body.setAttribute('aria-labelledby', btn.id)
        body.hidden = true
        body.append(c.explanation ? md(c.explanation, valid) : h('p', 'az-empty', 'No explanation was given for this verdict.'))
        li.append(body)
        btn.addEventListener('click', () => setOpen(li, btn, body, btn.getAttribute('aria-expanded') !== 'true'))
        list.append(li)
        return { li, btn, body }
      })
      const syncToggleAll = () => {
        const allOpen = items.every(x => x.btn.getAttribute('aria-expanded') === 'true')
        toggleAll.querySelector('span').textContent = allOpen ? 'Collapse all' : 'Expand all'
        toggleAll.setAttribute('aria-label', allOpen ? 'Collapse all claims' : 'Expand all claims')
      }
      function setOpen(li, btn, body, open) {
        btn.setAttribute('aria-expanded', String(open))
        body.hidden = !open
        li.classList.toggle('open', open)
        syncToggleAll()
      }
      toggleAll.addEventListener('click', () => {
        const open = !items.every(x => x.btn.getAttribute('aria-expanded') === 'true')
        for (const x of items) setOpen(x.li, x.btn, x.body, open)
      })
      // WAI-ARIA accordion keys: ↑/↓ move between headers, Home/End jump.
      list.addEventListener('keydown', e => {
        const i = items.findIndex(x => x.btn === document.activeElement)
        if (i < 0) return
        const to = e.key === 'ArrowDown' ? (i + 1) % items.length : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1
        if (to < 0) return
        e.preventDefault()
        items[to].btn.focus()
      })
      syncToggleAll()
      wrap.append(tally, sub, list)
    }

    if (entry.truncated) wrap.append(h('p', 'az-warn', 'The response hit the length limit, so some claims may be missing.'))

    if (parsed.claims.length && parsed.overall) {
      const box = h('section', 'fc-overall')
      box.setAttribute('aria-label', 'Overall assessment')
      box.append(h('h3', null, 'Overall assessment'), md(parsed.overall, valid))
      wrap.append(box)
    }

    const srcHead = h('div', 'az-sub')
    const sources = []
    const seen = new Set()
    for (const s of entry.sources) {
      const url = safeUrl(s?.url)
      if (!url || seen.has(url)) continue
      seen.add(url)
      sources.push({ url, title: String(s.title || '').trim() || siteOf(url) || url })
    }
    srcHead.append(h('h3', null, `Sources${sources.length ? ` (${sources.length})` : ''}`))
    wrap.append(srcHead)
    if (!sources.length) wrap.append(h('p', 'az-empty', 'No web sources were returned for this check.'))
    else {
      const ol = h('ol', 'fc-sources')
      for (const s of sources) {
        const li = h('li')
        const a = h('a', 'fc-src')
        a.href = s.url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.title = s.url
        const t = h('span', 't')
        t.append(h('b', null, s.title), h('span', null, siteOf(s.url)))
        a.append(h('span', 'n'), t, icon('ext'))
        a.setAttribute('aria-label', `${s.title} (${siteOf(s.url)}), opens in a new tab`)
        li.append(a)
        ol.append(li)
      }
      wrap.append(ol)
    }

    if (parsed.claims.length) {
      const details = h('details', 'fc-rawbox')
      const summary = h('summary', null, 'View Claude’s full response')
      details.append(summary)
      details.addEventListener('toggle', () => {
        if (details.open && details.childElementCount === 1) details.append(md(entry.text, valid))
      })
      wrap.append(details)
    }
    factCard.body.replaceChildren(wrap)
    return parsed.claims.length
  }

  // ───────── page lifecycle ─────────
  function show(page) {
    const restricted = !page && !!ctx.pageError
    blocked.hidden = !restricted
    biasCard.el.hidden = restricted
    factCard.el.hidden = restricted
    if (restricted) blocked.replaceChildren(icon('lock'), h('b', null, 'Can’t analyze this page'), document.createTextNode(ctx.pageError))
    const k = page?.key || null
    const changed = k !== key
    // Abandon work that belongs to another page. A run still waiting for its page (key unknown) keeps going.
    if (biasRun?.key && biasRun.key !== k) { biasRun.ctrl.abort(); biasRun = null }
    if (factRun?.key && factRun.key !== k) { factRun.ctrl.abort(); factRun = null }
    key = k
    // Show this page's cached results (no re-spend), or the idle card.
    const entry = cacheGet(k)
    if (!biasRun && (changed || !biasCard.body.childElementCount)) { if (entry?.bias) renderBias(entry.bias, false); else biasIdle() }
    if (!factRun && (changed || !factCard.body.childElementCount)) { if (entry?.fact) renderFact(entry.fact); else factIdle() }
  }

  ctx.onSettings?.(() => updateSearchPill())
  show(ctx.page)
  if (!ctx.page && !ctx.pageError) ctx.getPage().then(() => show(ctx.page), () => show(ctx.page))

  return {
    onShow() { if ((ctx.page?.key || null) !== key) show(ctx.page) },
    onPage(page) { show(page) },
  }
}
