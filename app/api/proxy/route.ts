import { NextRequest, NextResponse } from 'next/server'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
}

const PASS_THROUGH_HEADERS = new Set([
  'content-type', 'cache-control', 'etag', 'last-modified',
])

function rewriteUrl(rawUrl: string, base: string): string {
  try {
    const abs = new URL(rawUrl, base).href
    return `/api/proxy?url=${encodeURIComponent(abs)}`
  } catch {
    return rawUrl
  }
}

function rewriteHtml(html: string, base: string): string {
  // Rewrite href and src attributes
  html = html.replace(/(href|src|action)="([^"]+)"/g, (match, attr, val) => {
    if (val.startsWith('data:') || val.startsWith('javascript:') || val.startsWith('#') || val.startsWith('mailto:')) {
      return match
    }
    return `${attr}="${rewriteUrl(val, base)}"`
  })
  html = html.replace(/(href|src|action)='([^']+)'/g, (match, attr, val) => {
    if (val.startsWith('data:') || val.startsWith('javascript:') || val.startsWith('#') || val.startsWith('mailto:')) {
      return match
    }
    return `${attr}='${rewriteUrl(val, base)}'`
  })
  // Rewrite url() in inline styles
  html = html.replace(/url\(['"]?(https?:\/\/[^'")]+)['"]?\)/g, (_, u) => `url(${rewriteUrl(u, base)})`)
  // Inject base + proxy service-worker shim before </head>
  const shim = `<base href="${base}/">
<script>
(function(){
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u) {
    try { u = '/api/proxy?url=' + encodeURIComponent(new URL(u, '${base}').href); } catch(e){}
    return _open.apply(this, arguments);
  };
  const _fetch = window.fetch;
  window.fetch = function(u, opts) {
    try { if(typeof u === 'string') u = '/api/proxy?url=' + encodeURIComponent(new URL(u, '${base}').href); } catch(e){}
    return _fetch.call(this, u, opts);
  };
})();
</script>`
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${shim}</head>`)
  } else {
    html = shim + html
  }
  return html
}

function rewriteCss(css: string, base: string): string {
  return css.replace(/url\(['"]?(https?:\/\/[^'")]+)['"]?\)/g, (_, u) => `url(/api/proxy?url=${encodeURIComponent(u)})`)
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url')
  if (!targetUrl) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  let url: URL
  try {
    url = new URL(targetUrl)
  } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return new NextResponse('Protocol not allowed', { status: 403 })
  }

  const referer = req.nextUrl.searchParams.get('ref') ?? url.origin

  let response: Response
  try {
    response = await fetch(targetUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Host: url.hostname,
        Referer: referer,
        Origin: url.origin,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new NextResponse(
      `<!doctype html><html><body style="background:#09090b;color:#f87171;font-family:monospace;padding:40px">
<h2 style="margin:0 0 12px">Proxy fetch failed</h2>
<p style="color:#71717a;font-size:13px">${msg}</p>
<p style="color:#52525b;font-size:11px">The server could not reach that URL. Try a different site.</p>
</body></html>`,
      { status: 502, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const contentType = response.headers.get('content-type') ?? 'text/plain'
  const outHeaders = new Headers()
  outHeaders.set('X-Frame-Options', 'ALLOWALL')
  outHeaders.set('Access-Control-Allow-Origin', '*')
  outHeaders.set('Content-Security-Policy', "frame-ancestors *")

  for (const [k, v] of response.headers.entries()) {
    const lk = k.toLowerCase()
    if (PASS_THROUGH_HEADERS.has(lk) && !lk.startsWith('x-frame') && lk !== 'content-security-policy') {
      outHeaders.set(k, v)
    }
  }

  const finalUrl = response.url || targetUrl
  const finalBase = new URL(finalUrl).origin + new URL(finalUrl).pathname.replace(/\/[^/]*$/, '')

  if (contentType.includes('text/html')) {
    let html = await response.text()
    html = rewriteHtml(html, new URL(finalUrl).origin)
    outHeaders.set('Content-Type', 'text/html; charset=utf-8')
    return new NextResponse(html, { status: response.status, headers: outHeaders })
  }

  if (contentType.includes('text/css')) {
    let css = await response.text()
    css = rewriteCss(css, finalBase)
    outHeaders.set('Content-Type', 'text/css; charset=utf-8')
    return new NextResponse(css, { status: response.status, headers: outHeaders })
  }

  // Pass through binary/JS/JSON as-is
  const body = await response.arrayBuffer()
  outHeaders.set('Content-Type', contentType)
  return new NextResponse(body, { status: response.status, headers: outHeaders })
}
