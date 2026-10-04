// Ask tab: the Page-Grounded Q&A Console.
// Streams the `qa` task as live Markdown (throttled re-render + caret), turns [pN] markers into
// citation chips that scroll the page to the source paragraph, and keeps a short per-page
// conversation that is sent as `history` and cleared whenever the page changes.
import { linkCitations, citeHandler } from '../cite.js'

const HISTORY_TURNS = 8 // question/answer pairs remembered per page and sent as history
const NS = 'http://www.w3.org/2000/svg'

// Static, trusted icon markup (never interpolated with data).
const ICONS = {
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M3 20h18"/>',
  shield: '<path d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 16.8h.01"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.1.9 1.9V16h5.4v-.3c0-.8.3-1.4.9-1.9A6 6 0 0 0 12 3z"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.2" fill="currentColor" stroke="none"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  note: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  retry: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  arrow: '<path d="M9 6l6 6-6 6"/>',
}

const SUGGESTIONS = [
  { short: 'Main argument', q: 'What is the author’s main argument?', icon: 'target', c: 'var(--mm-cyan)' },
  { short: 'Counter-argument', q: 'What is the author’s main counter-argument?', icon: 'swap', c: 'var(--mm-violet)' },
  { short: 'Data points', q: 'Extract all data points mentioned here', icon: 'chart', c: 'var(--mm-lime)' },
  { short: 'Evidence', q: 'What evidence supports the main claim?', icon: 'shield', c: 'var(--mm-amber)' },
  { short: 'Missing or unclear', q: 'What’s missing or unclear?', icon: 'help', c: 'var(--mm-pink)' },
  { short: 'Explain simply', q: 'Explain the hardest idea simply', icon: 'bulb', c: 'var(--mm-accent-2)' },
]

