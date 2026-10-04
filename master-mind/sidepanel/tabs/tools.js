// Tools tab: a stack of independent tool sections, each owned by its own module in ../sections/.
// Each section exports mount(root, ctx) → optional { onShow(), onPage(page) }, like a tab.
import * as reading from '../sections/reading.js'
import * as workspace from '../sections/workspace.js'
import * as sounds from '../sections/sounds.js'

export function mount(root, ctx) {
  const sections = [reading, workspace, sounds].map(mod => {
    const el = document.createElement('section')
    el.className = 'mm-card tool-section'
    root.appendChild(el)
    try { return mod.mount(el, ctx) || {} } catch (e) { el.replaceChildren(ctx.errorBox(e)); return {} }
  })
  return {
    onShow() { for (const s of sections) s.onShow?.() },
    onPage(page) { for (const s of sections) s.onPage?.(page) },
  }
}
