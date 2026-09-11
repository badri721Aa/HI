import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

/** Lands here after email confirmation, OAuth (Google/GitHub), and
 * password-reset links — all of them hand back a `code` to exchange for
 * a session via PKCE. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
