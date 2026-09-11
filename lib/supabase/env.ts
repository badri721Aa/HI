/** Supabase project URL/key, with harmless placeholders when unset so
 * client construction never throws during a build or a cold request —
 * see isSupabaseConfigured for the actual presence check. Without this,
 * an unset env var crashes the entire static export (confirmed: this is
 * exactly what took down the Vercel build), not just the auth feature. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
