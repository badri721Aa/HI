"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

export default function ResetPasswordPage() {
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const router = useRouter()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setDone(true)
    setTimeout(() => {
      router.push("/")
      router.refresh()
    }, 1500)
  }

  return (
    <div className="relative mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-5 pt-28 pb-16 sm:px-0">
      <div className="nebula-glow -z-10" />

      <div className="glass rounded-2xl border border-border p-7">
        <div className="mb-6 text-center">
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            nosignal
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-foreground">
            Set a new password
          </h1>
        </div>

        {done ? (
          <p className="text-center text-[13px] text-[#00e5a0]">
            Password updated — redirecting you home.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                New password
              </span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                placeholder="••••••••"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Confirm password
              </span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-10 rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                placeholder="••••••••"
              />
            </label>

            {error && <p className="text-[12px] text-[#ff5f72]">{error}</p>}

            <Button type="submit" variant="glow" disabled={loading} className="mt-1 rounded-full">
              {loading && <Loader2 className="size-4 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
