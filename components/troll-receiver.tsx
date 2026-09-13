'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TrollPayload {
  target: string
  msg?: string
  url?: string
  type?: string
}

export function TrollReceiver() {
  const [userId, setUserId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [matrixActive, setMatrixActive] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const matrixRafRef = useRef<number>(0)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    if (userId === undefined) return

    const ch = sb.channel('troll-engine')

    ch.on('broadcast', { event: 'shake' }, ({ payload }: { payload: TrollPayload }) => {
      if (!matches(payload.target, userId)) return
      shake()
    })
    .on('broadcast', { event: 'fake-error' }, ({ payload }: { payload: TrollPayload }) => {
      if (!matches(payload.target, userId)) return
      setToast(payload.msg ?? 'SYSTEM ERROR: Critical failure detected.')
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
      startMatrix()
    })
    .subscribe()

    return () => { sb.removeChannel(ch) }
  }, [userId])

  function matches(target: string, uid: string | null) {
    return target === 'all' || (uid && target === uid)
  }

  function shake() {
    const style = document.createElement('style')
    style.textContent = `@keyframes troll-shake{0%,100%{transform:translate(0)}10%,50%,90%{transform:translate(-8px,4px)}30%,70%{transform:translate(8px,-4px)}}.troll-shaking{animation:troll-shake 0.5s ease-in-out 3}`
    document.head.appendChild(style)
    document.body.classList.add('troll-shaking')
    setTimeout(() => {
      document.body.classList.remove('troll-shaking')
      style.remove()
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
    const style = document.createElement('style')
    const jitterKf = `@keyframes cursor-jitter{0%,100%{margin-left:0;margin-top:0}25%{margin-left:-6px;margin-top:4px}50%{margin-left:6px;margin-top:-4px}75%{margin-left:-4px;margin-top:6px}}`
    style.textContent = `${jitterKf}body.cursor-chaos{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='8' fill='%23ef4444'/%3E%3C/svg%3E") 10 10,crosshair !important}body.cursor-chaos *{cursor:inherit !important}`
    document.head.appendChild(style)
    document.body.classList.add('cursor-chaos')
    let t = 0
    const jitter = setInterval(() => {
      window.scrollBy(Math.random() * 4 - 2, Math.random() * 4 - 2)
      t += 100
      if (t >= 8000) clearInterval(jitter)
    }, 100)
    setTimeout(() => {
      document.body.classList.remove('cursor-chaos')
      style.remove()
    }, 8000)
  }

  function startMatrix() {
    setMatrixActive(true)
    setTimeout(() => {
      setMatrixActive(false)
      cancelAnimationFrame(matrixRafRef.current)
    }, 6000)
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

      {/* Fake error toast */}
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
            <p className="text-sm text-zinc-200 leading-snug">{toast}</p>
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
