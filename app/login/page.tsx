"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LiquidButton } from "@/components/ui/liquid-button"
import { GoogleIcon } from "@/components/google-icon"
import { GithubIcon } from "@/components/github-icon"
import { createClient } from "@/lib/supabase/client"
import { downgradeAuthCookiesToSession } from "@/lib/supabase/remember"
import { validateUsername } from "@/lib/username"

type Mode = "signin" | "signup" | "forgot"

export default function LoginPage() {
  const [mode, setMode] = React.useState<Mode>("signin")
  const [username, setUsername] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [rememberMe, setRememberMe] = React.useState(true)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const router = useRouter()

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setMessage(null)
  }

  const onOAuth = async (provider: "google" | "github") => {
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    const supabase = createClient()

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (!rememberMe) downgradeAuthCookiesToSession()
        router.push("/")
        router.refresh()
        return
      }

      if (mode === "signup") {
        const usernameError = validateUsername(username)
        if (usernameError) throw new Error(usernameError)

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { username: username.trim() },
          },
        })
        if (error) throw error
        if (data.session) {
          if (!rememberMe) downgradeAuthCookiesToSession()
          router.push("/")
          router.refresh()
          return
        }
        setMessage("Check your email to confirm your account.")
        return
      }

      // mode === "forgot"
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      })
      if (error) throw error
      setMessage("Check your email for a reset link.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
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
            {mode === "signin"
              ? "Welcome back"
              : mode === "signup"
                ? "Create an account"
                : "Reset your password"}
          </h1>
        </div>

        {mode !== "forgot" && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-2">
              <LiquidButton
                type="button"
                onClick={() => onOAuth("google")}
                className="gap-2 rounded-md"
              >
                <GoogleIcon className="size-4" />
                Google
              </LiquidButton>
              <LiquidButton
                type="button"
                onClick={() => onOAuth("github")}
                className="gap-2 rounded-md"
              >
                <GithubIcon className="size-4" />
                GitHub
              </LiquidButton>
            </div>

            <div className="mb-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Username
              </span>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-10 rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                placeholder="no spaces, letters/numbers/_/- only"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
              placeholder="you@example.com"
            />
          </label>

          {mode !== "forgot" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Password
              </span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                placeholder="••••••••"
              />
            </label>
          )}

          {mode === "signin" && (
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-3.5 rounded border-border accent-[#00e5a0]"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && <p className="text-[12px] text-[#ff5f72]">{error}</p>}
          {message && <p className="text-[12px] text-[#00e5a0]">{message}</p>}

          <Button type="submit" variant="glow" disabled={loading} className="mt-1 rounded-full">
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          {mode === "signin" && (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="text-foreground underline underline-offset-2"
              >
                Sign up
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="text-foreground underline underline-offset-2"
              >
                Sign in
              </button>
            </>
          )}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="text-foreground underline underline-offset-2"
            >
              Back to sign in
            </button>
          )}
        </p>
      </div>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          ← Back to nosignal
        </Link>
      </p>
    </div>
  )
}
