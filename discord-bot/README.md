# 🤖 Mega Discord Bot

An all-in-one Discord bot with **<!--total-->1,423<!--/total--> commands** (plus unlimited custom commands per server), built on discord.js v14.

- 🛡️ Moderation, automod, anti-raid and anti-nuke
- 💰 Economy, 🎰 gambling, 📈 leveling, 💞 profiles and marriage
- 🎮 Games, 😂 fun, 🤗 40 anime roleplay actions, 🐾 animals
- 🎫 Tickets, 🎉 giveaways, 📊 polls, 🏘️ welcome, reaction roles, starboard, suggestions…
- 🎵 **24/7 voice**: stays in a voice channel forever, rejoins after disconnects and restarts, plays internet radio
- 🕶️ **Hidden mode**: runs as *invisible* so it sits in the collapsed "Offline" part of the member list
- 🤝 **Up to 30 different bots from one program**: each with its own name, prefix and feature set
- ♾️ **Built to run forever**: auto-reconnect, crash protection, a watchdog, and a keep-alive web server
- 🌟 `!bots`: a directory of **30 Discord-verified bots**, each for a different job, with invite links

> Every command works both as a prefix command (`!help`) and through slash commands: the most important ones have their own `/command`, and **`/cmd <name>` runs any of the <!--total-->1,423<!--/total-->**. Discord allows only 100 slash commands per bot, which is why `/cmd` exists.

---

## ⚠️ What Discord does and doesn't allow

