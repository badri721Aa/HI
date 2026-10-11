# Throttle County — Phase 1: Foundation

**Status: Not run in Studio - written to pass T1.1-T1.14.** I can't run Roblox Studio. Every file was type-checked offline against the current Roblox API definitions with `luau-lsp analyze` in `--!strict` mode, and the checker reported 0 errors and 0 lint warnings.

Re-read: [1]-[45], [451]-[475], [485]

## Workflow

The files here follow the Rojo layout from spec [22], so both workflows produce the same Explorer tree:

- **Pure Studio (default):** create each instance listed in the manifest by hand, then paste the file's contents into it. Drop the suffix from the name: `Main.server.luau` becomes a **Script** named `Main`, `Main.client.luau` becomes a **LocalScript** named `Main`, and every other `.luau` file becomes a **ModuleScript**. A folder that contains `init.luau` (`Net/`, `DataService/`) is a ModuleScript holding `init.luau`'s code, and the other files in that folder become its child ModuleScripts.
- **Rojo (optional):** run `rojo serve default.project.json` and connect the Rojo plugin. Insert ProfileStore by hand in either case.

## File manifest (59 files)

| # | Explorer path | Class | Source file | Purpose |
|---|---|---|---|---|
| 1 of 59 | `ReplicatedStorage/Shared/Config/AssetIds` | ModuleScript | `src/shared/Config/AssetIds.luau` | Config/AssetIds: every image, mesh, animation, badge and texture ID. -- spec [13], [38] Requires: Logger. |
| 2 of 59 | `ReplicatedStorage/Shared/Config/Economy` | ModuleScript | `src/shared/Config/Economy.luau` | Config/Economy: every economy tunable. Services never hold magic numbers. -- spec [38], [341], [459] Requires: none. |
| 3 of 59 | `ReplicatedStorage/Shared/Config/Game` | ModuleScript | `src/shared/Config/Game.luau` | Game: the one place the working title and build version live. -- spec [2], [484] Requires: none. |
| 4 of 59 | `ReplicatedStorage/Shared/Config/Jobs` | ModuleScript | `src/shared/Config/Jobs.luau` | Config/Jobs: job payout and XP constants plus /econsim assumptions. -- spec [346] Requires: none. |
| 5 of 59 | `ReplicatedStorage/Shared/Config/Races` | ModuleScript | `src/shared/Config/Races.luau` | Config/Races: race definitions keyed by RaceId, server events and trick table. -- spec [392], [412], [413] Requires: none. |
| 6 of 59 | `ReplicatedStorage/Shared/Config/SoundIds` | ModuleScript | `src/shared/Config/SoundIds.luau` | Config/SoundIds: every audio asset ID. -- spec [13], [38], [252] Requires: Logger. |
| 7 of 59 | `ReplicatedStorage/Shared/Config/Upgrades` | ModuleScript | `src/shared/Config/Upgrades.luau` | Config/Upgrades: parts, sliders, tier multipliers and caps. -- spec [366]-[368] Requires: none. |
| 8 of 59 | `ReplicatedStorage/Shared/Config/Weather` | ModuleScript | `src/shared/Config/Weather.luau` | Config/Weather: weather states, durations and region looks. -- spec [325], [330], [331] Requires: none. |
| 9 of 59 | `ReplicatedStorage/Shared/Logger` | ModuleScript | `src/shared/Logger.luau` | Logger: scoped, level-filtered, repeat-suppressing output. -- spec [32] Requires: none. |
| 10 of 59 | `ReplicatedStorage/Shared/Net` | ModuleScript | `src/shared/Net/init.luau` | Net: the only client-server channel. Creates remotes from NetDefs on the server, validates Requires: Logger, NetDefs, Signal, Types, script.Validators. |
| 11 of 59 | `ReplicatedStorage/Shared/Net/Validators` | ModuleScript | `src/shared/Net/Validators.luau` | Net/Validators: compiles NetDefs argument spec tuples into validator functions (Net.T). Requires: Types, Parent.Util. |
| 12 of 59 | `ReplicatedStorage/Shared/NetDefs` | ModuleScript | `src/shared/NetDefs.luau` | NetDefs: every remote in the game, its kind, direction, argument specs and rate. -- spec [34], [35] Requires: Types. |
| 13 of 59 | `ReplicatedStorage/Shared/Signal` | ModuleScript | `src/shared/Signal.luau` | Signal: the single same-machine event primitive. -- spec [30] Requires: none. |
| 14 of 59 | `ReplicatedStorage/Shared/Trove` | ModuleScript | `src/shared/Trove.luau` | Trove: owns cleanup of connections, instances, functions, threads and objects. -- spec [31] Requires: Signal. |
| 15 of 59 | `ReplicatedStorage/Shared/Types` | ModuleScript | `src/shared/Types.luau` | Types: export type declarations only. -- spec [29] Requires: Signal. |
| 16 of 59 | `ReplicatedStorage/Shared/Units` | ModuleScript | `src/shared/Units.luau` | Units: the only module allowed to hold unit conversion factors. -- spec [28] Requires: none. |
| 17 of 59 | `ReplicatedStorage/Shared/Util` | ModuleScript | `src/shared/Util.luau` | Util: pure, stateless helpers plus retryAsync and the frozen tag/attribute name tables. -- spec [33], [41], [43] Requires: Logger, Units. |
| 18 of 59 | `ServerScriptService/Server/ConfigValidator` | ModuleScript | `src/server/ConfigValidator.luau` | ConfigValidator: checks every vehicle config before any Service Init and reports all Requires: Config.AssetIds, Config.Economy, Config.SoundIds, Logger, Types, Util. |
| 19 of 59 | `ServerScriptService/Server/DevTools` | ModuleScript | `src/server/DevTools.luau` | DevTools (server): Studio-only developer commands behind a UserId allowlist. Required by Requires: Logger, Net, NetDefs, Tests.TestKit, Trove, Types, Util. |
| 20 of 59 | `ServerScriptService/Server/Main` | Script | `src/server/Main.server.luau` | Main (server): the only server Script. Boots Logger, settings check, ConfigValidator, Net, Requires: Config.AssetIds, Config.Game, Config.SoundIds, ConfigValidator, Logger, Net, Types, moduleScript. |
| 21 of 59 | `ServerScriptService/Server/Services/AnalyticsService` | ModuleScript | `src/server/Services/AnalyticsService.luau` | AnalyticsService: onboarding funnel, economy and custom analytics events. -- spec [365], [449], [484] Requires: Types. |
| 22 of 59 | `ServerScriptService/Server/Services/AntiCheatService` | ModuleScript | `src/server/Services/AntiCheatService.luau` | AntiCheatService: per-player violation score fed by Net.Violation. -- spec [35], [471], [473] Requires: Logger, Net, Types. |
| 23 of 59 | `ServerScriptService/Server/Services/CrewService` | ModuleScript | `src/server/Services/CrewService.luau` | CrewService: crews, roles, invites and meetups. -- spec [463]-[464] Requires: Types. |
| 24 of 59 | `ServerScriptService/Server/Services/CustomizationService` | ModuleScript | `src/server/Services/CustomizationService.luau` | CustomizationService: parts, paint, tunes, gear and PI. -- spec [366]-[390] Requires: Types. |
| 25 of 59 | `ServerScriptService/Server/Services/DataService` | ModuleScript | `src/server/Services/DataService/init.luau` | DataService: owns every player save through ProfileStore (loleris). -- spec [451]-[456] Requires: Config.Economy, Logger, Signal, Types, Util, module, script.ProfileTemplate. |
| 26 of 59 | `ServerScriptService/Server/Services/DataService/ProfileTemplate` | ModuleScript | `src/server/Services/DataService/ProfileTemplate.luau` | ProfileTemplate: defaults for new player saves, the per-vehicle template, the current data Requires: Config.Economy, Types. |
| 27 of 59 | `ServerScriptService/Server/Services/EconomyService` | ModuleScript | `src/server/Services/EconomyService.luau` | EconomyService: sole writer of Cash, Rep and the Ledger. -- spec [341]-[365] Requires: Types. |
| 28 of 59 | `ServerScriptService/Server/Services/EventService` | ModuleScript | `src/server/Services/EventService.luau` | EventService: server events, daily/weekly challenges and seasons. -- spec [363], [413] Requires: Types. |
| 29 of 59 | `ServerScriptService/Server/Services/GarageService` | ModuleScript | `src/server/Services/GarageService.luau` | GarageService: garage slots, spawning hand-off and resale. -- spec [360]-[361] Requires: Types. |
| 30 of 59 | `ServerScriptService/Server/Services/JobService` | ModuleScript | `src/server/Services/JobService.luau` | JobService: job offers, state machines and payouts. -- spec [345]-[357] Requires: Types. |
| 31 of 59 | `ServerScriptService/Server/Services/MonetizationService` | ModuleScript | `src/server/Services/MonetizationService.luau` | MonetizationService: game passes, ProcessReceipt and Cash bundles. -- spec [457]-[461] Requires: Types. |
| 32 of 59 | `ServerScriptService/Server/Services/PlayerService` | ModuleScript | `src/server/Services/PlayerService.luau` | PlayerService: gates character spawning on a loaded profile, tracks Player_Ready and sends Requires: Logger, Net, Signal, Trove, Types. |
| 33 of 59 | `ServerScriptService/Server/Services/RaceService` | ModuleScript | `src/server/Services/RaceService.luau` | RaceService: race lobbies, timing, results and ratings. -- spec [391]-[415] Requires: Types. |
| 34 of 59 | `ServerScriptService/Server/Services/ShopService` | ModuleScript | `src/server/Services/ShopService.luau` | ShopService: dealership purchases, rentals, test rides and the used lot. -- spec [358]-[359] Requires: Types. |
| 35 of 59 | `ServerScriptService/Server/Services/TimeService` | ModuleScript | `src/server/Services/TimeService.luau` | TimeService: the canonical 48-minute day clock. -- spec [326] Requires: Types. |
| 36 of 59 | `ServerScriptService/Server/Services/TrafficService` | ModuleScript | `src/server/Services/TrafficService.luau` | TrafficService: traffic facts, signal epoch and Street Rules heat. -- spec [416]-[430] Requires: Types. |
| 37 of 59 | `ServerScriptService/Server/Services/VehicleService` | ModuleScript | `src/server/Services/VehicleService.luau` | VehicleService: spawning, ownership, enter/exit, damage state and the 10 Hz sampler. -- spec [46]-[75], [242] Requires: Types. |
| 38 of 59 | `ServerScriptService/Server/Services/WeatherService` | ModuleScript | `src/server/Services/WeatherService.luau` | WeatherService: per-zone weather states and wetness. -- spec [330]-[333] Requires: Types. |
| 39 of 59 | `ServerScriptService/Server/Tests/Economy.spec` | ModuleScript | `src/server/Tests/Economy.spec.luau` | Economy.spec: the Rep XP curve constants reproduce the canon table. -- spec [341], [482] Requires: Config.Economy, TestKit. |
| 40 of 59 | `ServerScriptService/Server/Tests/Net.spec` | ModuleScript | `src/server/Tests/Net.spec.luau` | Net.spec: compiled validators reject malformed payloads. -- spec [35], [482] Requires: Net, TestKit. |
| 41 of 59 | `ServerScriptService/Server/Tests/Signal.spec` | ModuleScript | `src/server/Tests/Signal.spec.luau` | Signal.spec: error isolation and safe disconnection. -- spec [30], [482] Requires: Signal, TestKit. |
| 42 of 59 | `ServerScriptService/Server/Tests/TestKit` | ModuleScript | `src/server/Tests/TestKit.luau` | TestKit: a tiny describe/it/expect runner for the *.spec ModuleScripts in this folder, Requires: none. |
| 43 of 59 | `ServerScriptService/Server/Tests/Trove.spec` | ModuleScript | `src/server/Tests/Trove.spec.luau` | Trove.spec: cleanup order and type dispatch. -- spec [31], [482] Requires: Signal, TestKit, Trove. |
| 44 of 59 | `ServerScriptService/Server/Tests/Units.spec` | ModuleScript | `src/server/Tests/Units.spec.luau` | Units.spec: conversion acceptance values. -- spec [28], [482] Requires: TestKit, Units. |
| 45 of 59 | `ServerScriptService/Server/Tests/Util.spec` | ModuleScript | `src/server/Tests/Util.spec.luau` | Util.spec: pure helper checks. -- spec [33], [482] Requires: TestKit, Units, Util. |
| 46 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/AudioController` | ModuleScript | `src/client/Controllers/AudioController.luau` | AudioController: engine, tire, wind, ambience and radio audio. -- spec [251]-[270] Requires: Types. |
| 47 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/CameraController` | ModuleScript | `src/client/Controllers/CameraController.luau` | CameraController: chase, POV, cinematic and garage cameras. -- spec [119]-[123] Requires: Types. |
| 48 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/HUDController` | ModuleScript | `src/client/Controllers/HUDController.luau` | HUDController: speed/tach cluster, minimap host, toasts and race block. -- spec [436]-[440] Requires: Types. |
| 49 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/InputController` | ModuleScript | `src/client/Controllers/InputController.luau` | InputController: the only riding-input binder; builds RiderCommand. -- spec [101]-[115] Requires: Types. |
| 50 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/MapController` | ModuleScript | `src/client/Controllers/MapController.luau` | MapController: minimap and region weighting. -- spec [441] Requires: Types. |
| 51 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/PhoneController` | ModuleScript | `src/client/Controllers/PhoneController.luau` | PhoneController: the phone and its apps. -- spec [442] Requires: Types. |
| 52 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/RiderAnimationController` | ModuleScript | `src/client/Controllers/RiderAnimationController.luau` | RiderAnimationController: rider poses, IK, crashes and get-up. -- spec [227]-[241] Requires: Types. |
| 53 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/SettingsController` | ModuleScript | `src/client/Controllers/SettingsController.luau` | SettingsController: settings screens and Settings_Save. -- spec [446]-[447] Requires: Types. |
| 54 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/TrafficController` | ModuleScript | `src/client/Controllers/TrafficController.luau` | TrafficController: client-simulated traffic, pedestrians and world life. -- spec [416]-[430] Requires: Types. |
| 55 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/UIController` | ModuleScript | `src/client/Controllers/UIController.luau` | UIController: screen layers, garage, dealership and tutorial. -- spec [431]-[435], [444]-[449] Requires: Types. |
| 56 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/VehicleController` | ModuleScript | `src/client/Controllers/VehicleController.luau` | VehicleController: steps the locally owned vehicle in PreSimulation. -- spec [46]-[75] Requires: Types. |
| 57 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Controllers/WeatherFXController` | ModuleScript | `src/client/Controllers/WeatherFXController.luau` | WeatherFXController: lighting mixer, precipitation and VFX. -- spec [321]-[340] Requires: Types. |
| 58 of 59 | `StarterPlayer/StarterPlayerScripts/Client/DevToolsClient` | ModuleScript | `src/client/DevToolsClient.luau` | DevToolsClient: Studio-only DEV button and command bar; prints server replies and the Requires: Logger, Net, Trove, Types, Util. |
| 59 of 59 | `StarterPlayer/StarterPlayerScripts/Client/Main` | LocalScript | `src/client/Main.client.luau` | Main (client): the only client LocalScript besides ReplicatedFirst/Loading. Waits for the Requires: Config.Game, Logger, Net, Types, moduleScript. |
Also create these empty Folders: `ReplicatedStorage/Shared/Config/Vehicles`, `ReplicatedStorage/Packages`, `ReplicatedStorage/Assets` with subfolders `VehicleModels`, `RiderGear`, `VFX` and `UI`, `ServerScriptService/Server/Packages` and `ServerStorage/ServerAssets`. Never create `ReplicatedStorage/Remotes` yourself, because `Net` builds it at boot.

