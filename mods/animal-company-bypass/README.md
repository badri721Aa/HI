# Animal Company — EAC bypass + dump toolkit

Frida + frida-il2cpp-bridge toolkit for Animal Company (Unity/IL2CPP, Easy Anti-Cheat
via `EACLauncher.exe`). Replaces the earlier (wrong) BepInEx/Mono scaffold — this game
is IL2CPP, and EAC supervises the launcher, so the real path is process injection via
Frida against the live `GameAssembly.dll`, not a compiled mod DLL dropped into
`BepInEx/plugins`.

## How it fits together

```
bypass.py / bypass_dump.py   — rename AnimalCompany.exe <-> EACLauncher.exe so Steam
                                boots the bare game with EAC parked as *.syte_bak,
                                wait for the process, frida-inject, restore on exit.
  -l ac_bridge.js             — frida-il2cpp-bridge (vendored). Gives JS access to the
                                IL2CPP runtime (classes, fields, methods, GC).
  -l symbols.js               — maps canonical il2cpp_* names to this build's
                                obfuscated GameAssembly.dll export names so ac_bridge.js
                                can find them (the export names are rotated on
                                every build as basic anti-tamper).
  -l bypass.js                — hooks AnimalCompany.EACClientManager to report a
                                passed EAC handshake (SetPhase/HasFinished/
                                IsClientValidated/DidFailUnprotected/DecodePhase).
  -l quest.js                 — hooks AppUtils.CalculatePhotonAppVersion to force
                                the Quest platform id, for cross-platform Photon
                                matchmaking.
  -l dump_all.js               (bypass_dump.py / dump_all.py only) — full IL2CPP
                                metadata dump (classes/fields/methods/offsets/RVAs,
                                legacy decompiled-C# shape) + opt-in live-state/
                                scene/asset/item-database dumps.
```

`build_combined.py` concatenates `ac_bridge.js` + `dump_all.js` into one script
(`combined.min.js`, minified, kept under ~218KB) because the dump needs `Il2Cpp` from
`ac_bridge.js` in the same load and a single bundle avoids per-`-l`-file overhead.
`combined.raw.js` / `combined.min.js` are build output — not checked in, regenerate
with `python build_combined.py` (needs `node` + `npx terser`).

## Regenerating symbols after a game update

The obfuscated export names in `GameAssembly.dll` rotate every build. Two ways to
re-derive the current mapping:

- **Live (game running):** `frida -l symbols_dump.js EACLauncher` — reads the live
  `GameAssembly.dll` PE export table, resolves every canonical `il2cpp_*` name by
  name first and by stable export ordinal as a fallback, and prints/writes a fresh
  `symbols.js`. `bridge_dump.js` is the sibling for `ac_bridge.js`'s
  `Il2Cpp.exports` getter block — same resolution, different output shape.
- **Offline (`regenerate.py`, needs `pip install capstone`):** disassembles
  `UnityPlayer.dll`'s unrolled `GetProcAddress` bootstrap at a fixed RVA, which
  walks every obfuscated name in the same order the canonical list uses — no
  Frida, no running game required. Rewrites `symbols.js` and `ac_bridge.js` in
  place, and anywhere `--menu-dir` points if a separate mod-menu project consumes
  the same files. The bootstrap RVA/call-target constants
  (`BOOT_LO`/`BOOT_HI`/`CALL_TARGET`) are themselves per-build and need re-finding
  in IDA/Ghidra when they drift — that part isn't automatable from here.

## What's in this drop

Everything: `ac_bridge.js`, `bridge_dump.js`, `symbols.js`, `symbols_dump.js`,
`bypass.py`, `bypass_dump.py`, `build_combined.py`, `dump_all.py`, `dump_all.js`,
`current_sym.json`, `quest.js`, `regenerate.py`. `ac_bridge.js`/`bridge_dump.js`/
`symbols.js` are copied byte-for-byte from your original upload (verified: matching
byte counts, valid JS syntax, and `build_combined.py` reproduces a `combined.min.js`
identical in size to your original). Personal machine paths (`C:\Users\elish\...`)
are gone — everything defaults to paths relative to the script or takes a CLI
override instead.

`stash_dump3.js` (referenced by the original `bypass_dump.py`'s hardcoded path) and
the `vtm menu` project `regenerate.py` also wrote to were never uploaded — send
those too if you want them folded in here.
