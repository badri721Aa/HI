import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL) {
  console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL is missing. Add it to .env.local and Vercel environment variables.')
}
if (!SUPABASE_ANON_KEY) {
  console.error('[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Add it to .env.local and Vercel environment variables.')
}

// Safe fallbacks so the app doesn't crash on missing env vars — auth calls will fail gracefully
const url = SUPABASE_URL || 'https://gvxnzgogfaifmsdkingq.supabase.co'
const key = SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eG56Z29nZmFpZm1zZGtpbmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNDkwODAsImV4cCI6MjA2NDYyNTA4MH0.M5YDcMHXOsxvuBFaKRAfkJ1sV_MmKubCL7SZXwZIdJA'

export function createClient() {
  return createBrowserClient(url, key)
}
