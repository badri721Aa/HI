# Apex Anglers: Shattered Waters — Unreal Engine 5 project

This is milestone **M0 "Prototype"** from the [Game Design Document](../docs/apex-anglers/GDD.md). The goal of M0 is to prove the core feel: **cast → hook → a physical tug-of-war with a fish → the fish drags your boat around**, playable online with up to 4 players.

## What's in M0

| Feature | Where | GDD |
|---|---|---|
| Physics fishing: tension, rod flex, drag clutch, friction heat, line snap | `Public/Sim/ReelModel.h` | §6 |
| Fish that fight back (run, dive, circle, breach, headshake, stamina) | `Public/Sim/FishAgent.h`, `FishFight.h` | §7 |
| XPBD rope that redraws the line on every machine from 2 replicated points | `Public/Sim/RopeSolver.h` | §8 |
| Server-authoritative rod: clients only send intents, server rolls everything | `Fishing/FishingRodComponent` | §8, §41 |
| 5-ton boat: per-pontoon buoyancy, keel drag, prop + rudder, helm | `Boats/ApexBoat`, `Boats/HullBuoyancyComponent` | §21–22 |
| Hooked fish physically drag the boat (Newton's 3rd law) | `FishingRodComponent::TickServer` | §10 |
| Analytic ocean shared by server and clients (no water replication) | `World/ApexOceanSubsystem`, `Sim/WaveField.h` | §5 |
| 1–4 player listen server, crew spawns on the boat | `Game/ApexGameMode` | §41 |
| Controls built in C++ (keyboard, mouse and gamepad) — no editor assets needed | `Player/AnglerCharacter` | — |

### Architecture: "sim core + thin Unreal shell"

```
Source/ApexAnglers/
  Public/Sim/        ← pure C++20, NO Unreal includes. Deterministic, unit tested.
    ApexMath.h  SeededRng.h  WaveField.h  ReelModel.h  FishAgent.h  FishFight.h  RopeSolver.h  HullModel.h
    ApexUnreal.h     ← the only bridge (cm ↔ m, N ↔ Unreal force units)
  Public|Private/
    World/   Fishing/   Boats/   Player/   Game/     ← Unreal actors/components that call the sim core
Tests/SimTests.cpp   ← 18 tests for the sim core, run without Unreal
```

All gameplay math lives in the sim core, so it can be tested in seconds, runs identically on server and clients, and replays exactly from a seed (for anti-cheat audits, GDD §41).

## Setup (Windows)

1. Install **Unreal Engine 5.6** from the Epic Games Launcher (5.5 works too: right-click the `.uproject` → *Switch Unreal Engine version*).
2. Install **Visual Studio 2022** with the workloads **"Game development with C++"** and **".NET desktop development"**, plus a Windows 10/11 SDK. In the installer, also tick *Unreal Engine installer* under the Game dev workload.
3. Install Git LFS once: `git lfs install`.
4. Right-click `ApexAnglers.uproject` → **Generate Visual Studio project files**.
5. Double-click `ApexAnglers.uproject`. When it asks to rebuild the missing `ApexAnglers` module, click **Yes**. (Or open `ApexAnglers.sln`, pick *Development Editor / Win64*, and press F5.)

> If the build fails, open the `.sln` in Visual Studio, build there, and read the first error in the Output window. It's usually a missing SDK component.

### Create the ocean map (one time, about 1 minute)

The project ships only code. Unreal maps are binary, so you create the first one in the editor:

1. **File → New Level → Basic**.
2. In the Outliner, **delete `Floor`** (the boat needs open water).
3. Optional: add an **Exponential Height Fog** for a nicer horizon.
4. **File → Save Current Level As…** → `Content/Maps/L_Ocean`. The config already makes this the default map.
5. The game mode is set globally to `ApexGameMode`, so nothing else is needed.

### Play

- **Solo:** press **Play**.
- **Co-op test:** Play dropdown → *Number of Players: 2–4*, *Net Mode: Play As Listen Server*.

| Input | Keyboard & mouse | Gamepad |
|---|---|---|
| Move | WASD | Left stick |
| Look | Mouse | Right stick |
| Jump | Space | A / Cross |
| Cast | Hold & release **LMB** (longer = further) | LT |
| Set hook / reel | Hold **RMB** | RT |
| Line drag setting | Mouse wheel | — |
| Take / leave the helm (then WASD steers the boat) | E (near the cabin) | X / Square |

**How to catch a fish:** cast, wait for **BITE!**, then hold RMB to set the hook. Keep reeling, but **release when TENSION goes red** or when the fish runs. The line will snap otherwise. Lower the drag (mouse wheel) to let big fish run. Rare fish (the "Hadal Leviathan Fry") are strong enough to tow the whole boat.

## Tests (no Unreal needed)

```bash
./Tests/run_tests.sh              # uses c++ (g++ or clang++), -Wall -Wextra -Werror
CXX=clang++ ./Tests/run_tests.sh
```

These cover RNG determinism, wave bounds, Hooke's law with rod flex, the drag clutch, the snap grace window, rod shock absorption, heat weakening the line, a full fish fight (win, snap, determinism, force direction), rope sag and length, Archimedes flotation depth, and the GDD §10 leviathan tow speed.

## Known M0 limitations (planned for M1)

- The line and HUD are drawn with debug drawing (not in Shipping builds). M1 moves to a spline-mesh or Niagara ribbon plus a Common UI HUD.
- The sea is a moving tile grid that matches the physics exactly. M1 replaces it with a **Water plugin** ocean tuned to the same waves.
- Placeholder shapes for the characters, boat and fish.
- Fish species are hard-coded in `FishingRodComponent.cpp`. M1 moves them into DataAssets.
- The "Perfect Cast" rhythm (§9), wrestling (§12), and the tile-grid raft (§21) are next.

## Roadmap

| Milestone | Scope |
|---|---|
| **M0 (this)** | Rope + reel + fish fight, boat buoyancy, helm, 4-player listen server |
| M1 | Water plugin ocean, Perfect Cast rhythm, Walker fish + wrestling (GAS), harvesting, DataAssets, Common UI |
| M2 | Tile-grid raft + flooding, economy, weather, tides, first boss (Iron-Jaw Megalodon) |
| M3 | Dedicated servers + EOS lobbies, Easy Anti-Cheat, Eternal Trench v1 |
