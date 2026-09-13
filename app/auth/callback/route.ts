import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const next = searchParams.get('next') ?? '/'

  // OAuth error from provider
  if (error) {
    const desc = searchParams.get('error_description') ?? 'Authentication failed'
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(desc)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.user) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(exchangeError?.message ?? 'auth_failed')}`
    )
  }

  const user = data.user

  // Sync profile (in case trigger didn't fire or metadata changed)
  await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email ?? '',
    display_name:
      user.user_metadata?.display_name ??
      user.user_metadata?.name ??
      user.email?.split('@')[0] ?? 'anon',
    full_name:
      user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
  }, { onConflict: 'id', ignoreDuplicates: false })

  // If no display_name set (magic-link new user), go to setup
  const needsSetup =
    !user.user_metadata?.display_name &&
    !user.user_metadata?.name &&
    !user.app_metadata?.provider?.includes('google')

  if (needsSetup) {
    return NextResponse.redirect(`${origin}/auth/setup`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
