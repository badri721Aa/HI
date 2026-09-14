import { NextRequest, NextResponse } from 'next/server'

// Block non-web protocols and localhost
function isSafe(url: URL): boolean {
  if (!['http:', 'https:'].includes(url.protocol)) return false
  const h = url.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false
  if (/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(h)) return false
  return true
}

function resolveUrl(raw: string, base: string): string {
  try {
    return new URL(raw, base).toString()
  } catch {
    return ''
  }
}

// Proxy through /api/proxy?url=<encoded>
function proxyHref(raw: string, pageUrl: string): string {
  if (!raw) return raw
  const trimmed = raw.trim()
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/api/proxy')
  ) return trimmed
  const abs = resolveUrl(trimmed, pageUrl)
  if (!abs) return trimmed
  return `/api/proxy?url=${encodeURIComponent(abs)}`
}

// Rewrite src/href/action/srcset in HTML
function rewriteHtml(html: string, pageUrl: string): string {
  // Strip X-Frame-Options and CSP meta tags
  html = html.replace(
    /<meta[^>]+http-equiv=["']?(X-Frame-Options|Content-Security-Policy)["']?[^>]*\/?>/gi,
    '',
  )
  // Remove <base> tags — we inject our own
  html = html.replace(/<base[^>]*\/?>/gi, '')

  // Rewrite href / src / action attributes
  html = html.replace(
    /(\s(?:href|src|action|data-src|poster)=)(["'])([^"']*)\2/gi,
    (_, attr, quote, val) => `${attr}${quote}${proxyHref(val, pageUrl)}${quote}`,
  )

  // Rewrite srcset (space-separated URL descriptors)
  html = html.replace(
    /(\ssrcset=)(["'])([^"']*)\2/gi,
    (_, attr, quote, val) => {
      const rewritten = val.replace(/([^\s,]+)(\s+\d+[wx])?/g, (_m: string, u: string, d = '') => {
        return proxyHref(u, pageUrl) + d
      })
      return `${attr}${quote}${rewritten}${quote}`
    },
  )

  // Rewrite CSS url() inside style attributes and <style> blocks
  html = html.replace(
    /url\((['"]?)([^'")\s]+)\1\)/gi,
    (_m, q, u) => `url(${q}${proxyHref(u, pageUrl)}${q})`,
  )

  // Inject intercept script + proxy base right after <head>
  const interceptScript = `
<script>
(function(){
  var PAGE='${pageUrl.replace(/'/g, "\\'")}';
  function px(u){
    if(!u||/^(javascript:|data:|#|mailto:|\/api\/proxy)/.test(u))return u;
    try{return '/api/proxy?url='+encodeURIComponent(new URL(u,PAGE).toString())}catch{return u}
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');
    if(a&&a.href&&!a.href.includes('/api/proxy')){e.preventDefault();window.location.href=px(a.getAttribute('href'));}
  },true);
  document.addEventListener('submit',function(e){
    var f=e.target;
    if(f&&f.action&&!f.action.includes('/api/proxy')){e.preventDefault();f.action=px(f.getAttribute('action')||'');f.submit();}
  },true);
})();
</script>`

  html = html.replace(/(<head(?:[^>]*)>)/i, `$1${interceptScript}`)

  return html
}

// Forward request, strip frame-blocking headers, rewrite HTML
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return new NextResponse('Missing ?url= parameter', { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }

  if (!isSafe(target)) {
    return new NextResponse('URL not allowed', { status: 403 })
  }

  let response: Response
  try {
    response = await fetch(target.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: req.headers.get('accept') ?? 'text/html,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // avoid gzip — we need to read the text
        Referer: target.origin,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    return new NextResponse(`Proxy fetch failed: ${err}`, { status: 502 })
  }

  const ct = response.headers.get('content-type') ?? 'application/octet-stream'

  // HTML — rewrite and strip frame headers
  if (ct.includes('text/html')) {
    const text = await response.text()
    const rewritten = rewriteHtml(text, target.toString())
    return new NextResponse(rewritten, {
      status: response.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Strip frame-blocking — our own page needs to embed this
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'no-store',
      },
    })
  }

  // CSS — rewrite url() references
  if (ct.includes('text/css')) {
    const text = await response.text()
    const rewritten = text.replace(
      /url\((['"]?)([^'")\s]+)\1\)/gi,
      (_m, q, u) => `url(${q}${proxyHref(u, target.toString())}${q})`,
    )
    return new NextResponse(rewritten, {
      status: response.status,
      headers: { 'Content-Type': ct, 'Cache-Control': 'no-store' },
    })
  }

  // Everything else (images, fonts, JS, etc.) — pass through
  const buf = await response.arrayBuffer()
  return new NextResponse(buf, {
    status: response.status,
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