const CSS = `
#panel-ask.ask-root { padding: 0; gap: 0; overflow: hidden; }
.ask-root .ask-sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.ask-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 12px 18px; display: flex; flex-direction: column; gap: 14px; overscroll-behavior: contain; }

.ask-hero { text-align: center; padding: 14px 2px 2px; }
.ask-orb { width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 16px; display: grid; place-items: center; color: var(--mm-accent);
  background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--mm-accent) 30%, transparent), transparent 70%), rgba(255,255,255,.03);
  border: 1px solid color-mix(in srgb, var(--mm-accent) 35%, transparent); box-shadow: 0 0 28px color-mix(in srgb, var(--mm-accent) 22%, transparent), inset 0 1px 0 rgba(255,255,255,.08); }
.ask-orb svg { width: 24px; height: 24px; }
.ask-hero h2 { font-size: 18px; }
.ask-hero .ask-lede { margin: 6px auto 0; max-width: 310px; font-size: 13px; color: var(--mm-fg-2); line-height: 1.5; }
.ask-ready { display: inline-flex; align-items: center; gap: 7px; margin: 12px 0 16px; padding: 5px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; color: var(--mm-fg-2); background: rgba(255,255,255,.04); border: 1px solid var(--mm-border); }
.ask-ready .mm-spinner { width: 12px; height: 12px; border-width: 2px; }
.ask-suggest { display: grid; gap: 7px; text-align: left; margin: 0; padding: 0; list-style: none; }
.ask-sugg { --c: var(--mm-accent); width: 100%; display: flex; align-items: center; gap: 11px; padding: 9px 11px; border-radius: 12px; background: var(--mm-glass); border: 1px solid var(--mm-border);
  color: var(--mm-fg); font: 500 13px/1.35 var(--mm-font); cursor: pointer; text-align: left; backdrop-filter: var(--mm-blur); transition: border-color .15s, background .15s, transform .15s var(--mm-ease); }
.ask-sugg:hover { background: var(--mm-glass-hover); border-color: color-mix(in srgb, var(--c) 45%, transparent); transform: translateX(2px); }
.ask-sugg:disabled { opacity: .5; cursor: default; transform: none; }
.ask-sugg .ico { width: 28px; height: 28px; flex: none; border-radius: 8px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent); border: 1px solid color-mix(in srgb, var(--c) 28%, transparent); }
.ask-sugg .ico svg { width: 15px; height: 15px; }
.ask-sugg .txt { flex: 1; min-width: 0; }
.ask-sugg .go { width: 14px; height: 14px; color: var(--mm-muted); opacity: .6; transition: opacity .15s, transform .15s; }
.ask-sugg:hover .go { opacity: 1; transform: translateX(2px); color: var(--c); }

.ask-blocked { margin: 28px 6px; padding: 26px 18px; text-align: center; border-radius: var(--mm-radius); background: var(--mm-glass); border: 1px dashed var(--mm-border-strong); color: var(--mm-muted); font-size: 13px; }
.ask-blocked svg { width: 26px; height: 26px; color: var(--mm-fg-2); margin-bottom: 8px; }
.ask-blocked b { display: block; color: var(--mm-fg); font-size: 14px; margin-bottom: 4px; }

.ask-log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 18px; }
.ask-turn { display: flex; flex-direction: column; gap: 8px; animation: ask-in .22s var(--mm-ease); }
@keyframes ask-in { from { opacity: 0; transform: translateY(6px); } }
.ask-q { align-self: flex-end; max-width: 88%; padding: 9px 13px; border-radius: 15px 15px 4px 15px; color: var(--mm-heading); font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mm-accent) 20%, rgba(22,26,38,.9)), color-mix(in srgb, var(--mm-accent-2) 16%, rgba(22,26,38,.9)));
  border: 1px solid color-mix(in srgb, var(--mm-accent) 30%, transparent); box-shadow: 0 6px 22px rgba(0,0,0,.25); }
.ask-a { position: relative; padding: 11px 13px 10px; border-radius: 4px 15px 15px 15px; background: var(--mm-glass); border: 1px solid var(--mm-border); backdrop-filter: var(--mm-blur); box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
.ask-a.live { border-color: color-mix(in srgb, var(--mm-accent) 30%, transparent); box-shadow: 0 0 22px color-mix(in srgb, var(--mm-accent) 10%, transparent), inset 0 1px 0 rgba(255,255,255,.05); }
.ask-a-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; font: 700 10.5px/1 var(--mm-font); letter-spacing: .08em; text-transform: uppercase; color: var(--mm-muted); }
.ask-avatar { width: 18px; height: 18px; border-radius: 6px; display: grid; place-items: center; background: var(--mm-gradient); color: #06080D; flex: none; }
.ask-avatar svg { width: 11px; height: 11px; stroke-width: 2.4; }
.ask-state { margin-left: auto; font-weight: 600; letter-spacing: .02em; text-transform: none; font-size: 11px; color: var(--mm-muted); display: inline-flex; align-items: center; gap: 6px; }
.ask-state[data-s="streaming"], .ask-state[data-s="pending"] { color: var(--mm-accent); }
.ask-state .mm-spinner { width: 11px; height: 11px; border-width: 2px; }
.ask-state[data-s="error"] { color: var(--mm-red); }
.ask-state[data-s="stopped"] { color: var(--mm-amber); }
.ask-body { min-height: 20px; }
.ask-body > .mm-md { font-size: 13.5px; }
.ask-body .mm-cite { vertical-align: 1px; }
.ask-root .mm-cite-run { white-space: nowrap; }
.ask-body .mm-error { margin-top: 6px; }
.ask-typing { display: inline-flex; gap: 4px; padding: 6px 0 4px; }
.ask-typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--mm-accent); opacity: .3; animation: ask-dot 1.1s infinite ease-in-out; box-shadow: 0 0 8px var(--mm-accent); }
.ask-typing i:nth-child(2) { animation-delay: .15s; } .ask-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes ask-dot { 40% { opacity: 1; transform: translateY(-3px); } }
.ask-note { margin: 6px 0 0; font-size: 12px; color: var(--mm-muted); }
.ask-note.warn { color: var(--mm-amber); }
.ask-actions { display: flex; flex-wrap: wrap; gap: 2px; margin: 9px -5px -3px; padding-top: 7px; border-top: 1px solid var(--mm-border); }
.ask-actions .mm-btn { font-weight: 600; }
.ask-actions .mm-btn svg { width: 14px; height: 14px; }
.ask-actions .mm-btn.done { color: var(--mm-lime); }

.ask-dock { flex: none; padding: 8px 12px 11px; border-top: 1px solid var(--mm-border); background: rgba(11,12,16,.78); backdrop-filter: var(--mm-blur); }
.ask-chips { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 8px; margin: 0 -2px; scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent); mask-image: linear-gradient(90deg, #000 88%, transparent); }
.ask-chips::-webkit-scrollbar { display: none; }
.ask-chips .mm-chip { flex: none; padding: 5px 9px; font-size: 11.5px; }
.ask-chips .mm-chip svg { width: 12px; height: 12px; color: var(--c); }
.ask-chips .mm-chip:disabled { opacity: .45; cursor: default; }
.ask-composer { display: flex; align-items: flex-end; gap: 8px; padding: 5px 5px 5px 12px; border-radius: 14px; background: rgba(0,0,0,.32); border: 1px solid var(--mm-border-strong); transition: border-color .15s, box-shadow .15s; }
.ask-composer:focus-within { border-color: var(--mm-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mm-accent) 18%, transparent); }
.ask-composer.off { opacity: .55; }
.ask-input { flex: 1; min-width: 0; resize: none; border: 0; background: transparent; color: var(--mm-fg); font: 13.5px/1.45 var(--mm-font); padding: 7px 0; height: 34px; max-height: 168px; overflow-y: hidden; outline: none; }
.ask-input:focus-visible { outline: none; }
.ask-input::placeholder { color: var(--mm-muted); }
.ask-send { width: 34px; height: 34px; padding: 0; border-radius: 10px; flex: none; }
.ask-send svg { width: 16px; height: 16px; stroke-width: 2.4; }
.ask-send.stop { background: color-mix(in srgb, var(--mm-red) 16%, transparent); color: var(--mm-red); border-color: color-mix(in srgb, var(--mm-red) 45%, transparent); box-shadow: 0 0 16px color-mix(in srgb, var(--mm-red) 22%, transparent); }
.ask-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; min-height: 22px; font-size: 11px; color: var(--mm-muted); }
.ask-foot kbd { font-size: 10px; padding: 0 5px; }
.ask-foot .mm-btn { padding: 4px 8px; font-size: 11.5px; }
.ask-foot .mm-btn svg { width: 13px; height: 13px; }
@media (prefers-reduced-motion: reduce) { .ask-sugg:hover, .ask-sugg:hover .go { transform: none; } }
`

