"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { LogOut, User as UserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { cn } from "@/lib/utils"

export function UserMenu() {
  const [user, setUser] = React.useState<User | null>(null)
  const [open, setOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const router = useRouter()

  React.useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = createClient()

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
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setOpen(false)
    router.push("/")
    router.refresh()
  }

  if (!user) {
    return (
      <Button
        asChild
        variant="outline"
        size="icon"
        className="rounded-full border-border bg-transparent text-foreground hover:bg-card"
      >
        <Link href="/login" aria-label="Sign in">
          <UserIcon className="size-4" />
        </Link>
      </Button>
    )
  }

  const username = typeof user.user_metadata?.username === "string" ? user.user_metadata.username : null
  const initial = (username ?? user.email ?? "?").charAt(0).toUpperCase()

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-transparent font-[family-name:var(--font-mono)] text-xs font-semibold text-foreground transition-colors hover:bg-card"
      >
        {initial}
      </button>

      <div
        className={cn(
          "glass absolute right-0 top-11 w-56 origin-top-right rounded-lg border border-border p-1.5 transition-all duration-150",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        )}
      >
        <div className="px-2.5 py-2">
          {username && <p className="truncate text-[13px] font-medium text-foreground">{username}</p>}
          <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
        </div>
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          onClick={signOut}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-white/5"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </div>
    </div>
  )
}
