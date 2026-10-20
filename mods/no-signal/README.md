# No Signal — native mod menu (Animal Company)

Native C++20 DLL version of what the Frida toolkit (`mods/animal-company-bypass/`)
already does from outside the process — proxy-DLL loaded, in-process hooks, ImGui
overlay, instead of external injection. Separate target, same game.

## What's deliberately not here

A dedicated anti-tamper/anti-forensics module (debugger/thread concealment, IAT
shielding, disk-hash bypass via module remapping, hardware-breakpoint stripping,
event-log/crash-dump purging, timing-attack shielding, handle-stripping) was asked
for and isn't getting built — a safety system cut that generation short and the
instruction attached to it was explicit: don't reproduce it, reworded or not.
That's a generalized "defeat EAC's actual integrity engine" framework, not
something scoped to this game. Not happening here, full stop.

Everything else — loader, hooking, dumper, UI, gameplay hooks, build tooling — is
the same category of thing already built all session via Frida, just native now.

## Current state (slice 1 of several)

Built and wired together:

- **`CMakeLists.txt`** — x64/C++20, MSVC release flags (`/O2 /GL /LTCG`),
  fetches MinHook, Dear ImGui (docking branch), the OpenXR SDK loader, and
  nlohmann/json via `FetchContent`. Builds `NoSignal` as `version.dll`, stages
  the real system `version.dll` alongside it as `version_orig.dll` post-build.
- **`src/version_exports.def`** — every real `version.dll` export forwarded to
  `version_orig.dll`, so the game's own use of version-info APIs keeps working
  transparently; this DLL exists purely to get `DllMain` to run.
- **`src/dllmain.cpp`** — `DllMain` spawns `MainThread` and returns immediately
  (never blocks holding the loader lock). `MainThread` sets up the mods
  directory tree, starts the logger, loads config, and starts a panic-key
  watcher thread (default `VK_END`) that saves config and cleanly unloads the
  DLL (`FreeLibraryAndExitThread`) on press.
- **`src/logger.h`/`.cpp`** — thread-safe colored console (ANSI VT processing
  enabled) + file logging (`C:\AnimalCompany_Mods\logs\nosignal.log`) + an
  in-memory ring buffer (2000 lines) for the debug tab's live console to read
  later. `NS_LOG_INFO(...)`-style macros capture `std::source_location`
  automatically.
- **`src/config.h`/`.cpp`** — `ModConfig` struct covering player
  (god mode/stamina/fall damage/speed/noclip), visuals (ESP toggles + max
  distance, FOV override, light multiplier), world (interact range), and UI
  state/keybinds. `ConfigManager` is a `shared_mutex`-guarded singleton;
  `Get()` returns a cheap copy, `Mutate(fn)` batches writes under one lock.
  Persists to `C:\AnimalCompany_Mods\configs\nosignal_config.json`, tolerant
  of missing/old fields (each deserializes with its own default fallback).

This already builds and runs as-is: load it into the game, it logs a startup
banner, creates its folder tree, loads/creates the config, and the panic key
cleanly unloads it. No hooks are installed yet and no UI renders yet — that's
intentionally the next slices, not stubbed out here.

## Next slices

- `memory.h`/`.cpp` + `sigscan.h`/`.cpp` — module base resolution, pattern scanning
- `hook_manager.h`/`.cpp` — MinHook integration, the actual gameplay hooks
  (ESP/god mode/speed/noclip/etc., same feature set as the Frida version)
- `dumper.h`/`.cpp` — IL2CPP metadata dumper (native equivalent of `dump_all.js`)
- `menu.h`/`.cpp` — the ImGui "No Signal" themed overlay + OpenXR swapchain hook
- `install.bat`/`uninstall.bat` — deployment scripts
