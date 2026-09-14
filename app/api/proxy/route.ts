import { NextRequest, NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'content-encoding',
  'x-frame-options', 'content-security-policy', 'content-security-policy-report-only',
  'x-content-type-options', 'strict-transport-security', 'content-length',
  'cross-origin-embedder-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy',
  'permissions-policy', 'feature-policy', 'report-to', 'nel',
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
function notify(url){try{var abs=new URL(url,B).href;window.top.postMessage({type:'proxy-nav',url:abs},'*');}catch(e){}}

// Frame-busting prevention — make site think it IS the top frame
try{Object.defineProperty(window,'top',{get:function(){return window;},configurable:true});}catch(e){}
try{Object.defineProperty(window,'parent',{get:function(){return window;},configurable:true});}catch(e){}
try{Object.defineProperty(window,'frameElement',{get:function(){return null;},configurable:true});}catch(e){}

// XHR
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){try{if(typeof u==='string'&&/^https?:/.test(u))u=px(u);}catch(e){}return xo.apply(this,[m,u].concat([].slice.call(arguments,2)));};

// fetch
var ff=window.fetch;
window.fetch=function(u,o){try{if(typeof u==='string'&&/^https?:/.test(u))u=px(u);else if(u&&u.url)u=new Request(px(u.url),u);}catch(e){}return ff.call(this,u,o);};

// WebSocket — proxy can't tunnel WS, redirect to origin
var WS=window.WebSocket;
window.WebSocket=function(url,proto){
  try{var a=new URL(url,B);url=a.href;}catch(e){}
  return proto?new WS(url,proto):new WS(url);
};
window.WebSocket.prototype=WS.prototype;
window.WebSocket.CONNECTING=WS.CONNECTING;
window.WebSocket.OPEN=WS.OPEN;
window.WebSocket.CLOSING=WS.CLOSING;
window.WebSocket.CLOSED=WS.CLOSED;

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

// location.assign / replace
try{
  var la=location.assign.bind(location);
  location.assign=function(url){la(px(url));};
  var lr=location.replace.bind(location);
  location.replace=function(url){lr(px(url));};
}catch(e){}

// Intercept document.write to catch inline redirects
var dw=document.write.bind(document);
document.write=function(s){
  if(typeof s==='string')s=s.replace(/((?:href|src|action)=["'])([^"']+)(["'])/gi,function(m,a,v,b){return SKIP(v)?m:a+px(v)+b;});
  return dw(s);
};
function SKIP(v){return!v||v[0]==='#'||/^(?:data:|javascript:|mailto:|tel:|blob:)/.test(v);}

// Notify parent of current URL immediately and on load
notify(location.href);
window.addEventListener('load',function(){notify(location.href);});
document.addEventListener('DOMContentLoaded',function(){notify(location.href);});
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
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;color:#f87171;font-family:ui-monospace,monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:40px}
.card{background:#050505;border:1px solid rgba(248,113,113,0.15);border-radius:16px;padding:32px;max-width:480px;width:100%;box-shadow:inset 0 1px 0 0 rgba(255,255,255,0.04)}
h2{font-size:14px;font-weight:600;color:#fca5a5;margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase}
p{font-size:12px;color:#71717a;line-height:1.6;margin-top:6px}
.url{font-size:11px;color:#3f3f46;word-break:break-all;margin-top:12px;padding:10px;background:#0A0A0C;border-radius:8px;border:1px solid rgba(255,255,255,0.06)}
</style></head><body><div class="card">
<h2>Could not reach this site</h2>
<p>${msg}</p>
<div class="url">${targetUrl}</div>
<p style="margin-top:12px">The site may be down, blocking proxies, or requiring authentication. Try opening it directly in a new tab.</p>
</div></body></html>`,
      { status: 502, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const contentType = (res.headers.get('content-type') ?? 'application/octet-stream').toLowerCase()
  const finalUrl = res.url || targetUrl
  const finalOrigin = new URL(finalUrl).origin

  const out = new Headers()
  out.set('Access-Control-Allow-Origin', '*')
  out.set('X-Frame-Options', 'ALLOWALL')
  out.set('Content-Security-Policy', "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval' data: blob: mediastream:")
  out.set('X-Content-Type-Options', 'nosniff')

  for (const [k, v] of res.headers.entries()) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v)
  }

  if (contentType.includes('text/html')) {
    const html = rewriteHtml(await res.text(), finalOrigin)
    out.set('Content-Type', 'text/html; charset=utf-8')
    out.set('Cache-Control', 'no-store')
    return new NextResponse(html, { status: res.status, headers: out })
  }

  if (contentType.includes('text/css')) {
    const css = (await res.text()).replace(
      /url\(['"]?(https?:\/\/[^'") ]+)['"]?\)/g,
      (_, u) => `url(/api/proxy?url=${encodeURIComponent(u)})`
    ).replace(
      /@import\s+url\(['"]?(https?:\/\/[^'")]+)['"]?\)/g,
      (_, u) => `@import url(/api/proxy?url=${encodeURIComponent(u)})`
    )
    out.set('Content-Type', 'text/css; charset=utf-8')
    out.set('Cache-Control', 'public, max-age=3600')
    return new NextResponse(css, { status: res.status, headers: out })
  }

  const isStatic = contentType.includes('image/') || contentType.includes('font/') ||
    contentType.includes('audio/') || contentType.includes('video/')
  out.set('Cache-Control', isStatic ? 'public, max-age=86400, stale-while-revalidate=604800' : 'public, max-age=300')

  return new NextResponse(res.body, { status: res.status, headers: out })
}
