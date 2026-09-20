'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

// ─── Types ───

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  kind: ToastKind
  title: string
  desc?: string
  duration?: number
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

// ─── Hook ───

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ─── Icon per kind ───

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; text: string; iconBg: string }> = {
  success: {
    bg: 'rgba(5,5,6,0.98)', border: 'rgba(16,185,129,0.28)',
    text: '#6EE7B7', iconBg: 'rgba(16,185,129,0.12)',
  },
  error: {
    bg: 'rgba(5,5,6,0.98)', border: 'rgba(244,63,94,0.28)',
    text: '#FDA4AF', iconBg: 'rgba(244,63,94,0.12)',
  },
  warning: {
    bg: 'rgba(5,5,6,0.98)', border: 'rgba(245,158,11,0.28)',
    text: '#FCD34D', iconBg: 'rgba(245,158,11,0.12)',
  },
  info: {
    bg: 'rgba(5,5,6,0.98)', border: 'rgba(139,92,246,0.28)',
    text: '#C4B5FD', iconBg: 'rgba(139,92,246,0.12)',
  },
}

// ─── Provider ───

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const dismiss = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 10)
    const duration = t.duration ?? 4500
    setToasts(prev => [...prev, { ...t, id }])
    if (duration > 0) window.setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const clear = React.useCallback(() => setToasts([]), [])

  const value = React.useMemo(() => ({ push, dismiss, clear }), [push, dismiss, clear])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && createPortal(<ToastViewport toasts={toasts} dismiss={dismiss} />, document.body)}
    </ToastContext.Provider>
  )
}

// ─── Viewport ───

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const reduce = useReducedMotion()

  return (
    <div
      className="pointer-events-none fixed z-[9999] top-4 right-4 flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm w-full"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map(t => {
          const style = KIND_STYLES[t.kind]
          return (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              drag={reduce ? false : 'x'}
              dragConstraints={{ left: 0, right: 200 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => { if (info.offset.x > 80) dismiss(t.id) }}
              className="pointer-events-auto rounded-2xl px-3.5 py-3 flex items-start gap-3 cursor-grab active:cursor-grabbing"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.5)`,
                backdropFilter: 'blur(20px) saturate(180%)',
              }}
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: style.iconBg, color: style.text, border: `1px solid ${style.border}` }}
              >
                {ICONS[t.kind]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-100 leading-snug">{t.title}</p>
                {t.desc && <p className="mt-0.5 text-[11px] text-zinc-500 leading-snug">{t.desc}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
                aria-label="Dismiss"
              >
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
