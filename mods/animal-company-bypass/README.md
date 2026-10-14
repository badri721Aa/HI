# Animal Company — EAC bypass toolkit

Frida + frida-il2cpp-bridge toolkit for Animal Company (Unity/IL2CPP, Easy Anti-Cheat
via `EACLauncher.exe`). Process injection via Frida against the live `GameAssembly.dll`
— not a compiled mod DLL, this game is IL2CPP and EAC supervises the launcher.

## Main tool: `anicomp.py`

Single script, one run, no stale static tables:

1. UAC-elevates, installs `frida`/`frida-tools`/`psutil`/`requests` if missing.
2. `frida.spawn()`s `AnimalCompany.exe` suspended — skipping Steam's "Play" button
   and `EACLauncher.exe` entirely means EAC's anti-tamper driver (which only loads
   via the real launcher) never starts.
3. Injects `symbols_dump.js` into the *suspended* process, then resumes it so
   `GameAssembly.dll` actually loads and the live PE export table can be read.
   Every `il2cpp_*` canonical name is re-resolved from the exports table on *this*
   run — the obfuscated names rotate every game build, so nothing here is ever
   stale by construction.
4. Splices that freshly-resolved symbol map directly into one combined script
   (`ac_bridge.js` + fresh symbols + `bypass.js` + `quest.js`) and injects it into
   the same already-running, already-frida-resident process. `bridge_dump.js` runs
   the same way, best-effort, for archival.
5. Optionally POSTs the fresh symbol dump + bridge dump + a summary to a Discord
   webhook (`DISCORD_WEBHOOK_URL` — paste yours in, empty = skipped).

`bypass.js` hooks `AnimalCompany.EACClientManager` to report a passed EAC handshake
(`SetPhase`/`HasFinished`/`IsClientValidated`/`DidFailUnprotected`/`DecodePhase`).
`quest.js` hooks `AppUtils.CalculatePhotonAppVersion` to force the Quest platform id
for cross-platform Photon matchmaking.

Requires Steam running and logged in (for the DRM ticket check) — it doesn't need
the Steam library's Play button, just launches the exe directly.

## `repair.py`

If an earlier rename-based attempt left `AnimalCompany.exe`/`_Data` or
`EACLauncher.exe`/`_Data` under the wrong name, this scans the actual current state
and renames things back — never deletes, reports instead of guessing on anything
ambiguous. Run this before `anicomp.py` if Unity complains a `_Data` folder is
missing next to the exe.

## `dump_all.py` / `dump_all.js`

Separate, larger tool: full IL2CPP metadata dump (every class/field/method/offset/
RVA in the game, legacy decompiled-C# shape) plus opt-in live-state/scene/asset/
item-database dumps. `build_combined.py` bundles `ac_bridge.js` + `dump_all.js` into
one script (`combined.min.js`, kept under ~218KB) since `dump_all.js` needs `Il2Cpp`
from `ac_bridge.js` loaded first. Not superseded by `anicomp.py` — different job
(dumping the game's internals vs. getting the bypass running).

## What's not here anymore

`bypass.py`/`bypass_dump.py`/`bypass_direct.py` (the rename-based and
attach-after-launch approaches — superseded, `anicomp.py` does both better),
`regen_symbols.py` (superseded — `anicomp.py` does this inline every run),
`regenerate.py` (the offline UnityPlayer.dll-bootstrap approach — needs per-build
offsets re-found in IDA anyway, no more robust than just running `anicomp.py` live),
`current_sym.json`/`symbols.js` (static snapshots — `anicomp.py` never reads a
stale file, it resolves fresh in-memory every run).

`stash_dump3.js` and the `vtm menu` project were never uploaded — send those if you
want them folded in here.
