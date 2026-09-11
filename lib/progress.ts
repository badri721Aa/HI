"use client"

import * as React from "react"
import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/client"
import { isSupabaseConfigured } from "@/lib/supabase/env"

const STORAGE_KEY = "nosignal:completed-tutorials"
const SYNC_EVENT = "nosignal:progress"

function readLocal(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    // localStorage can be unavailable (private mode, quota, disabled).
    return new Set()
  }
}

function writeLocal(set: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
    window.dispatchEvent(new Event(SYNC_EVENT))
  } catch {
    // Same as above — a failed write just means progress isn't remembered.
  }
}

/**
 * Completed-tutorials state. Signed-out visitors get plain localStorage,
 * synced across tabs. Signed-in users get it synced to Supabase instead —
 * on the transition to signed-in, any local progress made while anonymous
 * is merged into the account rather than discarded, and kept mirrored in
 * localStorage so signing out doesn't lose it either.
 *
 * Falls back to local-only if Supabase isn't configured (missing env vars)
 * or a request fails — never throws, since this hook mounts on every
 * tutorial page and a network hiccup shouldn't break the page.
 */
export function useProgress() {
  const [user, setUser] = React.useState<User | null>(null)
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set())
  const supabaseRef = React.useRef(createClient())

  React.useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = supabaseRef.current
    supabase.auth
      .getUser()
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const supabase = supabaseRef.current

    async function load() {
      if (!user) {
        setCompleted(readLocal())
        return
      }

      const local = readLocal()
      try {
        const { data, error } = await supabase.from("tutorial_progress").select("slug")
        if (error) throw error
        const remote = new Set<string>((data ?? []).map((r) => r.slug as string))

        const toMerge = [...local].filter((slug) => !remote.has(slug))
        if (toMerge.length > 0) {
          await supabase
            .from("tutorial_progress")
            .upsert(
              toMerge.map((slug) => ({ user_id: user.id, slug })),
              { onConflict: "user_id,slug" }
            )
          toMerge.forEach((slug) => remote.add(slug))
        }

        if (!cancelled) {
          setCompleted(remote)
          writeLocal(remote)
        }
      } catch {
        // Supabase unreachable/misconfigured — fall back to local progress
        // rather than leave the page stuck with nothing.
        if (!cancelled) setCompleted(local)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user])

  // Anonymous cross-tab sync only — signed-in state is per-request from
  // Supabase, not something another tab writes to localStorage for us.
  React.useEffect(() => {
    if (user) return
    const sync = () => setCompleted(readLocal())
    window.addEventListener("storage", sync)
    window.addEventListener(SYNC_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(SYNC_EVENT, sync)
    }
  }, [user])

  const toggle = React.useCallback(
    async (slug: string) => {
      const isDone = completed.has(slug)
      const next = new Set(completed)
      if (isDone) next.delete(slug)
      else next.add(slug)
      setCompleted(next)
      writeLocal(next)

      if (user) {
        try {
          const supabase = supabaseRef.current
          if (isDone) {
            await supabase
              .from("tutorial_progress")
              .delete()
              .eq("user_id", user.id)
              .eq("slug", slug)
          } else {
            await supabase
              .from("tutorial_progress")
              .upsert({ user_id: user.id, slug }, { onConflict: "user_id,slug" })
          }
        } catch {
          // Local state (above) already reflects the toggle either way —
          // a failed sync just means it'll retry next time this loads.
        }
      }
    },
    [completed, user]
  )

  return { completed, toggle, signedIn: !!user }
}
