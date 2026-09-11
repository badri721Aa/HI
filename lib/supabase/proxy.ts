import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "@/lib/supabase/env"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Without real credentials this would just fail its network call below —
  // skip entirely rather than let a misconfigured/not-yet-configured
  // Supabase project take down routing for every single request.
  if (!isSupabaseConfigured) return supabaseResponse

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  try {
    // Do not add logic between createServerClient and getUser() — this
    // call is what actually refreshes an expiring session, and anything
    // in between risks silently skipping that refresh.
    await supabase.auth.getUser()
  } catch {
    // A network hiccup here shouldn't turn into a 500 on every page.
  }

  return supabaseResponse
}
