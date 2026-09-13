import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      const hasName = data.user.user_metadata?.display_name
      if (!hasName) {
        return NextResponse.redirect(origin + '/auth/setup')
      }
      return NextResponse.redirect(origin + next)
    }
  }

  return NextResponse.redirect(origin + '/auth/login?error=auth_failed')
}
