// Tiny, safe Markdown → HTML renderer (HTML is escaped first).
// Classic script so it can be shared by content scripts and extension pages.
(function () {
  if (globalThis.SPMarkdown) return
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  function render(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n')
    let html = ''
    let list = null
    let code = null
    const close = () => { if (list) { html += `</${list}>`; list = null } }
    for (const line of lines) {
      if (code !== null) {
        if (/^```/.test(line)) { html += `<pre><code>${esc(code)}</code></pre>`; code = null } else code += line + '\n'
        continue
      }
      if (/^```/.test(line)) { close(); code = ''; continue }
      let m
      if ((m = line.match(/^(#{1,4})\s+(.*)/))) { close(); const n = Math.min(4, m[1].length + 2); html += `<h${n}>${inline(m[2])}</h${n}>`; continue }
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul' } html += `<li>${inline(m[1])}</li>`; continue }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol' } html += `<li>${inline(m[1])}</li>`; continue }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { close(); html += '<hr>'; continue }
      if ((m = line.match(/^>\s?(.*)/))) { close(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue }
      if (!line.trim()) { close(); continue }
      close()
      html += `<p>${inline(line)}</p>`
    }
    if (code !== null) html += `<pre><code>${esc(code)}</code></pre>`
    close()
    return html
  }

  globalThis.SPMarkdown = { render, esc }
})()
