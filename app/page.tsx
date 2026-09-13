'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageIllustration from '@/components/page-illustration'

const modules = [
  { href: '/tricks', icon: '◈', label: 'Exam Tricks', desc: 'MC patterns, essay shortcuts, time exploits' },
  { href: '/hacks', icon: '◉', label: 'Game Hacks', desc: 'Memory, overlays, trainers — concepts & code' },
  { href: '/extensions', icon: '◫', label: 'Extensions', desc: 'Auto-typer, AI fill, humanizer, stealth tab' },
  { href: '/chat', icon: '◌', label: 'Live Chat', desc: 'Real-time room with owner broadcasts' },
  { href: '/ai', icon: '◎', label: 'AI Tools', desc: 'Essay gen, answer writer, AI→human converter' },
  { href: '/news', icon: '◷', label: 'News Feed', desc: 'Pinned drops, announcements, live updates' },
]

export default function Home() {
  const [user, setUser] = useState<{ email?: string | null } | null>(null)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      {/* Hero */}
      <section className="relative">
        <PageIllustration />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pb-12 pt-32 md:pb-20 md:pt-44">
            <div className="pb-12 text-center md:pb-16">
              {/* Badge */}
              <div
                className="mb-6 inline-flex items-center gap-3 before:h-px before:w-8 before:bg-linear-to-r before:from-transparent before:to-indigo-200/50 after:h-px after:w-8 after:bg-linear-to-l after:from-transparent after:to-indigo-200/50"
                data-aos="fade-down"
              >
                <span className="inline-flex bg-linear-to-r from-indigo-500 to-indigo-200 bg-clip-text text-transparent text-xs font-medium tracking-widest uppercase">
                  school-only · covert · encrypted
                </span>
              </div>

              <h1
                className="animate-[gradient_6s_linear_infinite] bg-[linear-gradient(to_right,var(--color-gray-200),var(--color-indigo-200),var(--color-gray-50),var(--color-indigo-300),var(--color-gray-200))] bg-[length:200%_auto] bg-clip-text pb-5 font-nacelle text-5xl font-semibold text-transparent md:text-6xl"
                data-aos="fade-up"
              >
                Alhekma Cheating
              </h1>

              <div className="mx-auto max-w-3xl">
                <p
                  className="mb-8 text-xl text-indigo-200/65"
                  data-aos="fade-up"
                  data-aos-delay={200}
                >
                  Tools, tricks, and live comms — built for school. No traces, no logs.
                </p>
                <div className="mx-auto max-w-xs sm:flex sm:max-w-none sm:justify-center gap-3" data-aos="fade-up" data-aos-delay={400}>
                  {user ? (
                    <>
                      <Link
                        href="/chat"
                        className="btn group mb-4 w-full bg-linear-to-t from-indigo-600 to-indigo-500 bg-[length:100%_100%] bg-[bottom] text-white shadow-[inset_0px_1px_0px_0px_--theme(--color-white/.16)] hover:bg-[length:100%_150%] sm:mb-0 sm:w-auto"
                      >
                        <span className="relative inline-flex items-center">
                          Open Chat
                          <span className="ml-1 tracking-normal text-white/50 transition-transform group-hover:translate-x-0.5">→</span>
                        </span>
                      </Link>
                      <Link
                        href="/extensions"
                        className="btn relative w-full bg-linear-to-b from-gray-800 to-gray-800/60 bg-[length:100%_100%] bg-[bottom] text-gray-300 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-transparent before:[background:linear-gradient(to_right,var(--color-gray-800),var(--color-gray-700),var(--color-gray-800))_border-box] before:[mask-composite:exclude_!important] before:[mask:linear-gradient(white_0_0)_padding-box,_linear-gradient(white_0_0)] hover:bg-[length:100%_150%] sm:w-auto"
                      >
                        Extensions
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/auth/login"
                        className="btn group mb-4 w-full bg-linear-to-t from-indigo-600 to-indigo-500 bg-[length:100%_100%] bg-[bottom] text-white shadow-[inset_0px_1px_0px_0px_--theme(--color-white/.16)] hover:bg-[length:100%_150%] sm:mb-0 sm:w-auto"
                      >
                        <span className="relative inline-flex items-center">
                          Sign in with email
                          <span className="ml-1 tracking-normal text-white/50 transition-transform group-hover:translate-x-0.5">→</span>
                        </span>
                      </Link>
                      <Link
                        href="/chat"
                        className="btn relative w-full bg-linear-to-b from-gray-800 to-gray-800/60 bg-[length:100%_100%] bg-[bottom] text-gray-300 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-transparent before:[background:linear-gradient(to_right,var(--color-gray-800),var(--color-gray-700),var(--color-gray-800))_border-box] before:[mask-composite:exclude_!important] before:[mask:linear-gradient(white_0_0)_padding-box,_linear-gradient(white_0_0)] hover:bg-[length:100%_150%] sm:w-auto"
                      >
                        Live Chat →
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Status bar */}
              <div className="mt-10 flex items-center justify-center gap-6 text-xs text-gray-600 uppercase tracking-widest font-nacelle">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 animate-pulse" />
                  System live
                </span>
                <span>·</span>
                <span>Shift+Tab — panic hide</span>
                <span>·</span>
                <span>No logs kept</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modules grid */}
      <section className="relative">
        <div
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2"
          aria-hidden="true"
        >
          <img src="/images/blurred-shape-gray.svg" className="max-w-none opacity-40" width={760} height={668} alt="" />
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="border-t py-12 [border-image:linear-gradient(to_right,transparent,--theme(--color-slate-400/.25),transparent)_1] md:py-20">
            <div className="mx-auto max-w-3xl pb-4 text-center md:pb-12">
              <div className="inline-flex items-center gap-3 pb-3 before:h-px before:w-8 before:bg-linear-to-r before:from-transparent before:to-indigo-200/50 after:h-px after:w-8 after:bg-linear-to-l after:from-transparent after:to-indigo-200/50">
                <span className="inline-flex bg-linear-to-r from-indigo-500 to-indigo-200 bg-clip-text text-transparent text-xs">
                  All Tools
                </span>
              </div>
              <h2 className="animate-[gradient_6s_linear_infinite] bg-[linear-gradient(to_right,var(--color-gray-200),var(--color-indigo-200),var(--color-gray-50),var(--color-indigo-300),var(--color-gray-200))] bg-[length:200%_auto] bg-clip-text pb-4 font-nacelle text-3xl font-semibold text-transparent md:text-4xl">
                Everything you need to pass
              </h2>
            </div>

            <div className="mx-auto grid max-w-sm gap-4 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((m, i) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="group relative flex flex-col rounded-2xl border border-gray-800 bg-gray-900/50 p-6 transition-all duration-300 hover:border-gray-700 hover:bg-gray-900"
                  data-aos="fade-up"
                  data-aos-delay={i * 100}
                >
                  <div className="mb-4 font-nacelle text-xl text-indigo-500 transition-colors duration-300 group-hover:text-indigo-400">
                    {m.icon}
                  </div>
                  <div className="mb-1.5 font-nacelle text-[1rem] font-semibold text-gray-200 group-hover:text-white transition-colors duration-300">
                    {m.label}
                  </div>
                  <div className="text-sm text-indigo-200/65 leading-relaxed">
                    {m.desc}
                  </div>
                  <div className="pointer-events-none absolute inset-0 rounded-2xl border border-indigo-500/0 transition-all duration-300 group-hover:border-indigo-500/20" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
