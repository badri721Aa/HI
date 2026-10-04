// Print view for one note: hub/print.html#<noteId>. Renders a light, paper-friendly copy
// (Markdown, KaTeX, highlighted code, tags, sources, dates), waits for fonts, math and images,
// then opens the browser print dialog so the user can "Save as PDF".
import { db } from '../lib/db.js'
import { renderMarkdown } from '../vendor/markdown.js'
import { replaceWikiLinks } from '../lib/workspace.js'
import { siteOf } from '../lib/text.js'

const sheet = document.getElementById('sheet')
const stateEl = document.getElementById('state')
const printBtn = document.getElementById('printBtn')
const closeBtn = document.getElementById('closeBtn')

const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
const fmtDate = t => new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function problem(title, detail) {
  const box = el('div', 'problem')
  box.append(el('b', '', title), el('span', '', detail))
  sheet.replaceChildren(box)
  sheet.setAttribute('aria-busy', 'false')
  stateEl.textContent = title
  document.body.dataset.state = 'error'
}

/** Resolve once web fonts (including KaTeX's) and images are ready, so the printout isn't missing glyphs. */
async function settle() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const fonts = document.fonts?.ready?.catch(() => {}) || Promise.resolve()
  const images = Promise.all([...document.images].map(img => (img.complete ? null : img.decode().catch(() => {}))))
  await Promise.race([Promise.all([fonts, images]), new Promise(r => setTimeout(r, 8000))])
}

async function main() {
  const id = decodeURIComponent(location.hash.slice(1))
  if (!id) return problem('No note selected', 'Open a note in Master Mind and choose Export › PDF.')
  let note
  try {
    note = await db.get('notes', id)
  } catch (e) {
    return problem('Couldn’t open the note', String(e?.message || e))
  }
  if (!note) return problem('This note doesn’t exist anymore', 'It may have been deleted.')

  const title = String(note.title || '').trim() || 'Untitled note'
  document.title = `${title} · Master Mind`

  const head = el('header', 'doc-head')
  head.append(el('p', 'kicker', 'Master Mind · Research note'), el('h1', 'title', title))
  const meta = el('div', 'meta')
  meta.append(el('span', '', `Updated ${fmtDate(note.updated || note.created)}`))
  if (note.created && note.created !== note.updated) meta.append(el('span', '', `Created ${fmtDate(note.created)}`))
  const words = (String(note.body || '').replace(/data:[^\s)]+/g, '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
  meta.append(el('span', '', `${words.toLocaleString()} words`))
  head.append(meta)
  if (note.tags?.length) {
    const tags = el('div', 'tags')
    for (const t of note.tags) tags.append(el('span', '', `#${t}`))
    head.append(tags)
  }

  const body = el('article', 'md')
  body.innerHTML = renderMarkdown(note.body || '') // DOMPurify-sanitized
  replaceWikiLinks(body, (t, label) => el('span', 'wiki', label))
  body.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer' })
  body.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.setAttribute('aria-label', cb.checked ? 'Done' : 'Not done'))

  const parts = [head, body]
  if (note.sources?.length) {
    const src = el('section', 'sources')
    src.append(el('h2', '', 'Sources'))
    const ol = el('ol')
    for (const s of note.sources) {
      const li = el('li')
      const a = el('a', '', s.title || s.url)
      a.href = s.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      li.append(a, ' ', el('span', 'u', `— ${siteOf(s.url) || s.url}`))
      ol.append(li)
    }
    src.append(ol)
    parts.push(src)
  }
  const foot = el('footer', 'foot')
  foot.append(el('span', '', 'Exported from Master Mind'), el('span', '', new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })))
  parts.push(foot)
  sheet.replaceChildren(...parts)

  stateEl.textContent = 'Rendering math and fonts…'
  await settle()
  sheet.setAttribute('aria-busy', 'false')
  printBtn.disabled = false
  stateEl.textContent = 'Ready. Choose “Save as PDF” as the destination.'
  document.body.dataset.state = 'ready'
  window.print()
  document.body.dataset.state = 'printed'
}

printBtn.addEventListener('click', () => window.print())
closeBtn.addEventListener('click', () => window.close())

main().catch(e => problem('Something went wrong', String(e?.message || e)))
