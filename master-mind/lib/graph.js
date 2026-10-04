// Knowledge graph model + force-directed layout.
// Pure ES module (no DOM): usable from extension pages, workers and the service worker.
//
//   buildGraph({pages, notes, highlights}, opts) → {nodes, links}
//   new ForceSimulation(nodes, links, opts) → .tick(), .reheat(), .pin(), .unpin(), .hot
//
// Node:  { id, type: 'page'|'entity'|'topic'|'note'|'site', label, degree, data }
// Link:  { source, target, type: 'mentions'|'about'|'cites'|'wiki'|'related'|'tagged'|'site', weight }
//        (source/target are node ids in buildGraph output; the simulation resolves them to nodes)
import { normalizeUrl, siteOf } from './text.js'

export const NODE_TYPES = ['page', 'entity', 'topic', 'note', 'site']
export const LINK_TYPES = ['mentions', 'about', 'cites', 'wiki', 'related', 'tagged', 'site']

const MAX_NAME = 90

/** Merge key for entity/topic names: case, whitespace, quotes, trailing punctuation and a leading "the" don't matter. */
export function normName(s) {
  let t = String(s ?? '').normalize('NFKC').toLowerCase()
  t = t.replace(/[‘’‚‛′`´]/g, "'").replace(/[“”„″]/g, '"')
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/[.,;:!?…]+$/g, '').trim()
  t = t.replace(/^the /, '')
  return t.length > MAX_NAME ? '' : t
}

/** `[[Title]]`, `[[Title|alias]]` and `[[Title#heading]]` → ['Title', ...] */
export function wikiLinks(md) {
  const out = []
  for (const m of String(md || '').matchAll(/\[\[([^\[\]\n|#]{1,200})(?:#[^\[\]\n|]*)?(?:\|[^\[\]\n]*)?\]\]/g)) {
    const t = m[1].trim()
    if (t) out.push(t)
  }
  return out
}

/** http(s) URLs found in Markdown text (links, autolinks and bare URLs). */
export function urlsIn(md) {
  const out = new Set()
  for (const m of String(md || '').matchAll(/https?:\/\/[^\s<>"'`\]\[()]+(?:\([^\s<>"'`()]*\)[^\s<>"'`\]\[()]*)*/gi)) {
    out.add(m[0].replace(/[.,;:!?*_~]+$/, ''))
  }
  return [...out]
}

/** Plain-text excerpt of Markdown for previews (never rendered as HTML). */
export function plainExcerpt(md, max = 240) {
  const s = String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a)
    .replace(/\s*\[p\d+\]/g, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/** Most used spelling wins; ties prefer "Agency" over "the Agency" and Capitalized over lowercase. */
const pickLabel = counts => {
  let best = '', n = -1
  for (const [label, c] of counts) {
    const score = c * 10 + (/^the\s/i.test(label) ? 0 : 2) + (/^\p{Lu}/u.test(label) ? 1 : 0)
    if (score > n) { best = label; n = score }
  }
  return best
}

/**
 * Build the knowledge graph from stored records.
 * @param {{pages?: object[], notes?: object[], highlights?: object[]}} data
 * @param {{sites?: boolean, relatedMin?: number, maxPairsPerEntity?: number}} [opts]
 */
export function buildGraph({ pages = [], notes = [], highlights = [] } = {}, { sites = false, relatedMin = 2, maxPairsPerEntity = 120 } = {}) {
  const nodes = new Map()
  const links = new Map()
  const named = new Map() // entity/topic id → { labels: Map(label → count), kinds: Map(kind → count), pages: Set(pageId) }

  const addNode = (id, type, label, data) => {
    let n = nodes.get(id)
    if (!n) { n = { id, type, label: String(label || ''), degree: 0, data: data || {} }; nodes.set(id, n) }
    return n
  }
  const addLink = (source, target, type, weight = 1) => {
    if (!source || !target || source === target) return
    // Symmetric relations are stored once regardless of direction.
    const sym = type === 'related' || (type === 'wiki' && source.startsWith('note:') && target.startsWith('note:'))
    const [a, b] = sym && source > target ? [target, source] : [source, target]
    const key = `${a}\u0000${b}\u0000${type}`
    const ex = links.get(key)
    if (ex) { ex.weight = Math.max(ex.weight, weight); return ex }
    const l = { source: a, target: b, type, weight }
    links.set(key, l)
    return l
  }

  // ── pages ──
  const pageByKey = new Map()
  const ensurePage = (key, rec, extra) => {
    if (!key) return null
    let n = pageByKey.get(key)
    if (n) return n
    const url = rec.url || key
    n = addNode(`page:${key}`, 'page', rec.title || url, {
      key, url, title: rec.title || '', site: rec.site || siteOf(url),
      visited: rec.visited || 0, wordCount: rec.wordCount || 0, readingMin: rec.readingMin || 0,
      summary: rec.brief?.summary || '', contentType: rec.brief?.contentType || '',
      topics: [], entities: [], highlights: 0, stub: false, ...extra,
    })
    pageByKey.set(key, n)
    return n
  }
  const noteName = (id, type, raw, page) => {
    const name = typeof raw === 'string' ? raw : raw?.name
    const key = normName(name)
    if (!key) return null
    const nid = `${type}:${key}`
    const label = String(name).replace(/\s+/g, ' ').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/[.,;:!?…]+$/, '')
    addNode(nid, type, label, { name: label, kind: type === 'entity' ? (raw?.type || 'other') : 'topic' })
    let meta = named.get(nid)
    if (!meta) { meta = { labels: new Map(), kinds: new Map(), pages: new Set() }; named.set(nid, meta) }
    meta.labels.set(label, (meta.labels.get(label) || 0) + 1)
    if (type === 'entity' && raw?.type) meta.kinds.set(raw.type, (meta.kinds.get(raw.type) || 0) + 1)
    if (page) meta.pages.add(page.id)
    return nid
  }

  for (const p of pages) {
    if (!p || (!p.key && !p.url)) continue
    const page = ensurePage(p.key || normalizeUrl(p.url), p)
    if (!page) continue
    const ents = new Set()
    for (const e of Array.isArray(p.entities) ? p.entities : []) {
      const id = noteName(page.id, 'entity', e, page)
      if (id && !ents.has(id)) { ents.add(id); addLink(page.id, id, 'mentions') }
    }
    const tops = new Set()
    const topicList = [...(Array.isArray(p.topics) ? p.topics : []), ...(Array.isArray(p.brief?.topics) ? p.brief.topics : [])]
    for (const t of topicList) {
      const id = noteName(page.id, 'topic', t, page)
      if (id && !tops.has(id)) { tops.add(id); addLink(page.id, id, 'about') }
    }
    page.data.entities = [...ents]
    page.data.topics = [...tops]
  }

  // ── highlights: highlighted pages join the graph even without a brief ──
  for (const h of highlights) {
    if (!h || (!h.pageKey && !h.url)) continue
    const key = h.pageKey || normalizeUrl(h.url)
    const page = ensurePage(key, { url: h.url, title: h.title, site: h.site, visited: h.created })
    page.data.highlights++
    if (!page.data.title && h.title) { page.data.title = h.title; page.label = h.title }
    page.data.visited = Math.max(page.data.visited || 0, h.updated || h.created || 0)
  }

  // ── notes ──
  const noteNodes = []
  const noteByTitle = new Map()
  for (const n of notes) {
    if (!n?.id) continue
    const title = String(n.title || '').trim() || 'Untitled note'
    const node = addNode(`note:${n.id}`, 'note', title, {
      noteId: n.id, title, tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
      created: n.created || 0, updated: n.updated || n.created || 0, pinned: !!n.pinned,
      excerpt: plainExcerpt(n.body), sources: Array.isArray(n.sources) ? n.sources.filter(s => s?.url) : [],
    })
    noteNodes.push([node, n])
    const tk = normName(title)
    if (tk) {
      const prev = noteByTitle.get(tk)
      // Two notes with one title: the most recently updated one wins the [[link]].
      if (!prev || (node.data.updated || 0) > (prev.data.updated || 0)) noteByTitle.set(tk, node)
    }
  }
  for (const [node, n] of noteNodes) {
    for (const s of node.data.sources) {
      const key = normalizeUrl(s.url)
      if (!/^https?:/i.test(key)) continue
      // A cited page we never briefed still belongs in the graph.
      const page = pageByKey.get(key) || ensurePage(key, { url: s.url, title: s.title }, { stub: true })
      addLink(node.id, page.id, 'cites')
    }
    for (const u of urlsIn(n.body)) {
      const page = pageByKey.get(normalizeUrl(u))
      if (page) addLink(node.id, page.id, 'cites')
    }
    for (const t of wikiLinks(n.body)) {
      const k = normName(t)
      if (!k) continue
      const target = noteByTitle.get(k) || nodes.get(`entity:${k}`) || nodes.get(`topic:${k}`)
      if (target && target !== node) addLink(node.id, target.id, 'wiki')
    }
    for (const tag of node.data.tags) {
      const topic = nodes.get(`topic:${normName(tag)}`)
      if (topic) addLink(node.id, topic.id, 'tagged')
    }
  }

  // ── finalize entity/topic labels and kinds ──
  for (const [id, meta] of named) {
    const n = nodes.get(id)
    n.label = pickLabel(meta.labels) || n.label
    n.data.name = n.label
    if (n.type === 'entity' && meta.kinds.size) n.data.kind = pickLabel(meta.kinds)
    n.data.pages = [...meta.pages]
  }

  // ── page ↔ page when they share `relatedMin`+ entities ──
  const pair = new Map()
  for (const [id, meta] of named) {
    if (!id.startsWith('entity:')) continue
    const ps = [...meta.pages]
    if (ps.length < 2 || ps.length > maxPairsPerEntity) continue // ubiquitous entities already connect them visibly
    ps.sort()
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const k = `${ps[i]}\u0000${ps[j]}`
        pair.set(k, (pair.get(k) || 0) + 1)
      }
    }
  }
  for (const [k, count] of pair) {
    if (count < relatedMin) continue
    const [a, b] = k.split('\u0000')
    addLink(a, b, 'related', count)
  }

  // ── optional site hubs ──
  if (sites) {
    for (const page of pageByKey.values()) {
      const site = page.data.site
      if (!site) continue
      const id = `site:${site}`
      addNode(id, 'site', site, { site })
      addLink(page.id, id, 'site')
    }
  }

  const list = [...links.values()]
  for (const l of list) {
    nodes.get(l.source).degree++
    nodes.get(l.target).degree++
  }
  return { nodes: [...nodes.values()], links: list }
}

// ───────────────────────── force layout ─────────────────────────

/** Deterministic 0..1 hash of a string (stable initial placement across reloads). */
export function hash01(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** Phyllotaxis spiral position for index i (even, organic spread). */
export function spiral(i, spacing = 14) {
  const r = spacing * Math.sqrt(i + 0.5)
  const a = i * GOLDEN
  return [r * Math.cos(a), r * Math.sin(a)]
}

/**
 * Barnes-Hut quadtree over nodes with {x, y, charge}. Each cell aggregates
 * total charge and the charge-weighted centre, so distant clusters act as one body.
 */
export class QuadTree {
  constructor(nodes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) {
      if (n.x < x0) x0 = n.x
      if (n.y < y0) y0 = n.y
      if (n.x > x1) x1 = n.x
      if (n.y > y1) y1 = n.y
    }
    if (!Number.isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1 }
    const size = Math.max(x1 - x0, y1 - y0, 1) * 1.0001
    this.root = QuadTree.cell(x0, y0, size)
    for (const n of nodes) this.insert(this.root, n, 0)
    QuadTree.accumulate(this.root)
  }

  static cell(x0, y0, size) { return { x0, y0, size, kids: null, items: null, charge: 0, cx: 0, cy: 0 } }

  insert(q, n, depth) {
    if (!q.kids) {
      if (!q.items) { q.items = [n]; return }
      // Coincident (or nearly) points stop subdividing and share a leaf.
      if (depth >= 28 || q.size < 1e-6) { q.items.push(n); return }
      const items = q.items
      q.items = null
      q.kids = [null, null, null, null]
      for (const m of items) this.child(q, m, depth)
    }
    this.child(q, n, depth)
  }

  child(q, n, depth) {
    const h = q.size / 2
    const xm = q.x0 + h, ym = q.y0 + h
    const i = (n.x >= xm ? 1 : 0) | (n.y >= ym ? 2 : 0)
    const c = q.kids[i] || (q.kids[i] = QuadTree.cell(i & 1 ? xm : q.x0, i & 2 ? ym : q.y0, h))
    this.insert(c, n, depth + 1)
  }

  static accumulate(q) {
    let charge = 0, cx = 0, cy = 0, weight = 0
    if (q.kids) {
      for (const c of q.kids) {
        if (!c) continue
        QuadTree.accumulate(c)
        const w = Math.abs(c.charge)
        charge += c.charge; cx += c.cx * w; cy += c.cy * w; weight += w
      }
    } else if (q.items) {
      for (const n of q.items) {
        const s = n.charge
        const w = Math.abs(s)
        charge += s; cx += n.x * w; cy += n.y * w; weight += w
      }
    }
    q.charge = charge
    q.cx = weight ? cx / weight : q.x0 + q.size / 2
    q.cy = weight ? cy / weight : q.y0 + q.size / 2
  }
}

const LINK_DISTANCE = { mentions: 64, about: 76, cites: 84, wiki: 90, related: 120, tagged: 96, site: 58 }

/**
 * Velocity-Verlet style force simulation (d3-force semantics):
 * many-body repulsion (exact for small graphs, Barnes-Hut beyond `bhThreshold` nodes),
 * link springs, gravity toward the centre, collision, alpha cooling and pinning via fx/fy.
 */
export class ForceSimulation {
  constructor(nodes = [], links = [], opts = {}) {
    this.opts = {
      charge: -230, // per-node repulsion strength (negative = repel)
      theta: 0.9, // Barnes-Hut accuracy (lower = more exact)
      bhThreshold: 160,
      distanceMax: 1400,
      gravity: 0.045, // pull toward (cx, cy)
      aspect: 1, // width/height of the target area: vertical pull is scaled by it so layouts fill wide views
      cx: 0, cy: 0,
      collidePadding: 3,
      collideStrength: 0.75,
      velocityDecay: 0.42,
      alphaMin: 0.002,
      alphaDecay: 1 - Math.pow(0.002, 1 / 300),
      maxVelocity: 60,
      ...opts,
    }
    this.alpha = 1
    this.alphaTarget = 0
    this.setGraph(nodes, links)
  }

  /** Replace nodes/links (positions on reused node objects are kept). */
  setGraph(nodes, links) {
    this.nodes = nodes
    nodes.forEach((n, i) => { n._i = i })
    const byId = new Map(nodes.map(n => [n.id, n]))
    this.links = []
    const count = new Map()
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source : byId.get(l.source)
      const t = typeof l.target === 'object' ? l.target : byId.get(l.target)
      if (!s || !t || s === t || !byId.has(s.id) || !byId.has(t.id)) continue
      this.links.push({ link: l, s, t, type: l.type })
      count.set(s, (count.get(s) || 0) + 1)
      count.set(t, (count.get(t) || 0) + 1)
    }
    for (const L of this.links) {
      const cs = count.get(L.s), ct = count.get(L.t)
      L.bias = cs / (cs + ct)
      L.strength = (L.type === 'related' ? 0.35 : 1) / Math.min(cs, ct)
      const w = L.link.weight || 1
      L.distance = (LINK_DISTANCE[L.type] || 80) + Math.min(36, ((L.s.r || 6) + (L.t.r || 6)) * 0.9) - (L.type === 'related' ? Math.min(40, (w - 1) * 10) : 0)
    }
    this.seed()
    for (const n of nodes) {
      n.vx ||= 0
      n.vy ||= 0
      n.charge = this.opts.charge * (1 + Math.min(2.2, Math.sqrt(count.get(n) || 0) * 0.22))
    }
  }

  /** Give unplaced nodes a position: next to an already-placed neighbour, else on a spiral. */
  seed() {
    const missing = this.nodes.filter(n => !Number.isFinite(n.x) || !Number.isFinite(n.y))
    if (!missing.length) return
    const adj = new Map()
    for (const { s, t } of this.links) {
      (adj.get(s) || adj.set(s, []).get(s)).push(t);
      (adj.get(t) || adj.set(t, []).get(t)).push(s)
    }
    const placed = this.nodes.length - missing.length
    let spiralIndex = placed
    // Two passes so chains of new nodes can hang off each other.
    for (let pass = 0; pass < 2; pass++) {
      for (const n of missing) {
        if (Number.isFinite(n.x)) continue
        const nb = (adj.get(n) || []).find(m => Number.isFinite(m.x))
        if (nb) {
          const a = hash01(n.id) * Math.PI * 2
          const d = 30 + hash01(`${n.id}#d`) * 30
          n.x = nb.x + Math.cos(a) * d
          n.y = nb.y + Math.sin(a) * d
        } else if (pass === 1 || !placed) {
          const [x, y] = spiral(spiralIndex++, 16)
          n.x = x + this.opts.cx
          n.y = y + this.opts.cy
        }
      }
    }
  }

  get hot() { return this.alpha >= this.opts.alphaMin || this.alphaTarget > 0 }

  reheat(alpha = 1) { this.alpha = Math.max(this.alpha, alpha); return this }

  stop() { this.alpha = 0; this.alphaTarget = 0; return this }

  pin(n, x = n.x, y = n.y) { n.fx = x; n.fy = y; n.x = x; n.y = y; n.vx = 0; n.vy = 0 }

  unpin(n) { n.fx = null; n.fy = null }

  unpinAll() { for (const n of this.nodes) this.unpin(n) }

  /** Advance the simulation. Returns the new alpha. */
  tick(iterations = 1) {
    for (let k = 0; k < iterations; k++) {
      this.alpha += (this.alphaTarget - this.alpha) * this.opts.alphaDecay
      if (!this.nodes.length) continue
      this.forceLinks()
      this.forceCharge()
      this.forceGravity()
      this.forceCollide()
      this.integrate()
    }
    return this.alpha
  }

  forceLinks() {
    const alpha = this.alpha
    for (const L of this.links) {
      const { s, t } = L
      let dx = t.x + t.vx - s.x - s.vx
      let dy = t.y + t.vy - s.y - s.vy
      if (!dx && !dy) { dx = jiggle(); dy = jiggle() }
      let d = Math.sqrt(dx * dx + dy * dy)
      d = (d - L.distance) / d * alpha * L.strength
      dx *= d; dy *= d
      t.vx -= dx * L.bias; t.vy -= dy * L.bias
      s.vx += dx * (1 - L.bias); s.vy += dy * (1 - L.bias)
    }
  }

  forceCharge() {
    const { theta, distanceMax, bhThreshold } = this.opts
    const alpha = this.alpha
    const nodes = this.nodes
    const dMax2 = distanceMax * distanceMax
    if (nodes.length <= bhThreshold) {
      // Exact pairwise repulsion: cheaper than building a tree for small graphs.
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = b.x - a.x, dy = b.y - a.y
          if (!dx && !dy) { dx = jiggle(); dy = jiggle() }
          let l = dx * dx + dy * dy
          if (l > dMax2) continue
          if (l < 1) l = Math.sqrt(l)
          const fa = b.charge * alpha / l
          const fb = a.charge * alpha / l
          a.vx += dx * fa; a.vy += dy * fa
          b.vx -= dx * fb; b.vy -= dy * fb
        }
      }
      return
    }
    const tree = new QuadTree(nodes)
    const theta2 = theta * theta
    const stack = []
    for (const n of nodes) {
      stack.length = 0
      stack.push(tree.root)
      while (stack.length) {
        const q = stack.pop()
        if (!q.charge) continue
        let dx = q.cx - n.x, dy = q.cy - n.y
        let l = dx * dx + dy * dy
        const w = q.size
        if (q.kids && (w * w) / theta2 < l) {
          // Far enough: treat the whole cell as one body.
          if (l < dMax2) {
            if (l < 1) l = Math.sqrt(l)
            const f = q.charge * alpha / l
            n.vx += dx * f; n.vy += dy * f
          }
          continue
        }
        if (q.kids) {
          for (const c of q.kids) if (c) stack.push(c)
          continue
        }
        for (const m of q.items) {
          if (m === n) continue
          dx = m.x - n.x; dy = m.y - n.y
          if (!dx && !dy) { dx = jiggle(); dy = jiggle() }
          l = dx * dx + dy * dy
          if (l > dMax2) continue
          if (l < 1) l = Math.sqrt(l)
          const f = m.charge * alpha / l
          n.vx += dx * f; n.vy += dy * f
        }
      }
    }
  }

  forceGravity() {
    const { gravity, cx, cy, aspect } = this.opts
    const kx = gravity * this.alpha * Math.min(1, 1 / aspect)
    const ky = gravity * this.alpha * Math.max(1, aspect)
    for (const n of this.nodes) {
      n.vx += (cx - n.x) * kx
      n.vy += (cy - n.y) * ky
    }
  }

  /** Collision via a uniform grid (cell = largest diameter), using predicted positions. */
  forceCollide() {
    const { collidePadding: pad, collideStrength: strength } = this.opts
    const nodes = this.nodes
    let maxR = 1
    for (const n of nodes) if ((n.r || 6) > maxR) maxR = n.r || 6
    const cell = (maxR + pad) * 2
    const grid = new Map()
    const key = (ix, iy) => ix * 131071 + iy
    for (const n of nodes) {
      const px = n.x + n.vx, py = n.y + n.vy
      n._gx = Math.floor(px / cell)
      n._gy = Math.floor(py / cell)
      const k = key(n._gx, n._gy)
      const arr = grid.get(k)
      if (arr) arr.push(n); else grid.set(k, [n])
    }
    for (const a of nodes) {
      const ra = (a.r || 6) + pad
      const ax = a.x + a.vx, ay = a.y + a.vy
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = grid.get(key(a._gx + ox, a._gy + oy))
          if (!arr) continue
          for (const b of arr) {
            if (b._i <= a._i) continue // each pair once
            const rb = (b.r || 6) + pad
            const r = ra + rb
            let dx = ax - (b.x + b.vx), dy = ay - (b.y + b.vy)
            let l = dx * dx + dy * dy
            if (l >= r * r) continue
            if (!dx && !dy) { dx = jiggle(); dy = jiggle(); l = dx * dx + dy * dy }
            l = Math.sqrt(l)
            const f = (r - l) / l * strength
            const wa = rb * rb / (ra * ra + rb * rb)
            dx *= f; dy *= f
            a.vx += dx * wa; a.vy += dy * wa
            b.vx -= dx * (1 - wa); b.vy -= dy * (1 - wa)
          }
        }
      }
    }
  }

  integrate() {
    const decay = 1 - this.opts.velocityDecay
    const vmax = this.opts.maxVelocity
    for (const n of this.nodes) {
      if (n.fx != null) { n.x = n.fx; n.vx = 0 } else {
        n.vx *= decay
        if (n.vx > vmax) n.vx = vmax; else if (n.vx < -vmax) n.vx = -vmax
        n.x += n.vx
      }
      if (n.fy != null) { n.y = n.fy; n.vy = 0 } else {
        n.vy *= decay
        if (n.vy > vmax) n.vy = vmax; else if (n.vy < -vmax) n.vy = -vmax
        n.y += n.vy
      }
    }
  }
}

function jiggle() { return (Math.random() - 0.5) * 1e-6 }
