import { NextRequest, NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-encoding',
  'x-frame-options', 'content-security-policy', 'x-content-type-options',
  'strict-transport-security', 'content-length',
])

function px(raw: string, base: string): string {
  try {
    const abs = new URL(raw, base).href
    if (abs.startsWith('http://') || abs.startsWith('https://')) {
      return `/api/proxy?url=${encodeURIComponent(abs)}`
    }
  } catch {}
  return raw
}

const SKIP = (v: string) =>
  v.startsWith('#') || v.startsWith('data:') || v.startsWith('javascript:') ||
  v.startsWith('mailto:') || v.startsWith('tel:') || v.startsWith('blob:') || v === ''

function rewriteAttr(html: string, origin: string): string {
  return html.replace(
    /((?:href|src|action|data-src|data-href|poster))\s*=\s*(["'])([^"']*)\2/gi,
    (m, attr, q, val) => SKIP(val) ? m : `${attr}=${q}${px(val, origin)}${q}`
  ).replace(
    /srcset\s*=\s*(["'])([^"']*)\1/gi,
    (m, q, val) => `srcset=${q}${val.replace(/(\S+)(\s+[^,]*)?/g,
      (_: string, u: string, d: string = '') => SKIP(u) ? _ : px(u, origin) + d
    )}${q}`
  ).replace(
    /url\(['"]?(https?:\/\/[^'") ]+)['"]?\)/g,
    (_, u) => `url(/api/proxy?url=${encodeURIComponent(u)})`
  )
}

function rewriteHtml(html: string, origin: string): string {
  html = rewriteAttr(html, origin)

  // Rewrite @import in <style> blocks
  html = html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, open, css, close) => open + css.replace(
      /@import\s+url\(['"]?(https?:\/\/[^'")]+)['"]?\)/g,
      (__, u) => `@import url(/api/proxy?url=${encodeURIComponent(u)})`
    ).replace(
      /url\(['"]?(https?:\/\/[^'")]+)['"]?\)/g,
      (__, u) => `url(/api/proxy?url=${encodeURIComponent(u)})`
    ) + close
  )

  const shim = `<script>
(function(){
var B=${JSON.stringify(origin)};
function px(u){try{var a=new URL(u,B);if(/^https?:/.test(a.protocol))return'/api/proxy?url='+encodeURIComponent(a.href);}catch(e){}return u;}

// XHR
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){try{if(typeof u==='string'&&/^https?:/.test(u))u=px(u);}catch(e){}return xo.apply(this,[m,u].concat([].slice.call(arguments,2)));};

// fetch
var ff=window.fetch;
window.fetch=function(u,o){try{if(typeof u==='string'&&/^https?:/.test(u))u=px(u);else if(u&&u.url)u=new Request(px(u.url),u);}catch(e){}return ff.call(this,u,o);};

// Notify parent of navigation
function notify(url){try{window.top.postMessage({type:'proxy-nav',url:new URL(url,B).href},'*');}catch(e){}}

// history
['pushState','replaceState'].forEach(function(k){
  var orig=history[k];
  history[k]=function(s,t,url){
    var r=orig.apply(this,arguments);
    if(url)notify(String(url));
    return r;
  };
});
window.addEventListener('popstate',function(){notify(location.href);});

// window.location.href setter
try{
  var desc=Object.getOwnPropertyDescriptor(window,'location');
  if(!desc||desc.configurable){
    // can't override location directly; patch assign/replace
    var la=location.assign.bind(location);
    location.assign=function(url){la(px(url));};
    var lr=location.replace.bind(location);
    location.replace=function(url){lr(px(url));};
  }
}catch(e){}

// Notify parent of current URL on load
notify(location.href);
window.addEventListener('load',function(){notify(location.href);});
})();
</script>`

  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, shim + '</head>')
  } else if (/<body/i.test(html)) {
    html = html.replace(/<body/i, shim + '<body')
  } else {
    html = shim + html
  }
  return html
}

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url')
  if (!targetUrl) return new NextResponse('Missing url', { status: 400 })

  let url: URL
  try { url = new URL(targetUrl) } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return new NextResponse('Protocol not allowed', { status: 403 })
  }

  let res: Response
  try {
    res = await fetch(targetUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Host': url.hostname,
        'Referer': url.origin + '/',
        'Origin': url.origin,
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new NextResponse(
      `<!doctype html><html><body style="background:#000;color:#f87171;font-family:monospace;padding:40px">
<h2 style="margin:0 0 12px">Proxy error</h2>
<p style="color:#71717a;font-size:13px">${msg}</p>
<p style="color:#52525b;font-size:11px">The server could not reach that URL.</p>
</body></html>`,
      { status: 502, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const contentType = (res.headers.get('content-type') ?? 'application/octet-stream').toLowerCase()
  const finalUrl = res.url || targetUrl
  const finalOrigin = new URL(finalUrl).origin

  // Build output headers — strip hop-by-hop and security headers
  const out = new Headers()
  out.set('Access-Control-Allow-Origin', '*')
  out.set('X-Frame-Options', 'ALLOWALL')
  out.set('Content-Security-Policy', "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval' data: blob: mediastream:")
  out.set('X-Content-Type-Options', 'nosniff')

  for (const [k, v] of res.headers.entries()) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v)
  }

  // HTML — buffer and rewrite, no cache
  if (contentType.includes('text/html')) {
    const html = rewriteHtml(await res.text(), finalOrigin)
    out.set('Content-Type', 'text/html; charset=utf-8')
    out.set('Cache-Control', 'no-store')
    return new NextResponse(html, { status: res.status, headers: out })
  }

  // CSS — buffer and rewrite, short cache
  if (contentType.includes('text/css')) {
    const css = (await res.text()).replace(
      /url\(['"]?(https?:\/\/[^'") ]+)['"]?\)/g,
      (_, u) => `url(/api/proxy?url=${encodeURIComponent(u)})`
    )
    out.set('Content-Type', 'text/css; charset=utf-8')
    out.set('Cache-Control', 'public, max-age=3600')
    return new NextResponse(css, { status: res.status, headers: out })
  }

  // Everything else — stream directly, cache aggressively
  const isStatic = contentType.includes('image/') || contentType.includes('font/') ||
    contentType.includes('audio/') || contentType.includes('video/')
  out.set('Cache-Control', isStatic ? 'public, max-age=86400, stale-while-revalidate=604800' : 'public, max-age=300')

  return new NextResponse(res.body, { status: res.status, headers: out })
}