| You asked for | What this bot does | Why |
|---|---|---|
| "30 **verified** bots" | Run up to 30 bots of your own from one program (`bots.json`), and `!bots` lists 30 verified public bots with links. | Only Discord can verify a bot. A bot qualifies once it's in **75+ servers** and its owner completes identity verification in the Developer Portal. It can't be bought or faked. Each of your bots would have to get there on its own. |
| "Adds the best bots" | `!bots` / `!findbot`: 30 verified bots, each for a different job, with one-click links. | A bot **cannot add other bots** to a server. Discord only lets a person with *Manage Server* authorize a bot. |
| "Hidden from the members list" | `BOT_STATUS=invisible` makes the bot look offline. It moves to the collapsed "Offline" section, and in servers over about 1,000 members offline members aren't listed at all. | Discord has no setting that removes a member from the list. Invisible is the closest you can get, and every command still works. |
| "Stay in voice channels" | `!247 on` keeps the bot in voice forever, rejoins after kicks, disconnects and restarts, and resumes the radio station that was playing. | The bot joins **self-deafened**, so it never hears anyone. |
| Music | Internet radio: 33 commercial-free presets, 24 genre shortcuts (`!lofi`, `!jazz`…) and a search of 30,000+ stations. Also plays direct audio links and uploaded audio files. | **YouTube/Spotify/SoundCloud aren't supported.** Streaming them breaks those services' Terms of Service, which is why Rythm and Groovy were shut down. |
| "Run forever" | Auto-reconnect, login retry, crash guards, a watchdog, pm2/Docker configs and a `/health` endpoint. | The program still needs a computer or server that stays on. See [Free hosting](#-free-247-hosting). |

---

## 🚀 Setup (about 10 minutes)

### 1. Create the bot on Discord
1. Go to <https://discord.com/developers/applications> and click **New Application**.
2. **Bot** tab: click **Reset Token** and copy the token. Keep it secret: anyone with it controls your bot.
3. On the same page, turn on **Server Members Intent** and **Message Content Intent**.
   (If you skip this, the bot still runs with slash commands and `@mention` commands.)
4. **OAuth2 → URL Generator**: tick `bot` + `applications.commands`, pick permissions (or *Administrator*), open the URL and add the bot to your server. Once the bot is running, `!invite` gives you this link.

### 2. Run it
You need [Node.js 22.12 or newer](https://nodejs.org).
```bash
cd discord-bot
npm install
cp .env.example .env      # Windows: copy .env.example .env
# open .env and paste your token after DISCORD_TOKEN=
npm start
```
You should see `Logged in as YourBot#1234 — … commands`. In Discord, type `!help` or `/help`.

`ffmpeg` is bundled through `ffmpeg-static`, and voice encryption (Discord's required DAVE/E2EE) is handled by `@snazzah/davey`. Nothing else needs installing.

### 3. Useful first commands
| Command | What it does |
|---|---|
| `!help` | Category menu with all commands |
| `!setprefix ?` | Change the prefix in your server |
| `!radio groovesalad` then `!247 on` | Play radio in your voice channel and stay there 24/7 |
| `!setstatus invisible` | Hide the bot in the member list (owner only) |
| `!bots` | 30 verified bots, each for a different job |
| `!automod`, `!antinuke`, `!setlog` | Protect and log your server |
| `!disable <command or category>` | Turn off anything you don't want |

---

## 🤝 Running 30 different bots at once
1. Create one application per bot in the Developer Portal (step 1 above, repeated).
2. Copy `bots.example.json` to `bots.json`. It already contains **30 profiles, each with a different job**: Guardian (moderation), Sentinel (anti-nuke), Banker (economy), Casino, Arcade, DJ Radio, Lofi Station, Ticketer, Giveaways, Converter, Seeker (web lookups) and more.
3. Put each token in `.env` as `BOT1_TOKEN=…` through `BOT30_TOKEN=…`. A profile without a token is skipped, so start with 2 or 3.
4. `npm start`. `!botteam` shows every bot in the team and what it does.

Each profile sets its own `name`, `prefix`, `status` (e.g. `invisible`), `activity` and `modules` (`"all"` or a list of categories). Two music profiles can play in **two voice channels of the same server** at the same time.

Each bot uses roughly 40–80 MB of RAM, so 30 bots need around 1.5–2.5 GB. That fits on Oracle's free VM (below) but not on 256 MB hosting panels.

---

## 🌍 Free 24/7 hosting

Free plans change often, so check each provider's pricing page before you rely on it. Here's the situation as of late 2026:

| Option | Really 24/7? | Notes |
|---|---|---|
| **Oracle Cloud "Always Free"** ⭐ | ✅ Yes | Best free option: Arm VM with up to 4 cores / 24 GB RAM, enough for all 30 bots. Needs a card for identity checks. Oracle may stop VMs that look *idle* (CPU, network and memory below 20% over 7 days); restart them from the console if that happens. |
| **Google Cloud free tier (e2-micro)** | ✅ Yes | 1 small VM in `us-west1`, `us-central1` or `us-east1` only (other regions are billed), 30 GB disk, 1 GB RAM. Fine for a few bots. Needs a card. |
| **Your own PC, old laptop or Raspberry Pi** | ✅ While it's on | Completely free. Use pm2 (below) so it restarts automatically. |
| **Render (free web service)** | ⚠️ With a pinger | Sleeps after 15 minutes without web traffic. The bot's built-in keep-alive server plus a free uptime monitor (UptimeRobot, Better Stack) pinging `https://your-app.onrender.com/health` every 5 minutes keeps it awake. Data resets on redeploys. |
| **Koyeb (free instance)** | ⚠️ With a pinger | Scales to zero after about an hour without inbound traffic. Use the same `/health` pinger trick. Data resets on redeploys. |
| **Free Discord-bot panels** (e.g. bot-hosting.net) | ⚠️ Mostly | Usually 256 MB RAM (one bot) and you must click "renew" every few days. |
| Replit / Glitch / Heroku / Fly.io | ❌ | Replit's always-on is paid, Glitch ended project hosting in July 2025, Heroku has had no free tier since 2022, and Fly.io has no free tier for new accounts. |

### From Windows only (your PC can be off afterwards)
Windows 10/11 already include `ssh` and `scp`. The only browser step is creating the free server.

These commands are for **PowerShell**, the default Windows terminal (its prompt looks like `PS C:\…>`). In the old CMD, write `%USERPROFILE%` instead of `$HOME`. Keep the quotes: they make paths with spaces work, e.g. a username like `ADVANTI SYSTEMS`.

**1. On your PC: make a login key**
```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\botkey"
```
When it asks for a passphrase, just press **Enter** twice. Then show the public key and copy the line it prints:
```powershell
Get-Content "$HOME\.ssh\botkey.pub"
```

**2. In the browser, once:** sign up at <https://www.oracle.com/cloud/free/>, then go to **Compute → Instances → Create instance**:
- **Image:** Ubuntu.
- **Shape:** `VM.Standard.A1.Flex` (Always Free).
- **SSH keys:** choose *Paste public key* and paste the line from step 1.

Once the server is created, copy its **Public IP address**, e.g. `140.238.12.34`. You'll use it instead of `YOUR_IP` below.

**3. On your PC: upload the bot zip and log in**
Find the zip's exact name: `Get-ChildItem "$HOME\Downloads\*.zip"`. It might be `mega-discord-bot (1).zip`. Upload it, saving it on the server as `bot.zip`:
```powershell
scp -i "$HOME\.ssh\botkey" "$HOME\Downloads\mega-discord-bot.zip" ubuntu@YOUR_IP:bot.zip
ssh -i "$HOME\.ssh\botkey" ubuntu@YOUR_IP
```
The first time, type `yes` when it asks whether to trust the server.

**4. Now you're on the server.** The prompt changes from `PS C:\…>` to something like `ubuntu@instance:~$`. Only now run these, one line at a time:
```bash
sudo apt update
sudo apt install -y unzip curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
unzip bot.zip
cd discord-bot
npm install
cp .env.example .env
nano .env
```
In `nano`, paste your token after `DISCORD_TOKEN=` (right-click pastes), then press **Ctrl+O**, **Enter**, **Ctrl+X**.
```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```
`pm2 startup` prints one line starting with `sudo env PATH=…`. Copy it, run it, then type `exit` to return to your PC.

The bot now runs 24/7 with your PC turned off, restarts itself after crashes, and starts again after server reboots. No ports need opening, because the bot only connects outward to Discord.

**Later, from PowerShell on your PC:**
| What | Command |
|---|---|
| See the logs | `ssh -i "$HOME\.ssh\botkey" ubuntu@YOUR_IP "pm2 logs --lines 50 --nostream"` |
| Restart the bot | `ssh -i "$HOME\.ssh\botkey" ubuntu@YOUR_IP "pm2 restart all"` |
| Install a new zip | Upload it as in step 3, then `ssh -i "$HOME\.ssh\botkey" ubuntu@YOUR_IP "unzip -o bot.zip && cd discord-bot && npm install && pm2 restart all"`. Your `.env` and `data/` folder are kept. |

> Oracle may stop free servers that look idle for 7 days, and a small bot can look idle. Upgrading the account to **Pay As You Go** stops that, and you still pay nothing as long as you stay within the Always Free limits.

### Oracle Cloud / Google Cloud / any Linux VM
```bash
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
git clone <your repo> bot && cd bot/discord-bot
npm install && cp .env.example .env && nano .env      # paste your token(s)
sudo npm install -g pm2
pm2 start ecosystem.config.js     # runs forever and restarts on crashes
pm2 save && pm2 startup           # starts again after the VM reboots (run the command it prints)
pm2 logs                          # watch the logs
```

### Render / Koyeb (Docker or Node)
- Root directory: `discord-bot`. Build command: `npm install`. Start command: `npm start` (or use the included `Dockerfile`).
- Environment variables: `DISCORD_TOKEN` (and anything else from `.env.example`). These hosts set `PORT` for you, which turns on the keep-alive server.
- Point an uptime monitor at `https://<your-app>/health` every 5 minutes.

### Docker
```bash
docker build -t mega-bot .
docker run -d --restart unless-stopped --env-file .env -v $(pwd)/data:/app/data --name mega-bot mega-bot
```

---

## 📚 Commands (<!--total-->1,423<!--/total-->)

<!--table-->
| Category | Commands | Examples |
|---|---:|---|
| 🤖 Core | 24 | `prefix`, `setprefix`, `resetprefix`, `disable`, `enable`, `disabled`, … |
| 🛡️ Moderation | 73 | `warn`, `warnings`, `delwarn`, `clearwarns`, `warnaction`, `modlogs`, … |
| 🚨 Automod & Anti-Nuke | 32 | `antinuke`, `antinukewl`, `antinukelimit`, `antinukepunish`, `antinukewatch`, `antiraid`, … |
| ⚙️ Server Config | 12 | `setmodlog`, `setlog`, `logevents`, `logevent`, `logall`, `logignore`, … |
| 🏘️ Community | 69 | `autorole`, `autoroleadd`, `autorolebot`, `autoroleremove`, `autoroleclear`, `setbirthday`, … |
| 🎫 Tickets | 17 | `ticketsetup`, `ticketpanel`, `ticketrole`, `ticketlog`, `ticketcategory`, `ticketlimit`, … |
| 🎉 Giveaways | 9 | `gstart`, `gstartrole`, `gend`, `greroll`, `gextend`, `gdelete`, … |
| 📊 Polls | 8 | `poll`, `yesnopoll`, `quickpoll`, `endpoll`, `pollresults`, `pollvoters`, … |
| 🧩 Custom Commands | 21 | `aradd`, `arremove`, `arlist`, `artest`, `arclear`, `ccadd`, … |
| 💰 Economy | 48 | `fish`, `hunt`, `mine`, `dig`, `chop`, `farm`, … |
| 🎰 Gambling | 18 | `slots`, `coinbet`, `dicebet`, `roulette`, `wheel`, `scratch`, … |
| 📈 Leveling | 26 | `setxp`, `addxp`, `removexp`, `setlevel`, `resetxp`, `resetlevels`, … |
| 💞 Social | 11 | `profile`, `setbio`, `profilecolor`, `rep`, `replb`, `marry`, … |
| 😂 Fun | 57 | `joke`, `dadjoke`, `programmingjoke`, `knockknock`, `chucknorris`, `meme`, … |
| 🎮 Games | 22 | `connect4`, `hangman`, `minesweeper`, `2048`, `lightsout`, `simon`, … |
| 🤗 Roleplay Actions | 41 | `baka`, `bite`, `blush`, `bored`, `cry`, `cuddle`, … |
| 🐾 Animals | 33 | `cat`, `dog`, `dogbreeds`, `fox`, `duck`, `catfact`, … |
| 🔤 Text Tools | 63 | `charcount`, `wordcount`, `linecount`, `wordfreq`, `letterfreq`, `vowelcount`, … |
| 🅰️ Fancy Fonts | 24 | `bold`, `italic`, `bolditalic`, `script`, `boldscript`, `fraktur`, … |
| 🔐 Encoding & Hashing | 76 | `base64`, `unbase64`, `base64url`, `base32`, `unbase32`, `base58`, … |
| 🧮 Math | 90 | `bmi`, `tip`, `splitbill`, `discount`, `tax`, `compound`, … |
| 📏 Unit Conversions | 418 | `convert`, `units`, `mm2cm`, `mm2m`, `mm2km`, `mm2in`, … |
| 🎲 Generators | 36 | `colorinfo`, `randomcolor`, `hex2rgb`, `rgb2hex`, `hex2hsl`, `hsl2hex`, … |
| 🧰 Utility | 41 | `afk`, `afklist`, `addemoji`, `enlarge`, `deleteemoji`, `renameemoji`, … |
| ℹ️ Info | 33 | `serverinfo`, `servericon`, `serverbanner`, `splash`, `membercount`, `boosters`, … |
| 🔎 Search & Lookups | 35 | `github`, `githubrepo`, `npm`, `pypi`, `crates`, `domain`, … |
| 🪙 Crypto & Currency | 42 | `crypto`, `coininfo`, `cryptotop`, `cryptotrending`, `cryptoconvert`, `feargreed`, … |
| 🎵 Music & 24/7 Voice | 44 | `join`, `leave`, `247`, `play`, `radio`, `radios`, … |
| **Total** | **1,423** | plus 1044 aliases and unlimited custom commands |
<!--/table-->

Browse them in Discord with `!help`, `!help <category>`, `!help <command>` or `!commands`.

**About the count:** about 400 of the commands are unit-conversion shortcuts (`!km2mi`, `!c2f`, `!kg2lb`, … for every pair of units in 10 groups), and about 20 are one-per-algorithm hash commands. They're real and they work, but if you want a tidier list, disable the category with `!disable conversions` and use `!convert 10 km mi`.

---

## 🛠️ For developers
```
discord-bot/
├─ src/index.js            starts every bot profile, retries, watchdog
├─ src/config.js           .env + bots.json
├─ src/core/               framework: command handler, slash, JSON database, voice engine, UI helpers
└─ src/modules/<category>/ commands (one folder per category; files starting with "_" are helpers)
```
- `npm run check` validates every command (duplicate names, slash definitions) and prints counts.
- `npm run smoke -- <category>` runs commands against a fake Discord context (`-- all --verbose` for everything).
- Adding a command: drop a file into `src/modules/<category>/` that exports an array of `{ name, description, usage, examples, execute(ctx) }` (see `src/modules/core/bot.js`).
- Data is stored in `data/db.json` (atomic writes plus a rolling backup). Back up that folder.
