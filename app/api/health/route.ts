import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}

  // Supabase DB ping
  try {
    const t = Date.now()
    const sb = await createClient()
    const { error } = await sb.from('profiles').select('id').limit(1)
    checks.database = { ok: !error, latencyMs: Date.now() - t, error: error?.message }
  } catch (e) {
    checks.database = { ok: false, error: String(e) }
  }

  // Supabase REST reachability
  try {
    const t = Date.now()
    const res = await fetch('https://gvxnzgogfaifmsdkingq.supabase.co/rest/v1/', {
      headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eG56Z29nZmFpZm1zZGtpbmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNDkwODAsImV4cCI6MjA2NDYyNTA4MH0.M5YDcMHXOsxvuBFaKRAfkJ1sV_MmKubCL7SZXwZIdJA' },
      signal: AbortSignal.timeout(5000),
    })
    checks.rest = { ok: res.ok, latencyMs: Date.now() - t }
  } catch (e) {
    checks.rest = { ok: false, error: String(e) }
  }

  const allOk = Object.values(checks).every(c => c.ok)

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      totalLatencyMs: Date.now() - start,
      checks,
      ts: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
