This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment variables

The "Ask nosignal" chat widget (bottom-right of every page) calls a Claude
API through `app/api/chat/route.ts`. Set these in `.env.local` for dev, and
in the Vercel project's Environment Variables settings for production:

- `ANTHROPIC_API_KEY` — required. Without it, the widget shows "AI assistant
  isn't configured yet" instead of erroring.
- `ANTHROPIC_MODEL` — optional, defaults to `claude-haiku-4-5-20251001`.

This is a real, metered API — each message costs a small amount. The route
does basic per-IP rate limiting and caps response length, but that's not a
substitute for keeping an eye on usage if the site gets real traffic.

### Supabase (accounts + tutorial progress sync)

A Supabase project ("nosignal", free tier) is already created and wired up
via `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Add both to the Vercel project's Environment Variables too — `.env.local`
only covers local dev. Email/password sign-in, sign-up, and password reset
work as soon as those are set; Google and GitHub sign-in need one more step
each, since creating OAuth apps requires your own accounts on those
platforms:

**Google:**
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create Credentials → OAuth client ID → Web application.
2. Authorized redirect URI: `https://gvxnzgogfaifmsdkingq.supabase.co/auth/v1/callback`
3. Copy the generated Client ID and Client Secret.
4. In the [Supabase dashboard](https://supabase.com/dashboard/project/gvxnzgogfaifmsdkingq/auth/providers) → Authentication → Providers → Google: paste both, enable the provider.

**GitHub:**
1. [GitHub Developer Settings](https://github.com/settings/developers) → New OAuth App.
2. Authorization callback URL: `https://gvxnzgogfaifmsdkingq.supabase.co/auth/v1/callback`
3. Copy the generated Client ID, generate and copy a Client Secret.
4. In the same Supabase dashboard page → Providers → GitHub: paste both, enable the provider.

Until each provider is enabled in Supabase, its button on `/login` will
return a real error from Supabase (not a silent failure) when clicked.

Also worth setting once, in Supabase → Authentication → URL Configuration:
add your production domain (`https://nosignal.solar`) to **Redirect URLs**
so the OAuth/email-confirmation round trip is allowed to land back there —
by default only `localhost` is allowed.

Tutorial completion (the "Mark complete" button) is stored per-account in
the `tutorial_progress` table, guarded by row-level security so each user
can only ever read or write their own rows. Signed-out visitors still get
progress tracking via `localStorage`; signing in merges that local
progress into the account instead of discarding it.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
