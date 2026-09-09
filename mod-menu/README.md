# nosignal mod menu — Animal Company

A Python/Tkinter GUI that drives a Frida agent injected into Animal
Company, giving you toggles instead of one-off scripts.

**Offline or private solo sessions only.** Don't attach this to a public
multiplayer lobby — it breaks the game for other players, can trigger
anti-cheat bans, and violates the game's terms of service. This is a
sandbox for learning how the pieces fit together, not a way to gain an
edge over anyone else.

Full walkthrough: [/tutorials/animal-company-mod-menu](https://nosignal.solar/tutorials/animal-company-mod-menu)

## Files

- `agent.js` — the Frida agent. Hooks a couple of gameplay functions and
  exposes `rpc.exports` (`setGodMode`, `setNoclip`, `setSpeed`) so the
  Python side can toggle them live.
- `menu.py` — the GUI. Attaches to the game, loads `agent.js`, and calls
  those RPC exports from checkboxes/sliders.

## Before you run it

The export names and memory offsets in `agent.js` are **placeholders** —
IL2CPP export names and field offsets are specific to one exact game
build and won't work as shipped. Fill them in yourself:

1. Dump your build's exports with Il2CppInspector/dnSpy —
   see [/tutorials/animal-company-getting-started](https://nosignal.solar/tutorials/animal-company-getting-started).
2. Find the field offsets you want (speed, a noclip flag, etc.) with
   Cheat Engine — see [/tutorials/cheat-engine-frida](https://nosignal.solar/tutorials/cheat-engine-frida).
3. Replace every `// TODO` in `agent.js` with what you found.
4. Re-dump after every game update — the hex suffix on IL2CPP exports
   changes between builds.

## Running it

```bash
pip install frida frida-tools
# Launch Animal Company first (offline / private solo mode), then:
python menu.py
```
