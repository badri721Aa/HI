# StudyPilot: Classroom & Docs Study Assistant

A Chrome extension that tracks all your Google Classroom homework in one dashboard and adds an AI study sidebar to Google Docs and Classroom. It **helps you learn**: it explains, gives hints and checks your own work. It never writes work for you to hand in.

**Created by Abdullah Masoud.**

---

## Install (2 minutes)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and pick this `study-extension` folder.
4. Pin StudyPilot from the 🧩 menu. The settings page opens on first install.
5. Paste your **Claude API key** (get one at [console.anthropic.com](https://console.anthropic.com/settings/keys)) and click **Test**.

There's no build step. The official Anthropic SDK is already bundled in `vendor/anthropic.js`.

## Connect Google Classroom (one-time, about 5 minutes)

Google only lets an extension read Classroom with its own OAuth client ID, so you need to create one:

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), create a project, and **enable the Google Classroom API** (APIs & Services → Library).
2. **OAuth consent screen**: choose *External*, fill in the app name (StudyPilot) and your email, add the scopes `classroom.courses.readonly` and `classroom.coursework.me.readonly`, and add your school Google account under **Test users**.
3. **Credentials → Create credentials → OAuth client ID → Application type: Chrome extension.** For *Item ID*, paste your extension's ID from `chrome://extensions`. The ID stays the same as long as you load the extension from the same folder.
4. Copy the client ID into `manifest.json` → `oauth2.client_id`, replacing `YOUR_CLIENT_ID.apps.googleusercontent.com`.
5. Click the reload ⟳ icon on StudyPilot in `chrome://extensions`, then click **Connect** in the popup.

> Some school Google accounts block third-party apps. If sign-in is refused, ask your school's IT admin, or just add tasks by hand with **+**.

---

## Features

### 📋 Homework dashboard (popup)
- Imports courses, assignments, due dates, points and your turn-in status from Google Classroom (read-only)
- Sorts by urgency: overdue → due today → tomorrow → this week → later, with bigger tasks pulled forward
- Color-coded urgency bars, "Due in 5h" / "Overdue 1d" pills, and a color dot per class
- Stat tiles you can click (Overdue · Due today · This week · Done in last 7 days)
- Weekly progress ring, a next-deadline preview and an activity streak 🔥
- Search, class filter, and filter chips (All, Overdue, Today, This week, Later, Done)
- Add your own tasks with a class, due date and time estimate. Delete with Undo
- Click a task's time estimate to change it. Your edits survive re-syncs
- Mark anything done (including Classroom work you finished offline)
- One-click link to open the assignment in Classroom
- Auto-sync every hour, plus manual sync

### 🔔 Reminders & badge
- Toolbar badge counting overdue and due-soon work (red when something's overdue)
- Desktop notifications before deadlines (2h to 2 days before, your choice). Click one to open the assignment

### 🗓️ Planner
- 7-day plan that spreads each task's time across the days before its deadline, most urgent first
- Daily time budget with a load bar per day and ⚠️ warnings for crunch days
- ✨ AI study plan: Claude turns your list into a realistic day-by-day schedule

### 🎯 Focus timer
- Pomodoro focus/break timer that keeps running after you close the popup
- Notification when a session ends, and the break starts automatically
- Daily focus goal bar, total sessions, focus streak, and a 7-day chart

### 🃏 Flashcards
- Spaced repetition (Leitner boxes): Again / Good / Easy with keys 1/2/3, Space to flip
- Decks with due counts. Add cards by hand or generate them from any text with AI

### 🧠 Study Assistant sidebar (Google Docs, Classroom, or any page)
- Floating button (or **Alt+Shift+S**) opens a slide-in sidebar. Text streams in live
- **💡 Explain**: plain-language explanation, an example and a check-yourself question
- **🪜 Hint**: a 3-step hint ladder that stops before the answer
- **🧒 Simplify**, **📝 Summarize** and **📖 Define** (with a memory trick)
- **✍️ Grammar**: issue-by-issue feedback on *your* writing, keeping your voice
- **✅ Check**: paste a question and *your* answer to see what's right, what's off, and a hint to fix it
- **🃏 Flashcards**: makes a deck from the text and saves it to your Cards tab
- **🎯 Quiz me**: interactive multiple-choice practice with explanations and a score
- **📊 Stats** (free, offline): words, characters, sentences, reading and speaking time, readability score, grade level, long sentences, passive voice and overused words
- Follow-up questions, 🔊 read aloud, copy, stop and a wider view
- Right-click selected text on **any** website → StudyPilot → pick a tool

### 🎨 Look & feel
- Light, dark or system theme, 6 accent colors, and a left or right sidebar
- Keyboard shortcuts everywhere (see below)
- Export or import a backup (your API key is never included) and reset everything

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Alt+Shift+P` | Open the dashboard |
| `Alt+Shift+S` | Toggle the study sidebar |
| `1`–`5` | Switch popup tabs |
| `/` · `N` · `R` · `T` | Search · new task · sync · theme |
| `Ctrl+Enter` | Run the selected sidebar tool |
| `Space`, `1` `2` `3` | Flip and grade flashcards |

Change shortcuts at `chrome://extensions/shortcuts`.

## Google Docs tip

Google Docs draws text on a canvas, so extensions can't read what you highlight there. In Docs, **copy** the text (Ctrl+C) and click **📋 Paste** in the sidebar (or press Ctrl+V in the box). On Classroom and other sites, highlighting works directly.

## Privacy

- Everything (tasks, cards, stats, settings, your API key) is stored only in `chrome.storage.local` on your computer.
- Google Classroom access is **read-only**.
- Text you run through an AI tool is sent only to Anthropic's API, from the extension's background worker. Web pages never see your key.

## Files

```
study-extension/
├── manifest.json        Manifest V3 config
├── background.js        Service worker: sync, reminders, badge, focus timer, menus, AI streaming
├── popup.html/.css/.js  Dashboard · Plan · Focus · Cards · Settings
├── content.js           Floating Study Assistant sidebar (Shadow DOM, so it won't clash with page styles)
├── lib/store.js         Storage, urgency sorting, planner, spaced repetition
├── lib/classroom.js     Google Classroom API client
├── lib/ai.js            Claude prompts and streaming
├── lib/md.js            Safe Markdown renderer
├── icons/               Logo (SVG + PNG sizes)
├── vendor/anthropic.js  Bundled official Anthropic SDK
└── scripts/bundle-sdk.sh  Rebuilds the SDK bundle
```

## Credits

**StudyPilot** was created by **Abdullah Masoud**.
AI by Claude (Anthropic). Assignments from the Google Classroom API.
