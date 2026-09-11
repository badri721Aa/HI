"use client"

import * as React from "react"
import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/client"

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
 */
export function useProgress() {
  const [user, setUser] = React.useState<User | null>(null)
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set())
  const supabaseRef = React.useRef(createClient())

  React.useEffect(() => {
    const supabase = supabaseRef.current
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
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
      const { data } = await supabase.from("tutorial_progress").select("slug")
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

      if (user) {
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
        writeLocal(next)
      } else {
        writeLocal(next)
      }
    },
    [completed, user]
  )

  return { completed, toggle, signedIn: !!user }
}
