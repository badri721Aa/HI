# Homework Autopilot — Setup

This wires three things into the Alhekma app:

1. **A real Claude brain** behind `/api/ai` (streaming). Groq stays as a fallback.
2. **A Google Classroom reader** at `/classroom` that pulls your real assignments and solves each with Claude.
3. **A Chrome extension auto-typer** that runs *on* Classroom / Docs / Forms, grabs the question, asks Claude, and types the answer in like a human.

---

## 1. Turn on the Claude brain (required)

Set one environment variable in your host (Vercel → Project → Settings → Environment Variables, or `.env.local` for local dev):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get the key at <https://console.anthropic.com> → API Keys. That's the only required var — the site works the moment it's set.

### Optional knobs

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Switch to `claude-sonnet-5-5` or `claude-haiku-5-5` to cut cost a lot. |
| `ANTHROPIC_EFFORT` | `low` | `low`→snappy/cheap, up to `max`→slow/thorough. |
| `ANTHROPIC_MAX_TOKENS` | `4096` | Raise for very long essays. |
| `GROQ_API_KEY` | — | Fallback brain if the Anthropic key is missing/unset. |

> **Cost:** Opus is the smartest but most expensive. For a homework helper that gets hammered, `claude-haiku-5-5` or `claude-sonnet-5-5` is usually plenty and far cheaper — just set `ANTHROPIC_MODEL`.

Redeploy after setting vars. Test at `/ai` or `/classroom` (manual solver).

---

## 2. Google Classroom integration (optional)

The `/classroom` page can pull your real assignments. It uses in-browser Google sign-in (read-only), so you need a Google OAuth **client ID**.

1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library →** enable **Google Classroom API**.
3. **APIs & Services → OAuth consent screen →** set it up (External is fine; add yourself as a test user).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorized JavaScript origins:** add `https://alhekma-cheating.vercel.app` and `http://localhost:3000`.
5. Copy the client ID and set it:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

Scopes requested (read-only): `classroom.courses.readonly`, `classroom.coursework.me.readonly`, `classroom.announcements.readonly`.

Without this var, `/classroom` still works — the **manual solver** (paste a question) runs on Claude regardless.

---

## 3. Install the extension (the auto-typer)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. Open any **Google Classroom assignment, Google Doc, or Google Form**. A 🧠 button appears bottom-right.

### Using it

- **Grab** — pulls the question from the page (or select text first, then Grab — most reliable).
- **Solve** — Claude answers into the editable box.
- **Auto-type** — types the answer into the focused field / form / doc, human-speed.
- **Speed** slider controls typing cadence. **Copy** drops the answer on your clipboard.
- Shortcuts: `Alt+Shift+H` panel · `Alt+Shift+S` grab+solve · `Alt+Shift+T` auto-type.

The extension calls the Claude brain through your deployed site. If you're running locally, open the panel → **API base** → set `http://localhost:3000`.

### What works where

| Target | Behavior |
|---|---|
| Google Forms — text/paragraph | types the answer in |
| Google Forms — multiple choice | matches Claude's answer to an option and clicks it |
| Classroom short-answer / comments | types into the textarea |
| Any `<textarea>` / `<input>` / contenteditable | types in |
| **Google Docs (canvas editor)** | best-effort inject **+** clipboard fallback — if nothing appears, hit **Copy** then `Ctrl+V`. Docs' canvas is the one target that resists scripted typing. |

---

## Files added / changed

- `app/api/ai/route.ts` — Claude streaming brain (+ Groq/static fallback, CORS).
- `app/api/classroom/route.ts` — Google Classroom REST proxy.
- `app/classroom/page.tsx` — assignments UI + manual solver.
- `extension/classroom.js` — the grab/solve/auto-type content script.
- `extension/background.js` — AI proxy + settings storage.
- `extension/manifest.json` — Google host permissions + content script.
- `next.config.ts` — CSP allows Google's sign-in script.
- `components/nav.tsx` — adds the **Classroom** nav link.
