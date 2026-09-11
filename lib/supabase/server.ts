import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

/** Server-side Supabase client for Server Components / Route Handlers.
 * Reads the session from request cookies; middleware.ts keeps those
 * cookies fresh so this never sees a stale/expired access token. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // middleware.ts refreshes the session on every request.
          }
        },
      },
    }
  )
}
