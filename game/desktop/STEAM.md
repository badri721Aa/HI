# Putting Deep Waters on Steam

The code side is ready: `desktop/` wraps the game in Electron and hooks up Steam through [steamworks.js](https://github.com/ceifa/steamworks.js). That covers the player's Steam name, the Steam overlay and achievements. The rest is paperwork, and Valve's rules say **you** have to do it.

## 1. Test the desktop build locally

```bash
cd game/desktop
npm install
npm start        # opens the game in a desktop window
```

With the Steam client running, `steam_appid.txt` = `480` (Valve's public "Spacewar" test app) lets you test the Steam overlay before you have your own App ID.

## 2. Get a Steamworks account and App ID

1. Sign up at https://partner.steamgames.com. You'll need identity, bank and tax info.
2. Pay the **Steam Direct fee: $100 USD per game**. It's recouped after $1,000 in sales.
3. You get an **App ID**. Put it in `desktop/steam_appid.txt`.
4. There's a waiting period of about 30 days between paying and being allowed to release.

## 3. Content survey (important for this game)

The game has **blood and gore**. Fill out the **Mature Content Survey** honestly (violence/gore). The gore toggle in Settings (Off / Normal / EXTREME) is worth mentioning on the store page.

## 4. Achievements

In Steamworks → *Stats & Achievements*, create achievements using these **API names** (uppercase). The game already unlocks them:

```
FIRST_CATCH CATCH_10 CATCH_100 CATCH_1000 DEX_25 DEX_100 DEX_500 DEX_ALL RARE LEGENDARY MYTHIC
TREASURE KILL_1 KILL_100 KILL_1000 BOSS_1 BOSS_ALL LEVIATHAN RICH_10K RICH_1M DREAD TRIDENT
SINK PVP CRABBER EXPLORER
```

## 5. Multiplayer server for Steam players

1. Host `game/server` somewhere public (see the main README: VPS, Docker, Fly.io…) with HTTPS, so the URL is `wss://…`.
2. Put that URL in `desktop/config.json` → `"server": "wss://your-domain/ws"`.
3. **Recommended before launch:** add Steam auth tickets. In the client, call `steam.auth.getSessionTicket()` and send it in the `hello` message. On the server, verify it with the Web API `ISteamUserAuth/AuthenticateUserTicket` using your publisher key, then key profiles by SteamID instead of the random token. This proves the player owns the game and lets bans stick.

## 6. Build and upload

```bash
cd game/desktop
npm run dist          # → dist/win-unpacked, dist/linux-unpacked
```

1. Create **depots** (Windows, Linux) in Steamworks.
2. Fill in the IDs in `desktop/steam/app_build.vdf`.
3. Upload with **SteamCMD**: `steamcmd +login <builder_account> +run_app_build <abs path>/app_build.vdf +quit`
4. Set the build live on a beta branch, test it through Steam, then on default.

## 7. Store page and review

- You need a capsule image, a header image, at least 5 screenshots, a trailer (recommended), a description and tags (Fishing, Shooter, Gore, Multiplayer, Co-op, PvP).
- Valve reviews both the store page and the build. Each review takes a few business days.
- The store page must be public for **at least 2 weeks** before release. That's a good time to collect wishlists.

## Checklist

- [ ] Steamworks account and $100 fee paid
- [ ] App ID in `steam_appid.txt`
- [ ] Mature content survey (gore)
- [ ] Achievements created with the API names above
- [ ] Public game server with `wss://` + `config.json`
- [ ] Steam auth tickets on the server
- [ ] Depots and `app_build.vdf` filled in, build uploaded with SteamCMD
- [ ] Store assets and page submitted for review
- [ ] 2+ weeks "Coming Soon", then release 🚢
