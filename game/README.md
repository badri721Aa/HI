# 🌊 Deep Waters

A top-down ocean game with fishing, guns, gore and bosses. You can play it solo or online with up to 10 players per lobby. The game runs in any browser, and there's a desktop build you can ship on Steam.

## What's in it

| | |
|---|---|
| **1,219 species** | Fish, sharks, eels, rays, crabs, lobsters, shrimp, squid, octopus, jellies, starfish and urchins, plus 15 treasures. Each species is drawn from its own "genes" (colors, shape, pattern, glow). Some only bite at **night** or during **storms**. |
| **7 biomes** | Harbor Shallows → Coral Reef → Kelp Forest → Open Ocean → Frozen Sea / Volcanic Vents / Abyssal Trench. The farther from the harbor you go, the rarer, more valuable and more dangerous things get. |
| **Fishing** | Cast at the cursor, wait for the **!**, hook it, then reel while you manage line tension. Fish thrash and run. There are 10 rods (range, reel power, line strength, luck) and 7 baits. |
| **15 bosses** | Big Mama Crab, Megalodon, Moby Grim, Kraken, and at the end the LEVIATHAN. Their attacks include charges, spike sprays, novas, ground slams, whirlpools, chain lightning and summoned minions. Bosses have 3 enrage phases and scale with player count. You summon them with Boss Chum, and they also surface on their own as world events. |
| **Guns** | Pistol, SMG, shotgun, harpoon gun (pulls prey toward you), marksman rifle (pierces), flamethrower, minigun (spins up), rocket launcher (splash damage and knockback) and railgun. They use 7 ammo types. |
| **Gore** | Blood sprays, gibs with bone chunks that spin and sink, and blood pools that spread on the water. There are 3 gore levels (Off / Normal / EXTREME). |
| **Physics** | Boats have momentum, keel drag and rudder steering. There's recoil, knockback, ramming damage and island collisions. Wind and storm currents push boats, crates and monsters around. |
| **Hostile sea life** | 14 creature types with different behavior: chasers, swarms, stinging jellies, and ranged ink or zap attackers. |
| **Economy** | Sell fish at the harbor. A market changes prices every 3 minutes. You can buy 6 boats, 9 guns, 10 rods, bait and ammo, plus 4 upgrade tracks. There are also crab pots, bounties and repairs. If you sink, your cargo floats in a wreck that anyone can salvage. |
| **World** | Day/night cycle with lighting, and weather (rain, fog, storms with lightning strikes). Also a minimap, a big map, an animated bestiary, 26 achievements, a journal and a scoreboard. |
| **Sound** | Every sound effect is synthesized in code: guns, explosions, splashes, reel clicks, gore squelches, boss roars, thunder and ambience. There's also generative music that gets darker at night and turns to drums in boss fights. No audio files are needed. |
| **Multiplayer** | **Public** lobbies (listed), **private** lobbies (listed, password-protected) and **invite-only** lobbies (hidden, joined with single-use invite codes). Max 10 players per lobby. You can choose co-op or PvP. The host can kick players, and there's chat. |
| **Anti-cheat** | The server is authoritative, and there are more layers on top. See below. |

## Run it

```bash
cd game
npm install
npm start            # → http://localhost:8080
```

Open the URL to play solo or online. Other people on your network can join at `http://YOUR-IP:8080`.

Tests:

```bash
npm test             # simulation + multiplayer/anti-cheat integration tests
```

## Controls

| Key | Action |
|---|---|
| **W A S D** | Sail |
| **Mouse / Left click** | Aim / shoot |
| **Right click / F / Space** | Cast · hook · hold to reel |
| **1–9** | Weapons |
| **Q / R** | Cycle bait / rod |
| **E** | Shop (at harbor) |
| **T** | Drop / haul crab pot |
| **H** | Hull patch |
| **B / J / M** | Bestiary / Journal / Map |
| **Tab / Enter** | Scoreboard / Chat |
| **Esc** | Menu, invites, kick |

## Anti-cheat: how it works

1. **The server runs the whole game.** Clients only send button states ("W is held", "aiming at 1.2 rad") and requests ("cast here", "buy the carbon rod"). Money, inventory, catches, damage, fire rate, movement and loot rolls are all computed on the server. Editing values in devtools does nothing (this is covered by a test).
2. **Every request is validated.** Messages are checked against a strict schema, and unknown or malformed ones count as strikes. Buying and selling only work at the dock. Prices, ownership and cooldowns are checked server-side.
3. **Flood protection.** Each connection has a token bucket. Actions and chat are rate-limited, and repeated messages get you auto-muted. Too many strikes gets you kicked, and 3 kicks gets your IP banned temporarily.
4. **One live session per profile.** Logging in twice kicks the older session after saving it. This stops item and money duplication.
5. **Audits.** Every few seconds the server checks for impossible movement speed, impossible earning rates and invalid state. Anything flagged is rolled back and gets a strike.
6. **Connection caps.** There are per-IP connection limits, a global cap and a 4 KB message size limit.
7. **Solo is sandboxed.** Single-player saves are local and never touch online profiles.

For a Steam release you'd add **Steam auth tickets** (the server verifies the player really owns the game) and optionally **Steam bans**. See `desktop/STEAM.md`.

## Hosting a public server

The server is one Node process that serves the game and the WebSocket on the same port.

- **Any VPS** (DigitalOcean, Hetzner, AWS Lightsail…): `npm install && PORT=8080 npm start`. Put it behind Caddy or nginx for HTTPS/WSS.
- **Docker**: `docker build -t deep-waters . && docker run -p 8080:8080 -v dw-data:/data deep-waters`
- **Fly.io / Render / Railway**: deploy the Dockerfile. These hosts support long-lived WebSockets.

> ⚠️ Vercel/Netlify serverless **can't** host the multiplayer server (no persistent WebSockets). You can still host the *client* there and point it at your game server.

Player profiles are saved to `server/data/profiles.json` (or `$DATA_DIR`) every 30 seconds and on shutdown.

Environment variables: `PORT`, `DATA_DIR`, `MAX_CONN_PER_IP`.

## Project layout

```
game/
  shared/data.js    species generator, biomes, rods, boats, guns, bosses, achievements
  shared/sim.js     authoritative simulation (physics, fishing, AI, bosses, economy)
  server/server.js  HTTP + WebSocket server, lobbies, persistence
  server/anticheat.js
  client/           index.html, main.js (loop/net/HUD), render.js (procedural art + gore), ui.js, audio.js
  desktop/          Electron + Steamworks wrapper and the Steam release guide
  test/             headless tests
```
