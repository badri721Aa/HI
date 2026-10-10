# WhatsApp Group Bot

A bot for your WhatsApp group, built on [Baileys](https://github.com/WhiskeySockets/Baileys).
It logs in as a **linked device** (like WhatsApp Web) on a phone number you choose.

> ⚠️ Baileys is unofficial. Use a **spare number** for the bot, not your personal one:
> WhatsApp can ban numbers that act like spam bots.

## Setup

Requires Node.js 22+.

```bash
cd whatsapp-bot
npm install
cp .env.example .env   # optional: edit settings
npm start
```

On first run a QR code is shown in the terminal. On the bot's phone open
**WhatsApp → Linked devices → Link a device** and scan it.
(Or set `PHONE_NUMBER` in `.env` to get an 8-character pairing code instead.)

The login is saved in `auth/`, so later starts connect automatically.
Delete `auth/` to log in with a different number.

Then **add the bot's number to your group** and make it a **group admin**
(needed for kick, promote/demote, lock/unlock and anti-link).

## Commands

| Command | Who | What it does |
|---|---|---|
| `!help` | everyone | List commands |
| `!ping` | everyone | Check the bot is alive |
| `!rules` | everyone | Show the group rules (`GROUP_RULES`) |
| `!info` | everyone | Group name, member and admin count |
| `!id` | everyone | Show this group's ID |
| `!tagall [message]` | admins | Mention every member |
| `!kick @user` | admins | Remove members (mention or reply to their message) |
| `!promote @user` / `!demote @user` | admins | Change admin status |
| `!lock` / `!unlock` | admins | Admins-only messaging on/off |

Plus automatic welcome/goodbye messages and optional link blocking.

## Settings (`.env`)

| Variable | Default | |
|---|---|---|
| `PREFIX` | `!` | Command prefix |
| `PHONE_NUMBER` | — | Log in by pairing code instead of QR (digits only, with country code) |
| `ALLOWED_GROUPS` | all groups | Comma-separated group IDs to respond in (get one with `!id`) |
| `WELCOME` | `on` | Welcome/goodbye messages |
| `ANTI_LINK` | `off` | Delete links from non-admins |
| `GROUP_RULES` | sample rules | Text for `!rules` |

## Adding a command

Add an entry to `src/commands.js`:

```js
hello: {
  description: 'Say hi',
  run: ({ reply, args }) => reply(`Hi ${args.join(' ') || 'there'}!`),
},
```

## Keeping it running 24/7

The bot needs an always-on process (it can't run on Vercel/serverless).
Options: a cheap VPS, a Raspberry Pi, or a host like Railway/Render/Fly.io with a
persistent disk for `auth/`. On a VPS, [pm2](https://pm2.keymetrics.io/) keeps it alive:

```bash
npm i -g pm2
pm2 start npm --name wa-bot -- start
pm2 save && pm2 startup
```