## Studio setup (S1-S27)

Steps marked **MANUAL STEP** can only be done by you. Each one says what breaks without it.

1. **MANUAL STEP** File > Publish to Roblox > create a new experience. *Without this, ProfileStore can't reach DataStores and saving fails.*
2. **MANUAL STEP** Home > Game Settings > Security > turn **Enable Studio Access to API Services** ON > Save. *Without this, ProfileStore can't save in Studio.*
3. **MANUAL STEP** Game Settings > Avatar > set Avatar Type to **R15** > Save. *Rider IK and ragdolls from Phase 5 assume R15.*
4. **MANUAL STEP** Game Settings > Places > edit this place > set Max Players to **30** > Save. *Otherwise boot logs a WARN.*
5. **MANUAL STEP** Select **Workspace** in Explorer. In Properties, set **Gravity** to `35`.
6. **MANUAL STEP** Workspace > **StreamingEnabled** = true.
7. **MANUAL STEP** Workspace > **StreamingTargetRadius** = `1024`.
8. **MANUAL STEP** Workspace > **StreamingMinRadius** = `256`.
9. **MANUAL STEP** Workspace > **StreamOutBehavior** = `Opportunistic`.
10. **MANUAL STEP** Workspace > **StreamingIntegrityMode** = `MinimumRadiusPause`.
11. **MANUAL STEP** Workspace > **SignalBehavior** = `Deferred`.
12. **MANUAL STEP** Select **Lighting** > **Technology** = `Future`.
13. Select **StarterPlayer** > **CharacterUseJumpPower** = false.
14. StarterPlayer > **CharacterJumpHeight** = `1.8`.
15. StarterPlayer > **EnableMouseLockOption** = false. *Otherwise Shift Lock takes the clutch key in Phase 2.*
16. Select **Players** > **CharacterAutoLoads** = false. *PlayerService spawns characters only after the profile loads.*
17. In ReplicatedStorage, create Folder `Shared` and add every `ReplicatedStorage/Shared/...` instance from the manifest, including Folder `Config` with its empty `Vehicles` Folder.
18. In ReplicatedStorage, create Folders `Packages` and `Assets`, and inside `Assets` create `VehicleModels`, `RiderGear`, `VFX` and `UI`.
19. In ServerScriptService, create Folder `Server` containing Script `Main`, ModuleScripts `ConfigValidator` and `DevTools`, and Folders `Services`, `Packages` and `Tests`.
20. Fill `Server/Services` with 17 ModuleScripts. `DataService` gets a child ModuleScript named `ProfileTemplate`.
21. Fill `Server/Tests` with `TestKit` plus the six `.spec` ModuleScripts. Each name keeps its dot, for example `Units.spec`.
22. In ServerStorage, create Folder `ServerAssets`.
23. In StarterPlayer > StarterPlayerScripts, create Folder `Client` containing LocalScript `Main`, ModuleScript `DevToolsClient` and Folder `Controllers` with its 12 ModuleScripts.
24. **MANUAL STEP** Get **ProfileStore by loleris** from its official source (the MadStudioRoblox/ProfileStore GitHub release or loleris's Creator Store model). Put the single ModuleScript at `ServerScriptService/Server/Packages`, named exactly `ProfileStore`. Don't retype it. *Without it, DataService logs one WARN and runs session-only, so nothing saves.*
25. Optional: select **ServerScriptService** > Attributes > + > Boolean `UseMockData` = true. This makes Studio tests use ProfileStore's mock store and unlocks `/resetdata`. Remove it, or set it to false, before testing persistence (T1.5).
26. Keep the default Baseplate and its SpawnLocation. Phase 1 has no world.
27. **MANUAL STEP** File > Publish to Roblox after the phase passes.

## Test checklist (T1.1-T1.14)

Run each test in Play solo, then in Test > Clients and Servers with 2 clients.

1. **T1.1** Press Play. *Pass:* Output shows `[TC][S][Boot][INFO] DataService:Init OK` through `AnalyticsService:Init OK` in the canonical order, then 17 `…:Start OK` lines, then `Boot 17/17 OK in N ms`.
2. **T1.2** Same run, client side. *Pass:* `[TC][C][Boot]` Init and Start lines for the 12 Controllers in order (InputController first, SettingsController last), then `Throttle County client boot 12/12 OK`.
3. **T1.3** While playing, expand ReplicatedStorage > `Remotes`. *Pass:* 54 remotes (52 in live servers, which have no `Dev_` remotes). `Vehicle_State`, `Race_Standings` and `Heat_State` are UnreliableRemoteEvents. The 5 RemoteFunctions are `Shop_Buy`, `Shop_Rent`, `Shop_TestRide`, `Property_Buy` and `Lift_Board`.
4. **T1.4** Read the yellow lines in Output. *Pass:* exactly one, `AssetIds: 49 placeholder IDs skipped (23 asset, 26 sound)`, and no red lines.
5. **T1.5** First join of a fresh account, with `UseMockData` off. *Pass:* `profile loaded for <name> (<id>): $2,500, 1 vehicle(s) [kurb_street_bmx], new=true, mode=ProfileStore`, and the client prints `Data_Snapshot: Cash $2,500, vehicles: kurb_street_bmx`.
6. **T1.6** Stop, then Play again (a rejoin). *Pass:* the same line with `new=false`, still one `kurb_street_bmx`, still $2,500.
7. **T1.7** Set Workspace.Gravity to `196.2` and Play. *Pass:* exactly one extra WARN, `Workspace.Gravity is 196.2, expected 35`. Set it back to 35.
8. **T1.8** Click **DEV**, type `/selftest`, press Enter. *Pass:* `selftest: 32 passed, 0 failed`, plus exactly one red line containing `intentional /selftest error`. That line is the Signal isolation check from [30].
9. **T1.9** Run `/fuzz`. *Pass:* `fuzz: 252 malformed calls, 0 reached a handler`.
10. **T1.10** Run `/leaktest 200`. *Pass:* about 10 s later, `leaktest 200: descendants delta 0, memory delta ≤5.0 MB -> PASS`.
11. **T1.11** Run `/simfail web 3`. *Pass:* within about 10 s, `SimFailProbe succeeded on attempt 4` and `simfail probe: success=true after 3 injected failure(s), fn ran 1 time(s)`.
12. **T1.12** Run `/tp oldtown`, then `/tp port`. *Pass:* `teleported to oldtown` (onto the Baseplate), then `no ground at port yet (world blockout arrives in Phase 6)`.
13. **T1.13** In the 2-client test, Player2 runs `/profile`. *Pass:* it replies with Cash and vehicles. Then remove `-2` from `LOCAL_TEST_USER_IDS` in DevTools and run the test again. *Pass:* Player2 gets `denied`, and Output logs `command from -2 (denied)`. Restore `-2`.
14. **T1.14** Fault isolation. Add `error("boom")` as the first line of `EconomyService:Init`, and `error("boom")` as the first line of `MapController:Start`, then Play. *Pass:* `[Boot][ERROR] EconomyService:Init - boom…`, then `Boot 16/17, failed: EconomyService`. The client logs `MapController:Start - boom` and the other 11 Controllers log Start OK. Remove both lines. Then open View > Script Analysis. *Pass:* 0 errors and 0 warnings.

## Tradeoffs and deferred items

- Tradeoff: the 59 files are delivered as a repository branch with this manifest instead of 59 code blocks in one chat reply. The chat output limit would have forced roughly 15 "continue" round-trips. The content is identical (priority 1 over 5).
- Tradeoff: the `/selftest` Signal check deliberately prints one red error line, which [30] requires. It is the only red line allowed during T1.8 (priority 1 over 5).
- Deferred: none. `/cash`, `/level`, `/spawn`, `/stress`, `/time`, `/weather` and `/wet` reply with the phase that implements them, as [8] requires.

## Assumptions

- **A1.1:** `GAME_TITLE` and `VERSION` live in `Shared/Config/Game`, the one place [2] needs.
- **A1.2:** Logger prefixes every line with `[TC][S|C][Scope][LEVEL]`. Live servers log INFO and up, live clients WARN and up, and Studio logs DEBUG and up.
- **A1.3:** The single [13] placeholder summary is logged by the server only, so Play solo shows exactly one yellow line.
- **A1.4:** Tables never cross remotes raw. Structured client payloads, such as `Settings_Save`, are JSON strings with a length cap ([35] "no unschematized tables").
- **A1.5:** NetDefs adds a `{"boolean"}` arg spec (for `Vehicle_Push`) and a `"Both"` direction (for `Vehicle_State`, which is relayed back to clients per [36]).
- **A1.6:** The [455] rule "VehicleId removed from Config" is driven by an explicit `Config/Economy.RetiredVehicleIds` list. It is not inferred from missing configs, so a config that fails validation hides a vehicle but never refunds it.
- **A1.7:** The one-time starter Kurb Street BMX grant runs inside DataService's load step, because ShopService and GarageService are Phase 4 stubs.
- **A1.8:** DevTools allowlist = the place creator (user-owned places) + `-1`…`-8` + `EXTRA_ALLOWED_USER_IDS`. For an unpublished or group-owned place, add your UserId there.
- **A1.9:** `UseMockData` is a Boolean attribute on ServerScriptService.
- **A1.10:** Characters spawn with `Player:LoadCharacterAsync()`, since `LoadCharacter` is deprecated in the current API.
- **A1.11:** `Net` is a ModuleScript with a child `Validators`, so it stays under the 500-line cap from [40]. The Explorer path `Shared/Net` is unchanged.

```
PHASE 1 COMPLETE - Foundation
Files: 59 new, 0 replaced (paths listed above)
Studio setup: S1-S27 (14 tagged MANUAL STEP)
Tests: T1.1-T1.14, action then expected result
Tradeoffs: 2 | Deferred: 0
Assumptions: A1.1-A1.11
Status: Not run in Studio - written to pass T1.1-T1.14
Type next for Phase 2
```
