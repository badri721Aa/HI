# Blushing Boutique — blushingbh.com

A standalone Next.js 16 site for Blushing Boutique (Riffa, Bahrain).
Lives in this subdirectory so it can be deployed independently from the
rest of the repo.

## Deploy on Vercel

1. Create a new project on Vercel from the `badri721Aa/HI` GitHub repo.
2. In the project settings, set **Root Directory** to `blushing-boutique`.
3. Framework preset auto-detects as **Next.js**.
4. Deploy — no environment variables required.
5. Add `blushingbh.com` under **Domains** and follow the DNS instructions.

## Editing content

Everything the site displays lives in one file: `lib/content.ts`.

- Update address, hours, contact info, and socials at the top.
- Add TikTok video URLs to the `tiktokVideos` array. Copy each URL directly
  from TikTok (right-click a video → "Copy link"). They will render as
  embedded, tappable TikTok cards on the lookbook section.

## Local dev

```
npm install
npm run dev
```

Then open http://localhost:3000.
