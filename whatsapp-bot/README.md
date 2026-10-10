# WhatsApp Group Bot

A bot for your WhatsApp group with **284 commands** and **14 automatic features** —
moderation, games, an economy, stickers, polls, reminders, text tools, calculators,
converters and more. Full list: **[COMMANDS.md](COMMANDS.md)**.

Built on [Baileys](https://github.com/WhiskeySockets/Baileys): it links to a WhatsApp
account as a **linked device**, the same way WhatsApp Web does.

## Using your own number (no new SIM)

Every WhatsApp account needs a phone number, but **the bot can use the number you already
have**. Link it to your own WhatsApp exactly like WhatsApp Web. Your phone keeps working
normally; the bot just runs alongside as another linked device.

What that means in practice:

- The bot's replies are sent **from your account**: people see your name and photo.
- **Commands you type yourself also work.** In `self` mode, only you can use the bot.
- Set `ALLOWED_GROUPS` so the bot only acts in the groups you choose, not all your chats.

> ⚠️ **Ban risk:** Baileys is unofficial. WhatsApp can ban numbers that behave like spam
> bots. Keep it to your own groups, don't mass-message, and don't add strangers.
> If losing your personal number would be a big problem, link a spare number instead.
> (You can also link a home landline or an old SIM — WhatsApp can verify by voice call.)

## Setup

You need **Node.js 22 or newer** on a computer or server that stays on.

```bash
cd whatsapp-bot
npm install
cp .env.example .env    # then edit .env (optional)
npm start
```

On first start a **QR code** appears in the terminal. On your phone open
**WhatsApp → Settings → Linked devices → Link a device** and scan it.
Prefer a code? Set `PHONE_NUMBER` in `.env`, restart, then choose
**Link with phone number instead** on your phone and type the 8-character code.

The login is saved in `auth/`, so later starts connect automatically.
Delete `auth/` to unlink and start over.

Finally, in your group: make sure the linked number is a **group admin**
(needed for kick, mute, anti-link, etc.). Then type `!help`.

## Quick tour

| Try | What happens |
|---|---|
| `!help` / `!menu` | Command categories / everything |
| `!tagall Meeting at 8` | Mentions every member |
| `!poll Dinner? \| Pizza \| Sushi` | Native WhatsApp poll |
| `!sticker` (as caption or reply to an image) | Makes a sticker |
| `!trivia`, `!hangman`, `!ttt @friend` | Games — answer by just typing |
| `!daily`, `!work`, `!slots 100` | Earn and gamble virtual coins |
| `!remind 30m call mom` | Reminder in the group |
| `!warn @user spam` | Warning; auto-removal at the limit |
| `!antilink on`, `!welcome on` | Per-group moderation switches |
| `!mode self` | Only you can use the bot |

## Settings (`.env`)

| Variable | Default | |
|---|---|---|
| `PHONE_NUMBER` | — | Link by pairing code instead of QR (digits, with country code) |
| `BOT_MODE` | `public` | `public` = everyone, `self` = only you |
| `OWNER_NUMBERS` | — | Extra owners, comma-separated |
| `PREFIX` | `!` | Command prefix (also changeable with `!setprefix`) |
| `ALLOWED_GROUPS` | all groups | Group IDs to work in (get one with `!id`) |
| `ALLOW_DMS` | `off` | Let anyone use commands in private chat |
| `WELCOME` / `ANTI_LINK` | `on` / `off` | Defaults for new groups |
| `GROUP_RULES` | sample rules | Default text for `!rules` |

Group data (warnings, XP, coins, notes, reminders) is stored in `data/db.json`.
Owners can download a copy with `!backup`.

## Keeping it running 24/7

It needs a machine that stays on (it can't run on Vercel/serverless): an old laptop,
a Raspberry Pi, or a small VPS. [pm2](https://pm2.keymetrics.io/) restarts it if it crashes:

```bash
npm i -g pm2
pm2 start npm --name wa-bot -- start
pm2 save && pm2 startup
```

## For developers

- `npm test` runs every command through the real handler against a fake WhatsApp connection.
- `npm run docs` regenerates `COMMANDS.md`.
- Add a command by adding an object to any file in `src/commands/`:

```js
{
  name: 'hello',
  desc: 'Say hi',
  usage: '[name]',
  run: ({ reply, text }) => reply(`Hi ${text || 'there'}!`),
}
```

Flags: `admin: true` (group admins), `owner: true`, `botAdmin: true`, `groupOnly: true`.

Web lookups (`!weather`, `!wiki`, `!translate`, …) use free public APIs and need internet
access on the bot's machine.
