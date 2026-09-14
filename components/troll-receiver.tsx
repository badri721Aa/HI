'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TrollPayload {
  target: string
  msg?: string
  url?: string
  type?: string
  duration?: number
}

type ToastVariant = 'error' | 'bsod' | 'update'

interface ToastState {
  msg: string
  variant: ToastVariant
}

export function TrollReceiver() {
  const [userId, setUserId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [matrixActive, setMatrixActive] = useState(false)
  const [bsodActive, setBsodActive] = useState(false)
  const [updateActive, setUpdateActive] = useState(false)
  const [updatePct, setUpdatePct] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const matrixRafRef = useRef<number>(0)
  const activeStyles = useRef<Map<string, HTMLStyleElement>>(new Map())
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    if (userId === undefined) return

    const ch = sb.channel('troll-engine')

    ch
      .on('broadcast', { event: 'shake' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        shake()
      })
      .on('broadcast', { event: 'fake-error' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        setToast({ msg: payload.msg ?? 'SYSTEM ERROR: Critical failure detected.', variant: 'error' })
        setTimeout(() => setToast(null), 6000)
      })
      .on('broadcast', { event: 'gravity-flip' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        gravityFlip()
      })
      .on('broadcast', { event: 'rickroll' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        window.open(payload.url ?? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')
      })
      .on('broadcast', { event: 'audio' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        playAlarm()
      })
      .on('broadcast', { event: 'cursor-chaos' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        cursorChaos()
      })
      .on('broadcast', { event: 'matrix' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        startMatrix(payload.duration ?? 6000)
      })
      // CSS injection effects
      .on('broadcast', { event: 'crt' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-crt', CRT_CSS, payload.duration)
      })
      .on('broadcast', { event: 'glitch' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-glitch', GLITCH_CSS, payload.duration)
      })
      .on('broadcast', { event: 'invert' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-invert', 'body{filter:invert(1)!important}', payload.duration)
      })
      .on('broadcast', { event: 'blur' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-blur', 'body{filter:blur(4px)!important}', payload.duration)
      })
      .on('broadcast', { event: 'sepia' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-sepia', 'body{filter:sepia(1)!important}', payload.duration)
      })
      .on('broadcast', { event: 'rainbow' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-rainbow', RAINBOW_CSS, payload.duration)
      })
      .on('broadcast', { event: 'zoom' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-zoom', 'body{zoom:1.5!important}', payload.duration)
      })
      .on('broadcast', { event: 'hide-cursor' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-hide-cursor', 'body,body *{cursor:none!important}', payload.duration)
      })
      .on('broadcast', { event: 'flip' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        toggleCssEffect('troll-flip', 'body{transform:scaleX(-1)!important}', payload.duration)
      })
      // Fake UI effects
      .on('broadcast', { event: 'bsod' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        startBsod(payload.duration ?? 8000)
      })
      .on('broadcast', { event: 'fake-update' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        startFakeUpdate(payload.duration ?? 10000)
      })
      // Dismiss all active effects
      .on('broadcast', { event: 'clear-all' }, ({ payload }: { payload: TrollPayload }) => {
        if (!matches(payload.target, userId)) return
        clearAll()
      })
      .subscribe()

    return () => { sb.removeChannel(ch) }
  }, [userId])

  function matches(target: string, uid: string | null) {
    return target === 'all' || (uid && target === uid)
  }

  function injectStyle(id: string, css: string) {
    if (activeStyles.current.has(id)) return
    const el = document.createElement('style')
    el.id = id
    el.textContent = css
    document.head.appendChild(el)
    activeStyles.current.set(id, el)
  }

  function removeStyle(id: string) {
    const el = activeStyles.current.get(id)
    if (el) { el.remove(); activeStyles.current.delete(id) }
  }

  function toggleCssEffect(id: string, css: string, duration = 8000) {
    if (activeStyles.current.has(id)) {
      removeStyle(id)
      return
    }
    injectStyle(id, css)
    if (duration > 0) setTimeout(() => removeStyle(id), duration)
  }

  function clearAll() {
    activeStyles.current.forEach((_, id) => removeStyle(id))
    setMatrixActive(false)
    setBsodActive(false)
    setUpdateActive(false)
    setToast(null)
    document.body.style.transform = ''
    document.body.style.transition = ''
  }

  function shake() {
    const id = 'troll-shake-kf'
    const css = `@keyframes troll-shake{0%,100%{transform:translate(0)}10%,50%,90%{transform:translate(-8px,4px)}30%,70%{transform:translate(8px,-4px)}}.troll-shaking{animation:troll-shake 0.5s ease-in-out 3}`
    injectStyle(id, css)
    document.body.classList.add('troll-shaking')
    setTimeout(() => {
      document.body.classList.remove('troll-shaking')
      removeStyle(id)
    }, 1600)
  }

  function gravityFlip() {
    document.body.style.transform = 'scaleY(-1)'
    document.body.style.transition = 'transform 0.4s ease'
    setTimeout(() => {
      document.body.style.transform = ''
    }, 5000)
  }

  function playAlarm() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.2)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.4)
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.6)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1.2)
    } catch {
      // AudioContext blocked
    }
  }

  function cursorChaos() {
    const id = 'troll-cursor-chaos'
    const css = `body.cursor-chaos,body.cursor-chaos *{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='8' fill='%23ef4444'/%3E%3C/svg%3E") 10 10,crosshair !important}`
    injectStyle(id, css)
    document.body.classList.add('cursor-chaos')
    let t = 0
    const jitter = setInterval(() => {
      window.scrollBy(Math.random() * 4 - 2, Math.random() * 4 - 2)
      t += 100
      if (t >= 8000) clearInterval(jitter)
    }, 100)
    setTimeout(() => {
      document.body.classList.remove('cursor-chaos')
      removeStyle(id)
    }, 8000)
  }

  function startMatrix(duration: number) {
    setMatrixActive(true)
    setTimeout(() => {
      setMatrixActive(false)
      cancelAnimationFrame(matrixRafRef.current)
    }, duration)
  }

  function startBsod(duration: number) {
    setBsodActive(true)
    setTimeout(() => setBsodActive(false), duration)
  }

  function startFakeUpdate(duration: number) {
    setUpdateActive(true)
    setUpdatePct(0)
    const step = 100 / (duration / 200)
    const iv = setInterval(() => {
      setUpdatePct(p => {
        const next = p + step + (Math.random() * step * 0.5)
        if (next >= 100) {
          clearInterval(iv)
          setTimeout(() => setUpdateActive(false), 2000)
          return 100
        }
        return next
      })
    }, 200)
  }

  useEffect(() => {
    if (!matrixActive) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const cols = Math.floor(canvas.width / 14)
    const drops: number[] = Array(cols).fill(1)
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF'

    function draw() {
      ctx!.fillStyle = 'rgba(0,0,0,0.05)'
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height)
      ctx!.fillStyle = '#0f0'
      ctx!.font = '13px monospace'
      for (let i = 0; i < drops.length; i++) {
        const c = chars[Math.floor(Math.random() * chars.length)]
        ctx!.fillText(c, i * 14, drops[i] * 14)
        if (drops[i] * 14 > canvas!.height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
      }
      matrixRafRef.current = requestAnimationFrame(draw)
    }
    matrixRafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(matrixRafRef.current)
  }, [matrixActive])

  return (
    <>
      {/* Matrix overlay */}
      {matrixActive && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 z-[9998] pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        />
      )}

      {/* BSOD overlay */}
      {bsodActive && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
          style={{ background: '#0078d7', fontFamily: 'Segoe UI, sans-serif', color: '#fff' }}
          onClick={() => setBsodActive(false)}
        >
          <div className="text-center max-w-xl px-8">
            <div style={{ fontSize: '8rem', lineHeight: 1 }}>:(</div>
            <p className="mt-6 text-lg font-semibold">Your PC ran into a problem and needs to restart.</p>
            <p className="mt-3 text-sm opacity-80">We&apos;re just collecting some error info, and then we&apos;ll restart for you.</p>
            <p className="mt-8 text-4xl font-bold">0% complete</p>
            <p className="mt-8 text-xs opacity-60">For more information about this issue and possible fixes, visit https://www.windows.com/stopcode</p>
            <p className="mt-4 text-xs opacity-60">Stop code: <span className="font-mono">CRITICAL_PROCESS_DIED</span></p>
            <p className="mt-2 text-xs opacity-40">(Click anywhere to dismiss)</p>
          </div>
        </div>
      )}

      {/* Fake Windows Update */}
      {updateActive && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ background: '#1a1a2e', color: '#fff', fontFamily: 'Segoe UI, sans-serif' }}
          onClick={() => updateActive && updatePct >= 100 && setUpdateActive(false)}
        >
          <div className="text-center max-w-sm px-8">
            <div className="mb-8">
              <svg viewBox="0 0 48 48" className="mx-auto w-16 h-16" fill="none">
                <rect x="2" y="2" width="20" height="20" fill="#f25022"/>
                <rect x="26" y="2" width="20" height="20" fill="#7fba00"/>
                <rect x="2" y="26" width="20" height="20" fill="#00a4ef"/>
                <rect x="26" y="26" width="20" height="20" fill="#ffb900"/>
              </svg>
            </div>
            <p className="text-lg font-light mb-2">Updating Windows</p>
            <p className="text-sm opacity-60 mb-8">Don&apos;t turn off your PC. This will take a while.</p>
            <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-200"
                style={{ width: `${Math.min(updatePct, 100)}%` }}
              />
            </div>
            <p className="text-2xl font-semibold">{Math.floor(Math.min(updatePct, 100))}%</p>
            {updatePct >= 100 && (
              <p className="mt-4 text-xs opacity-40">(Click to dismiss)</p>
            )}
          </div>
        </div>
      )}

      {/* Fake error / info toast */}
      {toast && (
        <div className="fixed top-6 inset-x-4 z-[9999] flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-zinc-950/95 backdrop-blur-xl p-5 shadow-2xl shadow-rose-950/40 sm:left-auto sm:right-6 sm:max-w-sm">
          <div className="flex-shrink-0 mt-0.5">
            <div className="h-8 w-8 rounded-full bg-rose-500/20 flex items-center justify-center">
              <svg className="h-4 w-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="mono text-[10px] tracking-widest text-rose-500 uppercase mb-1">System Alert</p>
            <p className="text-sm text-zinc-200 leading-snug">{toast.msg}</p>
          </div>
          <button onClick={() => setToast(null)} className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}

const CRT_CSS = `
body::after{content:'';position:fixed;inset:0;z-index:9990;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.08) 0px,rgba(0,0,0,0.08) 1px,transparent 1px,transparent 2px);animation:troll-crt-flicker 0.15s infinite}
@keyframes troll-crt-flicker{0%,100%{opacity:1}50%{opacity:0.95}}
`

const GLITCH_CSS = `
@keyframes troll-glitch{0%,100%{clip-path:inset(0 0 100% 0);transform:translateX(0)}10%{clip-path:inset(20% 0 60% 0);transform:translateX(-4px)}20%{clip-path:inset(50% 0 30% 0);transform:translateX(4px)}30%{clip-path:inset(10% 0 80% 0);transform:translateX(-2px)}40%,90%{clip-path:inset(0 0 0 0);transform:translateX(0)}}
body::before{content:'';position:fixed;inset:0;z-index:9991;pointer-events:none;background:linear-gradient(90deg,rgba(255,0,0,0.05),rgba(0,255,255,0.05));animation:troll-glitch 0.3s steps(1) infinite}
`

const RAINBOW_CSS = `
@keyframes troll-hue{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}
body{animation:troll-hue 2s linear infinite!important}
`
