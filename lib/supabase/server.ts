import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env"

/** Server-side Supabase client for Server Components / Route Handlers.
 * Reads the session from request cookies; proxy.ts keeps those cookies
 * fresh so this never sees a stale/expired access token. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component — safe to ignore since
          // proxy.ts refreshes the session on every request.
        }
      },
    },
  })
}
