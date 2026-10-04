# Master Mind: Architecture & Module Contracts

This is the source of truth for how the pieces fit. If you build a module, **only edit the files you own** (see the table at the end) and talk to other modules only through the contracts here.

## Runtime contexts

| Context | Files | Can use |
|---|---|---|
| Service worker (ES module) | `background.js`, `bg/*.js`, `lib/*.js` | `chrome.*`, IndexedDB (`lib/db.js`), `lib/ai.js`. **No DOM.** |
| Side panel (extension page, ES modules) | `sidepanel/**` | `chrome.*`, `lib/*`, `vendor/markdown.js` and the `ctx` API below |
| Knowledge Hub (extension page) | `hub/**` | Same as side panel, with the hub `ctx` |
| Offscreen document | `offscreen.html/js` | Audio only (Web Audio) |
| Content scripts (classic, page's isolated world) | `content/*.js` | `globalThis.MM` (from `content/core.js`) and DOM. **No ES imports, no IndexedDB of ours** (it'd be the page's origin), **no API key**. |

Content script load order: `core.js → extract.js → jargon.js → highlight.js → reader.js → ocr.js`. Every content file is an IIFE that starts:

```js
(() => {
  const MM = globalThis.MM
  if (!MM || MM.__skip) return
  // ... register handlers with MM.on('TYPE', fn) and expose helpers on MM.<feature>
})()
```

## Design system (all UI)

- Use `lib/tokens.css` classes: `.mm-card`, `.mm-glass`, `.mm-btn` (`.primary .ghost .danger .sm .icon`), `.mm-chip` (`.active`/`aria-pressed`), `.mm-cite`, `.mm-badge`, `.mm-dot` (`--c`), `.mm-input`, `.mm-select`, `.mm-textarea`, `.mm-label`, `.mm-switch` (`<label class="mm-switch"><input type=checkbox><span></span>Text</label>`), `.mm-range`, `.mm-tabs/.mm-tab`, `.mm-skeleton`, `.mm-spinner`, `.mm-empty`, `.mm-error`, `.mm-toast`, `.mm-md` (rendered Markdown), `.mm-caret` (streaming cursor), `.mm-row`, `.mm-stack`, `.mm-muted`, `.mm-small`, `.mm-mono`, `.mm-gradient-text`.
- Colors and fonts come from CSS variables: `--mm-bg #0B0C10`, `--mm-glass`, `--mm-border rgba(255,255,255,.08)`, `--mm-accent`/`--mm-accent-2` (user-selectable), `--mm-cyan --mm-violet --mm-lime --mm-pink --mm-amber --mm-red`, `--mm-font` (Inter), `--mm-mono` (JetBrains Mono), `--mm-blur blur(16px)`.
- **Content-script UI must live in Shadow DOM** via `MM.shadow(id, css)`, which returns `{host, root, layer}` with tokens already loaded and `layer.mm-root`. Never style the host page except for elements we wrap in the page text (highlights, jargon, citation glow), and those use our own custom tags (`mm-mark`, `mm-term`) with inline styles or a single `<style id="mm-page-style-<feature>">` that only targets our own tags/attributes.
- Accessibility: real `<button>`s, `aria-label` on icon buttons, visible focus (`:focus-visible` is styled), keyboard paths for everything, `role`/`aria-live` for streaming output, respect `prefers-reduced-motion`.
- Performance: debounce MutationObservers and scroll/resize/input handlers (`MM.debounce`, `MM.throttle`), batch DOM writes, never block the main thread with long synchronous loops over huge pages (chunk with `requestIdleCallback` or `setTimeout(0)` when wrapping more than ~200 nodes).

## Security rules (non-negotiable)

1. Page text, AI output and stored data are **untrusted**. Put them in the DOM with `textContent`, or, on extension pages only, `renderMarkdown()` from `vendor/markdown.js` (DOMPurify-sanitized). Content scripts have no Markdown library: use `textContent` and build elements, or `MM.escape()` when composing HTML strings.
2. No `eval`, no `new Function`, no remote scripts (MV3 CSP). No inline `<script>` or inline event handler attributes in HTML files.
3. The API key is read only by `lib/ai.js` (via `lib/store.js`). Content scripts call AI through `MM.ai()`.
4. Exported or webhook-posted data must be what the user chose to export, sent only to the URL the user configured.

## Shared data

### Page (returned by content `MM_EXTRACT`)
```ts
{
  url: string, key: string /* normalized URL */, title: string, site: string, lang: string,
  byline: string /* '' if none */, published: string /* '' if none */,
  wordCount: number, readingMin: number,
  paragraphs: { id: 'p0'|'p1'|..., text: string, tag: 'p'|'h1'|'h2'|'h3'|'h4'|'li'|'blockquote'|'pre'|'td'|'figcaption' }[],
  extractedAt: number
}
```
After extraction, every source element in the live DOM carries `data-mm-pid="pN"` so other modules can find paragraph N with `document.querySelector('[data-mm-pid="p7"]')`. Re-extraction reuses existing ids when the element is unchanged.

### Settings (`lib/store.js`, `chrome.storage.sync` key `settings`; content scripts read `MM.settings`, live)
See `DEFAULT_SETTINGS` in `lib/store.js`. Highlight tags: `settings.tags = [{id, name, color}]`. The API key is in `chrome.storage.local.apiKey` (never synced).

### IndexedDB (`lib/db.js`, extension contexts only)
`db.get/all/by/put/putMany/delete/clear/count/trim`, `onChange(cb)` (BroadcastChannel; fires in every extension context) and `uid(prefix)`.

| store | key | record |
|---|---|---|
| `highlights` | `id` | `{ id, pageKey, url, title, site, text, prefix, suffix, tag, note, created, updated }` (`prefix`/`suffix` = up to 48 chars of surrounding text for re-anchoring; `note` = '' or the Quick-Note text) |
| `notes` | `id` | `{ id, title, body /* markdown */, tags: string[], sources: {url, title}[], created, updated, pinned: bool }` |
| `pages` | `key` | `{ key, url, title, site, visited, wordCount, readingMin, brief?: {mode, summary, takeaways, topics, contentType, at}, entities: {name, type}[], topics: string[], keywords: string[] }`. Written by the Brief tab (merge, don't clobber). `keywords` come from `lib/text.js keywords()`. |
| `history` | `id` | `{ id, tabId, url, title, parentId /* id of the history node this came from, or null */, ts, transition }` |
| `kv` | `k` | `{ k, v }` misc (e.g. graph node positions under `k: 'graph-layout'`) |

Highlights are written only through background handlers (so content scripts can use them). Extension pages may read the store directly and must call the same handlers (`chrome.runtime.sendMessage`) to mutate, so open tabs get updated.

## Message catalog

Messages are `{type, ...payload}`. Responses are plain objects (`{ok:false, error}` on failure).

### To content scripts (`chrome.tabs.sendMessage(tabId, msg)`; panel: `ctx.sendToTab(type, data)`)
| type | owner | payload → response |
|---|---|---|
| `MM_PING` | core | → `{ok, url, key}` |
| `MM_EXTRACT` | extract | → `Page` |
| `MM_SCROLL_TO` | extract | `{pid}` → scrolls the element into view (smooth, centered) and gives it a temporary neon glow (~2.2s) → `{ok, found}` |
| `MM_GLOW` | extract | `{pids: string[], color?: string, ms?: number}` → glow several paragraphs (bias passages) → `{ok}` |
| `MM_JARGON_APPLY` | jargon | `{terms: {term, definition, related[], kind, pronunciation}[]}` → underline first 1-3 occurrences of each term with a dotted neon underline; hover/focus shows a micro-card with definition, related concepts and a 🔊 pronounce button (speechSynthesis) → `{ok, applied: number}` |
| `MM_JARGON_CLEAR` | jargon | → removes all underlines |
| `MM_HIGHLIGHT_SELECTION` | highlight | `{tag?}` → highlight current selection with tag (default `settings.defaultTag`) → `{ok, id?}` |
| `MM_HIGHLIGHT_REFRESH` | highlight | → reload this page's highlights from background and re-render |
| `MM_HIGHLIGHT_REMOVE` | highlight | `{id}` → unwrap that highlight in the page |
| `MM_HIGHLIGHT_FOCUS` | highlight | `{id}` → scroll to it and pulse it → `{ok, found}` |
| `MM_READER` | reader | `{action: 'open'|'close'|'toggle', translate?: string /* language */}` → `{ok, open}` |
| `MM_BIONIC` | reader | `{on: boolean}` → toggles bionic reading on the live page (and in the reader if open) → `{ok, on}` |
| `MM_TTS` | reader | `{action: 'play'|'pause'|'resume'|'stop', rate?: number}` → reads the main content (or the reader) aloud with word highlighting and auto-scroll → `{ok, state: 'playing'|'paused'|'stopped'}` |
| `MM_TTS_STATE` | reader | → `{state, rate}` |
| `MM_OCR_START` | ocr | → shows a drag-to-crop overlay; on release sends `OCR_CAPTURE` to background and shows the result card (copy / send to notes) → `{ok}` |

### To background (`chrome.runtime.sendMessage`)
| type | owner | payload → response |
|---|---|---|
| `OPEN_HUB` | core | `{view, params}` → opens/focuses the hub tab |
| `OPEN_PANEL` | core | (from content script, user gesture) → opens the side panel |
| `SEND_TO_TAB` | core | `{tabId, message}` → forwards (injecting scripts if needed) |
| `MM_PAGE_CHANGED` | core | `{url}` (content → bg/panel on SPA navigation) |
| `HL_LIST` | highlights | `{pageKey}` → `{ok, items: Highlight[]}` |
| `HL_SAVE` | highlights | `{highlight}` (no id → create; id → update) → `{ok, highlight}`; notifies other tabs showing that pageKey with `MM_HIGHLIGHT_REFRESH` |
| `HL_DELETE` | highlights | `{id}` → `{ok}`; sends `MM_HIGHLIGHT_REMOVE` to tabs showing that page |
| `HL_ALL` | highlights | → `{ok, items}` (for content-side search, if needed) |
| `TABS_GROUP` | tabs | `{windowId?}` → AI-groups the window's ungrouped tabs into colored tab groups → `{ok, groups: [{name, color, count}]}` |
| `TABS_UNGROUP` | tabs | `{windowId?}` → ungroups all → `{ok}` |
| `OCR_CAPTURE` | ocr | `{rect: {x, y, w, h} /* CSS px */, dpr}` (from content) → captures the visible tab, crops in the SW (OffscreenCanvas), runs the `ocr` AI task → `{ok, text}` |
| `SOUND_SET` | sounds | `{mix: {rain, pink, brown, white, hum, waves} /* 0..1 volumes */, master: 0..1}` → creates the offscreen audio doc if needed and applies → `{ok}` |
| `SOUND_STOP` | sounds | → `{ok}` |
| `SOUND_STATE` | sounds | → `{ok, playing, mix, master}` |
| `HISTORY_TREE` | history | `{since?: number}` → `{ok, nodes: HistoryNode[]}` |

### AI streaming port (content scripts)
`MM.ai(task, input, {onText, signal})` → `Promise<{text, data, sources}>`. Errors carry `.code` (`NO_KEY`, `AUTH`, `RATE`, `NETWORK`, `REFUSAL`, `FORMAT`, `ABORT`, `BAD_REQUEST`, `API`, `RELOAD`).

## AI tasks (`lib/tasks.js`; call `runTask(name, input, {onText, signal})` from extension pages)
| task | input | output |
|---|---|---|
| `brief` | `{page, mode: 'executive'|'technical'|'analogy'|'bullets'}` | `data: {summary (md with [pN]), takeaways[3], topics[], entities[{name,type}], contentType}` |
| `jargon` | `{page}` | `data: {terms: [{term, definition, related[], kind, pronunciation}]}` |
| `qa` | `{page, question, history?}` | streamed Markdown with `[pN]` citations |
| `bias` | `{page}` | `data: {objectivity 0-100, tone, label, summary, signals: [{pid, quote, kind, reason}]}` |
| `factcheck` | `{page}` | streamed Markdown (`## Claim: … [pN]` / `**Verdict:** …` sections, then `---` + overall); `sources: [{url,title}]` from web search |
| `translate` | `{paragraphs: [{id,text}], to}` | `data: {translations: [{id, text}]}` (batch ≤ 40 paragraphs / ≤ 12k chars per call) |
| `groupTabs` | `{tabs: [{id,title,url}]}` | `data: {groups: [{name, color, tabIds}]}` |
| `ocr` | `{image /* base64 png, no prefix */}` | streamed text |
| `entities` | `{page}` | `data: {topics[], entities[]}` |
| `noteAssist` | `{text, instruction}` | streamed Markdown |

Errors are `AIError` with `.code` as above. Always handle `NO_KEY` by showing `ctx.errorBox(err)` (panel) or a friendly message with an "Open settings" action.

## Side panel `ctx` (passed to `sidepanel/tabs/*.js` and `sidepanel/sections/*.js`)
```ts
mount(root: HTMLElement, ctx) → { onShow?(): void, onPage?(page: Page|null): void }
ctx.tab            // chrome.tabs.Tab of the page being read
ctx.page           // last extracted Page or null
ctx.pageError      // string when the page can't be read (chrome://, web store…)
ctx.settings       // live settings
ctx.getPage({force?}) → Promise<Page|null>
ctx.onPageChange(cb) → unsubscribe     // prefer returning onPage from mount
ctx.sendToTab(type, data) → Promise<response>
ctx.runTask(name, input, {onText, signal}) → Promise<{text, data, sources, truncated, usage}>
ctx.db, ctx.uid, ctx.renderMarkdown(md) → safe HTML, ctx.escapeHtml(s)
ctx.showTab('brief'|'ask'|'analyze'|'notes'|'tools'), ctx.openHub(view, params), ctx.toast(msg)
ctx.on(event, fn) / ctx.emit(event, data)   // panel-wide bus
ctx.errorBox(err) → HTMLElement
```
Citations: `import { linkCitations, citeHandler } from '../cite.js'`, then `linkCitations(el, citeHandler(ctx), { validPids })` after inserting `renderMarkdown()` output. It turns `[p12]` into `.mm-cite` chips that call `MM_SCROLL_TO`.
Panel bus events: `ask {question}` (switch to Ask and run it), `insert-note {markdown, source?: {url,title}}` (append to the open note in the Notes tab), `brief-ready {page, data}` (Brief finished; others may reuse `data.entities`), `jargon-ready {terms}`.

Mount is lazy: a tab mounts the first time it's shown, so call `ctx.getPage()` in `mount` if you need the page immediately. `onPage` fires for every mounted tab after navigation or refresh.

## Hub `ctx` (passed to `hub/views/*.js`)
```ts
mount(root, ctx) → { unmount?() }
ctx.params (URLSearchParams from #view?a=b), ctx.settings, ctx.db, ctx.uid, ctx.onDbChange(cb) → unsubscribe,
ctx.runTask, ctx.renderMarkdown, ctx.escapeHtml, ctx.toast, ctx.navigate(view, paramsString), ctx.openUrl(url)
```
Views: `highlights`, `notes`, `graph`, `history`, `settings`. Use `.view-head` with an `<h1>` for the title row. Always clean up listeners and animation frames in `unmount`.

## File ownership

| Builder | Owns |
|---|---|
| core (done) | `manifest.json`, `background.js`, `lib/{tokens.css,store.js,db.js,text.js,ai.js,tasks.js}`, `content/core.js`, `sidepanel/{index.html,panel.js,panel.css,cite.js,tabs/tools.js}`, `hub/{index.html,hub.js,hub.css}`, `vendor/`, `icons/` |
| B1 page intelligence | `content/extract.js`, `content/jargon.js`, `sidepanel/tabs/brief.js` |
| B2 ask & analyze | `sidepanel/tabs/ask.js`, `sidepanel/tabs/analyze.js` |
| B3 highlighter | `content/highlight.js`, `bg/highlights.js`, `hub/views/highlights.js` |
| B4 reader | `content/reader.js`, `sidepanel/sections/reading.js` |
| B5 notes | `sidepanel/tabs/notes.js`, `hub/views/notes.js`, `lib/workspace.js`, `hub/print.html`, `hub/print.js` |
| B6 graph, trail & settings | `hub/views/graph.js`, `lib/graph.js`, `bg/history.js`, `hub/views/history.js`, `hub/views/settings.js` |
| B7 workspace tools | `bg/tabs.js`, `bg/ocr.js`, `content/ocr.js`, `sidepanel/sections/workspace.js`, `bg/sounds.js`, `offscreen.html`, `offscreen.js`, `sidepanel/sections/sounds.js` |

If you genuinely need a change in a file you don't own (e.g. a new task in `lib/tasks.js` or a new permission), make the smallest possible edit and say exactly what and why in your report.
