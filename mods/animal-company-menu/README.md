# Animal Company — mod menu

BepInEx 5 (Mono) plugin. God mode, infinite stamina, no fall damage, speed hack, noclip,
and ESP (enemies/items/players, boxes + distance + line) behind an F1 menu.

## 1. Check it's Mono, not IL2CPP

Open `AnimalCompany_Data/Managed/Assembly-CSharp.dll` in Explorer.
- A few hundred KB to several MB → Mono. Proceed below as-is.
- A few KB → IL2CPP. Swap the csproj references for the Il2CppInterop-generated interop
  assemblies (run `BepInEx.IL2CPP` once, it generates them under
  `BepInEx/interop/`), change `BaseUnityPlugin`'s namespace import to
  `BepInEx.Unity.IL2CPP`, and change every `Component`/`Transform` field type that's
  currently from `UnityEngine` to the `Il2CppInterop.Runtime.Injection`-wrapped
  equivalents. Everything else (Harmony patches, ESP math, feature logic) is unchanged.

## 2. Install BepInEx 5 into the game

1. Download BepInEx 5 x64 from https://github.com/BepInEx/BepInEx/releases
2. Extract into the game's root folder (same folder as `AnimalCompany.exe`).
3. Run the game once and quit — this generates `BepInEx/plugins`, `BepInEx/core`, etc.

## 3. Set up the build references

```
mods/animal-company-menu/
  ../../libs/game/      <- copy every .dll from AnimalCompany_Data/Managed here
  ../../libs/bepinex/   <- copy BepInEx.dll and 0Harmony.dll from BepInEx/core here
```

or skip the copy and point MSBuild straight at your install:

```
dotnet build -p:GameManagedPath="C:\Program Files (x86)\Steam\steamapps\common\Animal Company\AnimalCompany_Data\Managed" -p:BepInExCorePath="C:\...\AnimalCompany\BepInEx\core"
```

## 4. Dumping the real names

Every `// FILL:` in `Patches.cs` is a placeholder based on Lethal-Company-style class
layout (the genre this game is cloning). Open `Assembly-CSharp.dll` in dnSpy or ILSpy
and confirm/rename:

| Placeholder | Find it by |
|---|---|
| `PlayerControllerB` | MonoBehaviour whose `FixedUpdate`/`Update` reads `Input.GetAxis("Horizontal"/"Vertical")` and calls `CharacterController.Move`/`Rigidbody.MovePosition` |
| `moveSpeed` field | float field on that class read right before the move call |
| `IsOwner` check | whatever marks "this instance is my local player" — `isLocalPlayer`, `IsOwner`, `photonView.IsMine`, `NetworkObject.IsOwner` |
| `TakeDamage` | method called from enemy attack / trap code, usually `TakeDamage(int)` or `DamagePlayer(float)` |
| `DrainStamina` | method ticked while sprinting, drains a `currentStamina` float |
| `FallDamage` | callback off a landing/`OnCollisionEnter` check |
| `EnemyAI` | base class of every monster prefab — has a `NavMeshAgent` and a state machine `Update` |
| `GrabbableObject` | base class of pickup/loot prefabs |

Right-click → Analyze in dnSpy to find all usages fast, or Edit → Find in Files for
`"TakeDamage"` / `"moveSpeed"` style string hits in decompiled source.

Find & replace each placeholder across `Patches.cs`, rebuild — it'll fail to compile
anywhere a signature doesn't match, which tells you exactly what's left.

## 5. Build & deploy

```
dotnet build -c Release
copy bin\Release\net48\AnimalCompanyMenu.dll "<game>\BepInEx\plugins\"
```

Launch the game, press **F1**.

## Notes

- These Lethal-Company-style co-op games are host-authoritative for most state
  (health, stamina, enemy spawns) and client-authoritative for movement — so noclip
  and speed hack work identically whether you're host or client, while god
  mode/infinite stamina are most reliable when you're hosting the lobby (the host's
  own simulation is the one other clients see).
- No anti-cheat has been found for this title (nothing EAC/BattlEye-shaped turned up
  in public modding/community discussion) — standard BepInEx injection via the
  doorstop proxy, no extra evasion layer included. If that changes, say so and I'll
  add anti-debug / signature-flattening on top of this.
