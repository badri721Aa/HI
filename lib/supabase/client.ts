import { createBrowserClient } from "@supabase/ssr"

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env"

/** Browser-side Supabase client. */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
