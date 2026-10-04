// Turns "[p12]" citation markers inside rendered Markdown into clickable chips that
// scroll the page to that paragraph and make it glow. Shared by side panel tabs.

const CITE = /\[(p\d+)\]/g
const HAS_CITE = /\[p\d+\]/ // non-global: .test() must not carry lastIndex between nodes

/**
 * Replace [pN] markers in text nodes under `root` with <button class="mm-cite">.
 * @param {HTMLElement} root element containing rendered (sanitized) Markdown
 * @param {(pid: string) => void} onCite called when a chip is clicked
 * @param {{ validPids?: Set<string> }} [opts] only link ids that exist on the page
 */
export function linkCitations(root, onCite, { validPids } = {}) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (HAS_CITE.test(n.nodeValue) && !n.parentElement.closest('code, pre, .mm-cite') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  })
  const nodes = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n)
  for (const node of nodes) {
    const frag = document.createDocumentFragment()
    let last = 0
    const text = node.nodeValue
    CITE.lastIndex = 0
    for (let m; (m = CITE.exec(text));) {
      if (m.index > last) frag.append(text.slice(last, m.index))
      const pid = m[1]
      if (validPids && !validPids.has(pid)) {
        frag.append(m[0])
      } else {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'mm-cite'
        b.textContent = `¶${pid.slice(1)}`
        b.title = `Jump to paragraph ${pid.slice(1)} on the page`
        b.setAttribute('aria-label', `Show source paragraph ${pid.slice(1)}`)
        b.dataset.pid = pid
        b.addEventListener('click', () => onCite(pid))
        frag.append(b)
      }
      last = m.index + m[0].length
    }
    if (last < text.length) frag.append(text.slice(last))
    node.replaceWith(frag)
  }
  return root
}

/** Default handler: scroll the page to the paragraph and glow it. */
export const citeHandler = ctx => pid => ctx.sendToTab('MM_SCROLL_TO', { pid }).catch(() => ctx.toast('Couldn’t reach the page. Try refreshing it.'))
