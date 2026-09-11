"use client"

/** Prefix @supabase/ssr writes its session cookies under (e.g.
 * "sb-<project-ref>-auth-token", plus ".0"/".1" chunk suffixes for large
 * sessions). Matched here to retarget them, not to read their contents. */
const AUTH_COOKIE_PREFIX = "sb-"

/**
 * "Remember me" unchecked: called right after a successful email/password
 * sign-in. @supabase/ssr always writes its session cookies with its own
 * hardcoded long Max-Age — there's no supported option to override that at
 * the point they're written — so instead this re-writes each one immediately
 * after, same name/value/path, with no Max-Age at all, which makes it a
 * session cookie the browser clears on close.
 *
 * Known limitation: a background token refresh in a long-lived open tab
 * writes the cookie again through the same default path, which would
 * re-persist it. Good enough for the common case (close the tab, session's
 * gone) without a full custom cookie storage adapter for an auth-critical
 * code path. Only applies to email/password — OAuth's session is written
 * server-side during the callback exchange, outside this page's JS.
 */
export function downgradeAuthCookiesToSession() {
  if (typeof document === "undefined") return

  const names = document.cookie
    .split(";")
    .map((entry) => entry.split("=")[0]?.trim())
    .filter((name): name is string => !!name && name.startsWith(AUTH_COOKIE_PREFIX))

  const secure = window.location.protocol === "https:" ? "; secure" : ""

  for (const name of names) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    const value = match?.[1] ?? ""
    document.cookie = `${name}=${value}; path=/; samesite=lax${secure}`
  }
}