function injectStyle() {
  if (document.getElementById('mm-style-ask')) return
  const s = document.createElement('style')
  s.id = 'mm-style-ask'
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

function button(cls, iconName, label, { aria, title } = {}) {
  const b = h('button', cls)
  b.type = 'button'
  if (iconName) b.append(icon(iconName))
  if (label) b.append(h('span', null, label))
  if (aria) b.setAttribute('aria-label', aria)
  if (title) b.title = title
  return b
}

/** "[p3][p9]" → "(¶3, ¶9)" so saved/copied text reads well outside the panel. */
export function plainRefs(md) {
  return String(md || '').replace(/(?:[ \t]*\[p\d+\])+/g, m => ` (${[...m.matchAll(/\[p(\d+)\]/g)].map(x => `¶${x[1]}`).join(', ')})`)
}

/** The innermost last block of rendered Markdown, where the streaming caret should sit. */
function caretTarget(body) {
  let el = body.lastElementChild
  while (el && /^(UL|OL|BLOCKQUOTE|LI|TABLE|THEAD|TBODY|TR|DIV|DETAILS)$/.test(el.tagName) && el.lastElementChild) el = el.lastElementChild
  return el && !/^(PRE|HR|TABLE|IMG)$/.test(el.tagName) ? el : body
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

/** Links inside answers must never navigate the side panel itself. */
function externalLinks(root) {
  for (const a of root.querySelectorAll('a[href]')) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
}

export function mount(root, ctx) {
  injectStyle()
  root.classList.add('ask-root')
  root.replaceChildren()

  const jump = citeHandler(ctx)
  const onCite = pid => Promise.resolve(jump(pid)).then(r => {
    if (r && r.found === false) ctx.toast('That paragraph isn’t on the page anymore. Try refreshing.')
  })

  /** @type {{id:number, q:string, a:string, key:string|null, pids:Set<string>|null, source:{url:string,title:string}|null, status:string, truncated:boolean, dead:boolean, timer:any, last:number, els:any}[]} */
  let turns = []
  let convKey = null // page key the current conversation belongs to
  let run = null // { turn, ctrl }
  let seq = 0
  let savedScroll = null

  // ───────── static layout ─────────
  const scroller = h('div', 'ask-scroll')
  const hero = h('section', 'ask-hero')
  hero.setAttribute('aria-labelledby', 'ask-hero-title')
  const orb = h('div', 'ask-orb')
  orb.append(icon('spark'))
  const heroTitle = h('h2', null, 'Ask this page')
  heroTitle.id = 'ask-hero-title'
  const lede = h('p', 'ask-lede', 'Answers come only from the page you’re reading, with citations that jump to the exact paragraph.')
  const ready = h('div', 'ask-ready')
  ready.setAttribute('role', 'status')
  const suggest = h('ul', 'ask-suggest')
  suggest.setAttribute('aria-label', 'Suggested questions')
  const suggestBtns = SUGGESTIONS.map(s => {
    const li = h('li')
    const b = h('button', 'ask-sugg')
    b.type = 'button'
    b.style.setProperty('--c', s.c)
    const ico = h('span', 'ico')
    ico.append(icon(s.icon))
    b.append(ico, h('span', 'txt', s.q), icon('arrow', 'mm-icon go'))
    b.addEventListener('click', () => ask(s.q))
    li.append(b)
    suggest.append(li)
    return b
  })
  hero.append(orb, heroTitle, lede, ready, suggest)

  const blocked = h('div', 'ask-blocked')
  blocked.setAttribute('role', 'status')
  blocked.hidden = true

  const log = h('ol', 'ask-log')
  log.setAttribute('aria-label', 'Conversation about this page')
  scroller.append(hero, blocked, log)

  const dock = h('div', 'ask-dock')
  const chipRow = h('div', 'ask-chips')
  chipRow.setAttribute('role', 'group')
  chipRow.setAttribute('aria-label', 'Quick questions')
  const chipBtns = SUGGESTIONS.map(s => {
    const b = h('button', 'mm-chip')
    b.type = 'button'
    b.style.setProperty('--c', s.c)
    b.title = s.q
    b.setAttribute('aria-label', s.q)
    b.append(icon(s.icon), h('span', null, s.short))
    b.addEventListener('click', () => ask(s.q))
    chipRow.append(b)
    return b
  })
  const form = h('form', 'ask-composer')
  form.setAttribute('aria-label', 'Ask about this page')
  const input = h('textarea', 'ask-input')
  input.id = 'ask-input'
  input.rows = 1
  input.placeholder = 'Ask anything about this page…'
  input.setAttribute('aria-label', 'Question about this page')
  input.setAttribute('aria-describedby', 'ask-hint')
  input.setAttribute('enterkeyhint', 'send')
  const sendBtn = h('button', 'mm-btn primary icon ask-send')
  sendBtn.type = 'submit'
  form.append(input, sendBtn)
  const foot = h('div', 'ask-foot')
  const hint = h('span', 'ask-hint')
  hint.id = 'ask-hint'
  hint.append(h('kbd', null, 'Enter'), ' to send · ', h('kbd', null, 'Shift'), '+', h('kbd', null, 'Enter'), ' new line')
  const clearBtn = button('mm-btn ghost sm', 'plus', 'New chat', { title: 'Clear this conversation' })
  foot.append(hint, clearBtn)
  dock.append(chipRow, form, foot)
  root.append(scroller, dock)

  // ───────── helpers ─────────
  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 64
  const toEnd = () => { scroller.scrollTop = scroller.scrollHeight }

  function autosize() {
    input.style.height = 'auto'
    const next = Math.min(input.scrollHeight, 168)
    input.style.height = `${Math.max(34, next)}px`
    input.style.overflowY = input.scrollHeight > 168 ? 'auto' : 'hidden'
  }

  function setSendMode(running) {
    sendBtn.replaceChildren(icon(running ? 'stop' : 'send'))
    sendBtn.classList.toggle('stop', running)
    sendBtn.classList.toggle('primary', !running)
    sendBtn.setAttribute('aria-label', running ? 'Stop generating' : 'Send question')
    sendBtn.title = running ? 'Stop (Esc)' : 'Send (Enter)'
  }

  function renderState() {
    const page = ctx.page
    const restricted = !page && !!ctx.pageError
    const hasTurns = turns.length > 0
    const running = !!run
    hero.hidden = hasTurns || restricted
    blocked.hidden = !restricted
    if (restricted) {
      blocked.replaceChildren(icon('lock'), h('b', null, 'Can’t read this page'), document.createTextNode(ctx.pageError))
    }
    const readyText = page ? `${page.paragraphs.length} paragraph${page.paragraphs.length === 1 ? '' : 's'} ready to cite` : 'Reading this page…'
    if (!hero.hidden && ready.dataset.text !== readyText) { // only touch the live region when it changes
      ready.dataset.text = readyText
      const lead = h('span', page ? 'mm-dot' : 'mm-spinner')
      if (page) lead.style.setProperty('--c', 'var(--mm-lime)')
      ready.replaceChildren(lead, readyText)
    }
    chipRow.hidden = !hasTurns || restricted
    for (const b of [...suggestBtns, ...chipBtns]) b.disabled = restricted || running
    input.disabled = restricted
    form.classList.toggle('off', restricted)
    input.placeholder = restricted ? 'This page can’t be read' : hasTurns ? 'Ask a follow-up…' : 'Ask anything about this page…'
    setSendMode(running)
    sendBtn.disabled = !running && (restricted || !input.value.trim())
    clearBtn.hidden = !hasTurns
    hint.hidden = restricted
  }

  // ───────── turns ─────────
  function mountTurn(turn) {
    const li = h('li', 'ask-turn')
    const q = h('div', 'ask-q')
    q.append(h('span', 'ask-sr', 'You asked: '), turn.q)
    const a = h('article', 'ask-a live')
    a.setAttribute('aria-label', 'Answer')
    const head = h('div', 'ask-a-head')
    const av = h('span', 'ask-avatar')
    av.append(icon('spark'))
    const state = h('span', 'ask-state')
    head.append(av, h('span', null, 'Master Mind'), state)
    const body = h('div', 'ask-body')
    body.setAttribute('aria-live', 'polite')
    body.setAttribute('aria-busy', 'true')
    const typing = h('span', 'ask-typing')
    typing.setAttribute('role', 'img')
    typing.setAttribute('aria-label', 'Thinking')
    typing.append(h('i'), h('i'), h('i'))
    body.append(typing)
    const actions = h('div', 'ask-actions')
    actions.hidden = true
    a.append(head, body, actions)
    li.append(q, a)
    log.append(li)
    turn.els = { li, a, state, body, actions }
    setState(turn, 'pending')
  }

  function setState(turn, s) {
    turn.status = s
    const el = turn.els.state
    el.dataset.s = s
    el.replaceChildren()
    if (s === 'pending') el.append(h('span', 'mm-spinner'), 'Reading the page')
    else if (s === 'streaming') el.textContent = 'Writing…'
    else if (s === 'stopped') el.textContent = 'Stopped'
    else if (s === 'error') el.textContent = 'Failed'
    else if (s === 'done') {
      const n = new Set((turn.a.match(/\[p\d+\]/g) || []).filter(m => !turn.pids || turn.pids.has(m.slice(1, -1)))).size
      el.textContent = n ? `${n} source paragraph${n === 1 ? '' : 's'}` : 'No citations'
    }
  }

  function renderAnswer(turn, streaming) {
    const { body } = turn.els
    const stick = nearBottom()
    const md = h('div', 'mm-md')
    md.innerHTML = ctx.renderMarkdown(turn.a) // DOMPurify-sanitized
    externalLinks(md)
    if (turn.pids) { linkCitations(md, onCite, { validPids: turn.pids }); glueCites(md) }
    if (streaming) caretTarget(md).classList.add('mm-caret')
    body.replaceChildren(md)
    if (stick) toEnd()
  }

  function scheduleRender(turn) {
    if (turn.timer) return
    // Re-render at most every ~60ms, backing off for long answers so Markdown parsing never hogs the thread.
    const every = Math.min(260, 60 + turn.a.length / 30)
    const wait = Math.max(0, turn.last + every - performance.now())
    turn.timer = setTimeout(() => {
      turn.timer = 0
      if (turn.dead || turn.status !== 'streaming') return
      turn.last = performance.now()
      renderAnswer(turn, true)
    }, wait)
  }

  function finish(turn, status, err) {
    clearTimeout(turn.timer)
    turn.timer = 0
    turn.els.a.classList.remove('live')
    turn.els.body.setAttribute('aria-busy', 'false')
    const hasText = !!turn.a.trim()
    if (hasText) renderAnswer(turn, false)
    else turn.els.body.replaceChildren()
    const { body } = turn.els
    if (status === 'done') {
      if (!hasText) body.append(h('p', 'ask-note', 'Claude returned an empty answer. Try rephrasing the question.'))
      if (turn.truncated) body.append(h('p', 'ask-note warn', 'The answer hit the length limit and was cut off.'))
    } else if (status === 'stopped') {
      body.append(h('p', 'ask-note warn', hasText ? 'Stopped. The answer above is incomplete.' : 'Stopped before an answer arrived.'))
    } else if (status === 'error') {
      body.append(ctx.errorBox(err))
    }
    setState(turn, status)
    renderActions(turn)
  }

  function renderActions(turn) {
    const { actions } = turn.els
    actions.replaceChildren()
    const hasText = !!turn.a.trim()
    if (hasText) {
      const copy = button('mm-btn ghost sm', 'copy', 'Copy', { aria: 'Copy answer' })
      copy.addEventListener('click', () => copyAnswer(turn, copy))
      const save = button('mm-btn ghost sm', 'note', 'Save to notes', { aria: 'Save question and answer to notes' })
      save.addEventListener('click', () => saveToNotes(turn, save))
      actions.append(copy, save)
    }
    if (turn.status === 'error' || turn.status === 'stopped') {
      const retry = button('mm-btn ghost sm', 'retry', 'Retry', { aria: 'Ask this question again' })
      retry.addEventListener('click', () => {
        removeTurn(turn)
        ask(turn.q)
      })
      actions.append(retry)
    }
    actions.hidden = !actions.childElementCount
  }

  const flashes = new WeakMap() // button → { orig: Node[], t }
  function flash(btn, label) {
    const f = flashes.get(btn) || { orig: [...btn.childNodes], t: 0 }
    flashes.set(btn, f)
    clearTimeout(f.t)
    btn.replaceChildren(icon('check'), h('span', null, label))
    btn.classList.add('done')
    f.t = setTimeout(() => { btn.replaceChildren(...f.orig); btn.classList.remove('done') }, 1600)
  }

  async function copyAnswer(turn, btn) {
    try {
      await navigator.clipboard.writeText(plainRefs(turn.a).trim())
      flash(btn, 'Copied')
      ctx.toast('Answer copied')
    } catch {
      ctx.toast('Couldn’t copy. Select the text and copy it manually.')
    }
  }

  // The panel keeps the Notes tab mounted (and queues bus events), so emitting is enough.
  async function saveToNotes(turn, btn) {
    const markdown = `**Q: ${turn.q.replace(/\s+/g, ' ').trim()}**\n\n${plainRefs(turn.a).trim()}\n`
    try {
      ctx.emit('insert-note', { markdown, source: turn.source || { url: ctx.tab?.url || '', title: ctx.tab?.title || '' } })
      flash(btn, 'Saved')
      ctx.toast('Saved to notes')
    } catch (e) {
      ctx.toast(`Couldn’t save to notes: ${e?.message || e}`)
    }
  }

  function removeTurn(turn) {
    turn.dead = true
    clearTimeout(turn.timer)
    turn.els?.li.remove()
    turns = turns.filter(t => t !== turn)
  }

  function historyFor(key, current) {
    return turns
      .filter(t => t !== current && t.key === key && t.status === 'done' && t.a.trim())
      .slice(-HISTORY_TURNS)
      .flatMap(t => [{ role: 'user', content: t.q }, { role: 'assistant', content: t.a }])
  }

  function stop() { run?.ctrl.abort() }

  /** Abort anything in flight and forget the conversation (page changed or "New chat"). */
  function reset() {
    stop()
    run = null
    for (const t of turns) { t.dead = true; clearTimeout(t.timer) }
    turns = []
    convKey = null
    log.replaceChildren()
  }

  async function ask(raw) {
    const question = String(raw || '').trim()
    if (!question) return
    if (!ctx.page && ctx.pageError) return ctx.toast(ctx.pageError)
    if (run) stop()
    const turn = { id: ++seq, q: question, a: '', key: null, pids: null, source: null, status: 'pending', truncated: false, dead: false, timer: 0, last: 0, els: null }
    turns.push(turn)
    mountTurn(turn)
    const ctrl = new AbortController()
    run = { turn, ctrl }
    renderState()
    toEnd()
    try {
      const page = await ctx.getPage()
      if (turn.dead) return
      if (ctrl.signal.aborted) throw Object.assign(new Error('Stopped.'), { code: 'ABORT' })
      if (!page) throw new Error(ctx.pageError || 'Couldn’t read this page. Try refreshing it.')
      if (!page.paragraphs?.length) throw new Error('This page has no readable text to answer from.')
      // The tab navigated since the last answer: start a fresh conversation for this page.
      if (convKey && convKey !== page.key) for (const t of [...turns]) if (t !== turn) removeTurn(t)
      convKey = page.key
      turn.key = page.key
      turn.pids = new Set(page.paragraphs.map(p => p.id))
      turn.source = { url: page.url, title: page.title }
      const history = historyFor(page.key, turn)
      setState(turn, 'streaming')
      const res = await ctx.runTask('qa', { page, question, history }, {
        signal: ctrl.signal,
        onText: d => {
          if (turn.dead) return
          turn.a += d
          scheduleRender(turn)
        },
      })
      if (turn.dead) return
      if (res?.text) turn.a = res.text
      turn.truncated = !!res?.truncated
      finish(turn, 'done')
    } catch (e) {
      if (turn.dead) return
      finish(turn, e?.code === 'ABORT' || ctrl.signal.aborted ? 'stopped' : 'error', e)
    } finally {
      if (run?.turn === turn) run = null
      if (!turn.dead) renderState()
    }
  }

  // ───────── events ─────────
  form.addEventListener('submit', e => {
    e.preventDefault()
    if (run) return stop()
    const q = input.value
    if (!q.trim()) return
    input.value = ''
    autosize()
    ask(q)
  })
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      if (!run) form.requestSubmit()
    }
  })
  input.addEventListener('input', () => {
    autosize()
    sendBtn.disabled = !run && (input.disabled || !input.value.trim())
  })
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && run) { e.preventDefault(); stop() }
  })
  clearBtn.addEventListener('click', () => {
    reset()
    renderState()
    input.focus()
  })
  let scrollT
  scroller.addEventListener('scroll', () => {
    clearTimeout(scrollT)
    scrollT = setTimeout(() => { savedScroll = nearBottom() ? null : scroller.scrollTop }, 80)
  }, { passive: true })

  ctx.on('ask', data => {
    const q = String(data?.question || '').trim()
    if (!q) return
    ctx.showTab('ask')
    ask(q)
  })

  renderState()
  autosize()
  if (!ctx.page && !ctx.pageError) ctx.getPage().then(() => renderState(), () => renderState())

  return {
    onShow() {
      renderState()
      // Hidden panels lose their scroll offset; restore it (or stick to the newest answer).
      requestAnimationFrame(() => { if (savedScroll == null) toEnd(); else scroller.scrollTop = savedScroll })
    },
    onPage(page) {
      // Keep only turns that belong to this page. A turn still waiting for its page (no key yet) stays;
      // anything else from another page, or a failure from before the page was known, is cleared.
      const key = page?.key || null
      const keep = t => !!page && (t.key ? t.key === key : t.status === 'pending')
      if (turns.some(t => !keep(t))) {
        for (const t of [...turns]) {
          if (keep(t)) continue
          if (run?.turn === t) { stop(); run = null }
          removeTurn(t)
        }
        if (!turns.some(t => t.key)) convKey = null
        savedScroll = null
      }
      renderState()
    },
  }
}
