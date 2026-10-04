// Source for vendor/markdown.js: Markdown → sanitized HTML with GFM, code highlighting and KaTeX math.
// Rebuild with: bash master-mind/scripts/build-vendor.sh
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import katex from 'katex'

const math = {
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start: src => src.match(/\$\$/)?.index,
      tokenizer(src) {
        const m = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src)
        if (m) return { type: 'mathBlock', raw: m[0], text: m[1].trim() }
      },
      renderer: t => `<div class="math-block">${katex.renderToString(t.text, { displayMode: true, throwOnError: false, output: 'html' })}</div>`,
    },
    {
      name: 'mathInline',
      level: 'inline',
      start: src => src.match(/\$/)?.index,
      tokenizer(src) {
        const m = /^\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/.exec(src)
        if (m) return { type: 'mathInline', raw: m[0], text: m[1] }
      },
      renderer: t => katex.renderToString(t.text, { throwOnError: false, output: 'html' }),
    },
  ],
}

const marked = new Marked({ gfm: true, breaks: false })
marked.use(math)
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : null
      const html = language ? hljs.highlight(text, { language }).value : hljs.highlightAuto(text).value
      return `<pre class="code"><code class="hljs${language ? ` language-${language}` : ''}">${html}</code></pre>`
    },
  },
})

/* Rendered Markdown comes from untrusted places (AI output, page text, imported notes) and is shown
   inside trusted extension UI. So beyond DOMPurify's script/XSS defaults it also refuses anything that
   could fake our UI or call out: no forms or form controls (except GFM task checkboxes), no media or
   remote images (a remote <img> becomes a link, so nothing loads without a click), no <style>, inline
   styles limited to layout-safe properties (KaTeX needs them; no fixed/absolute positioning, no z-index,
   no url()), no design-system (mm-*) classes, and links only open in a new tab. */
const FORBID_TAGS = ['form', 'button', 'select', 'option', 'optgroup', 'textarea', 'datalist', 'dialog', 'video', 'audio', 'source', 'track', 'picture', 'style', 'link', 'meta', 'base', 'iframe', 'frame', 'frameset', 'object', 'embed', 'portal', 'use', 'image', 'feimage']
const FORBID_ATTR = ['srcset', 'poster', 'action', 'formaction', 'form', 'background', 'ping', 'download', 'autofocus', 'accesskey', 'popover', 'popovertarget', 'popovertargetaction']
const SAFE_IMG = /^(?:data:image\/|blob:)/i
const CSS_PROP = /^(?:color|background-color|border(?:-(?:top|right|bottom|left))?-(?:color|style|width)|(?:min-|max-)?(?:width|height)|(?:margin|padding)(?:-(?:top|right|bottom|left))?|vertical-align|text-align|font-(?:style|weight|size|variant)|line-height|white-space|display|position|top|right|bottom|left)$/
const OFFSET = /^(?:top|right|bottom|left|margin)/

/** Offsets and margins must be modest lengths so content can't be pushed over other UI. */
function lengthOk(value) {
  return value.split(/\s+/).every(x => {
    const m = /^(-?\d*\.?\d+)(em|rem|ex|ch|px|pt|%|)$/.exec(x)
    if (!m) return !/\d/.test(x)
    const n = Math.abs(parseFloat(m[1]))
    const unit = m[2]
    return n <= (unit === 'px' ? 640 : unit === 'pt' ? 480 : unit === '%' ? 100 : 40)
  })
}

function cleanStyle(node) {
  const s = node.style
  const keep = []
  for (let i = 0; i < s.length; i++) {
    const prop = s[i]
    const value = s.getPropertyValue(prop).trim()
    if (!CSS_PROP.test(prop) || s.getPropertyPriority(prop)) continue
    if (/[()\\@;<>]|url|expression/i.test(value.replace(/rgba?\([\d.,%\s/]*\)/gi, ''))) continue
    if (prop === 'position' && value !== 'relative' && value !== 'static') continue
    if (OFFSET.test(prop) && !lengthOk(value)) continue
    keep.push(`${prop}:${value}`)
  }
  if (keep.length) node.setAttribute('style', keep.join(';'))
  else node.removeAttribute('style')
}

/** Replace a remote image with a link (or a label), so nothing is fetched without a click. */
function replaceRemoteImage(node, src) {
  const doc = node.ownerDocument
  const alt = (node.getAttribute('alt') || '').replace(/\s+/g, ' ').trim()
  let host = ''
  try { host = new URL(src).hostname } catch { /* not a URL */ }
  let el
  if (/^https?:/i.test(src)) {
    el = doc.createElement('a')
    el.setAttribute('href', src)
    el.setAttribute('target', '_blank')
    el.setAttribute('rel', 'noopener noreferrer')
    el.setAttribute('title', 'Open this image (remote images aren’t loaded here)')
  } else {
    el = doc.createElement('span')
  }
  el.setAttribute('data-mm-remote-image', '')
  el.textContent = `Image: ${alt ? alt + (host ? ` · ${host}` : '') : host || 'not shown'}`
  node.replaceWith(el)
}

// The hook only acts while renderMarkdown is sanitizing, so other DOMPurify users keep the defaults.
let rendering = false
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (!rendering || node.nodeType !== 1) return
  const tag = node.nodeName.toLowerCase()
  if (tag === 'input' && (node.getAttribute('type') || '').toLowerCase() !== 'checkbox') { node.remove(); return }
  if (tag === 'img' && !SAFE_IMG.test(node.getAttribute('src') || '')) { replaceRemoteImage(node, node.getAttribute('src') || ''); return }
  if (node.hasAttribute('target')) {
    if (node.getAttribute('target') !== '_blank') node.removeAttribute('target')
    else node.setAttribute('rel', 'noopener noreferrer')
  }
  if (node.hasAttribute('style')) cleanStyle(node)
  if (node.hasAttribute('class')) {
    const classes = node.getAttribute('class').split(/\s+/).filter(c => c && !/^mm-/i.test(c))
    if (classes.length) node.setAttribute('class', classes.join(' '))
    else node.removeAttribute('class')
  }
})

/** Render untrusted Markdown to safe HTML. */
export function renderMarkdown(src) {
  const html = marked.parse(String(src ?? ''))
  rendering = true
  try {
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['target'],
      ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mtext', 'mspace'],
      FORBID_TAGS,
      FORBID_ATTR,
    })
  } finally {
    rendering = false
  }
}

/** Escape text for safe insertion into HTML. */
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export { DOMPurify, hljs, katex }
