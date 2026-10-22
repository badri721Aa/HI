# MonkeWardrobe

A BepInEx mod for Gorilla Tag (PC) that lets you wear **your own custom cosmetics**: hats, glasses,
backpacks and hand items you make yourself. In modded lobbies, other players who have MonkeWardrobe
**and the same cosmetic files** see them too.

It does **not** unlock, copy or fake the game's paid cosmetics, and it never touches the store,
your inventory or Shiny Rocks.

## How sharing works

| Where you are | Who sees your cosmetics |
|---|---|
| Not in a room (stump, offline) | You (preview) |
| **Modded lobby** (game mode contains `MODDED`) | You, plus every MonkeWardrobe player who has the same cosmetic files |
| Private room | Only you, unless you turn on `AllowPrivateRooms` |
| Public lobby | Only you. Nothing is sent to anyone. |

When sharing is allowed, MonkeWardrobe sets one Photon player property, `mw.loadout`, holding a
short list of cosmetic **ids** such as `Head=mw.top_hat;Face=mw.shades`. Other players' copies of the
mod look those ids up in **their own** `Cosmetics` folder. No files or models are ever sent over the
network, so nobody can make your game load something you didn't install. The property is removed
when you leave the room, so it never follows you into a public lobby.

## Install

1. Install [BepInEx 5](https://github.com/BepInEx/BepInEx/releases) (x64) into your Gorilla Tag folder
   and start the game once.
2. Build (below), or copy `MonkeWardrobe.dll` plus the `Cosmetics` folder to
   `Gorilla Tag/BepInEx/plugins/MonkeWardrobe/`.
3. Start the game and press **F6**.

## Build

Requires the [.NET SDK](https://dotnet.microsoft.com/download) (6 or newer). The project compiles
against the DLLs in your own game folder; nothing from the game is redistributed.

```
cd mods/MonkeWardrobe
dotnet build -c Release
```

If the game isn't in the default Steam folder:

```
dotnet build -c Release -p:GamePath="D:\SteamLibrary\steamapps\common\Gorilla Tag"
```

The build copies the plugin and the sample cosmetics into `BepInEx/plugins/MonkeWardrobe/`.
Cosmetic files already there are never overwritten. Add `-p:CopyToGame=false` to skip that step.

## Controls

**Desktop: press F6** (change it with `MenuKey` in the config).

- **Wardrobe**: `<` / `>` steps through each slot's cosmetics. "(nothing)" sits between the last and the first.
- **Fit**: nudges every cosmetic in the chosen slot (position, tilt/turn/roll, size). Use this if
  something sits a little off on the gorilla. It's saved per slot.
- **Reload cosmetics**: re-reads the folder after you add or edit files. No restart needed.

**VR**: hold the **left stick down**, then:
- **X** = equip the next cosmetic in the selected slot (one buzz).
- **Y** = select the next slot (buzzes 1-5 times: Head, Face, Body, LeftHand, RightHand).

Your own Head and Face cosmetics show only in mirrors, so they never block your view
(`HideOwnHeadCosmetics`).

## Making cosmetics

Each cosmetic is one `.json` file anywhere inside the `Cosmetics` folder. There are two kinds.

### 1. Built from shapes (no Unity needed)

```json
{
  "id": "yourname.cool_hat",
  "name": "Cool Hat",
  "author": "yourname",
  "slot": "Head",
  "parts": [
    { "shape": "Cylinder", "color": "#1C1C22", "position": [0, 0.26, 0], "scale": [0.16, 0.08, 0.16] },
    { "shape": "Torus", "color": "#FFD34D", "thickness": 0.08, "position": [0, 0.3, 0], "scale": [0.22, 0.22, 0.22] },
    { "shape": "Cube", "texture": "textures/face.png", "pixelated": true, "scale": [0.1, 0.1, 0.1] }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | **Required.** Unique, 1-48 characters: `a-z 0-9 _ - .`. Prefix it with your name so it doesn't clash with someone else's. Everyone who should see the cosmetic needs the file with this id. |
| `slot` | **Required.** `Head`, `Face`, `Body`, `LeftHand` or `RightHand`. |
| `name`, `author` | Shown in the menu (up to 40 characters). |
| `position`, `rotation`, `scale` | Optional `[x, y, z]` for the whole cosmetic. Rotation is in degrees. |
| `parts[].shape` | `Cube`, `Sphere`, `Capsule`, `Cylinder`, `Quad`, `Cone`, `Torus`. At scale 1: Cube, Sphere and Quad are 1 across; Cylinder and Capsule are 1 wide and 2 tall (Unity's built-ins); Cone has a 1-wide base at y = 0 and its tip at y = 1; Torus is a flat ring 1 across (measured through the tube's centre). |
| `parts[].color` | `#RRGGBB`, `#RRGGBBAA` or a colour name like `red`. |
| `parts[].texture` | A `.png` or `.jpg` inside the `Cosmetics` folder, relative to the json file. Up to 4 MB. |
| `parts[].pixelated` | `true` keeps pixel-art textures sharp. |
| `parts[].thickness` | Torus tube thickness, 0.01-0.5 (default 0.1). |

Limits: 64 parts, offsets within ±2, scales within ±3. Files with mistakes are skipped, and the
BepInEx log says exactly what's wrong. JSON doesn't allow comments.

### 2. A Unity model (AssetBundle)

Build an AssetBundle containing one prefab (Unity 2022.3, matching the game), put it next to a json file:

```json
{ "id": "yourname.dragon_wings", "name": "Dragon Wings", "slot": "Body", "bundle": "wings.bundle", "prefab": "Wings" }
```

`prefab` is optional (the first prefab in the bundle is used). Only visual components are kept:
meshes, skinned meshes, particles, trails, lines, LOD groups and animators. Colliders, rigidbodies,
audio, lights, cameras and **all scripts are removed**, so a cosmetic can't affect gameplay. If a
model shows up pink, set `ReplaceBundleShaders = true`.

## Config

`BepInEx/config/com.monkewardrobe.gorillatag.cfg` (created after the first launch):

| Setting | Default | |
|---|---|---|
| `Enabled` | `true` | Off also removes your cosmetics from other players' view. |
| `MenuKey` | `F6` | |
| `VrControls` | `true` | |
| `HideOwnHeadCosmetics` | `true` | Head/Face cosmetics show only in mirrors for you. |
| `AllowPrivateRooms` | `false` | Also share in private code rooms. |
| `Shader` | *(auto)* | Force a shader by name, e.g. `GorillaTag/UberShader`. |
| `ReplaceBundleShaders` | `false` | Fixes pink AssetBundle models. |
| `Fit.*` | | Per-slot fit, set from the menu. |

## Troubleshooting

All messages are in `BepInEx/LogOutput.log`, prefixed with `[MonkeWardrobe]`.

- **Cosmetics are in the wrong spot or rotated**: use Fit in the F6 menu. The samples were
  positioned without access to the game, so expect to adjust them once.
- **Cosmetic is pink or invisible**: the log says which shader was picked. Try setting `Shader` to
  `GorillaTag/UberShader`.
- **Friends can't see my cosmetics**: they need MonkeWardrobe *and* the same json files (same `id`),
  and you must be in a modded lobby. The F6 window shows how many MonkeWardrobe players are in the room.
- **"VRRig class was not found"** or similar after a game update: the game renamed something.
  Everything that depends on the game's own code is in `src/RigBridge.cs`.

## Source layout

| File | Responsibility |
|---|---|
| `src/Plugin.cs` | BepInEx entry point, config, equip/cycle |
| `src/CosmeticLibrary.cs` | Loads and validates cosmetic files, builds the objects |
| `src/Sanitizer.cs` | Strips everything non-visual from AssetBundle models |
| `src/ProceduralMeshes.cs` | Cone and torus meshes |
| `src/Loadout.cs` | What's equipped, plus the strict parser for other players' data |
| `src/RoomSync.cs` | Photon property sharing (modded rooms only) |
| `src/RigDresser.cs` | Attaches and detaches cosmetics on every gorilla |
| `src/RigBridge.cs` | The only file that touches Gorilla Tag's own classes (by reflection) |
| `src/Calibration.cs` | Per-slot fit |
| `src/WardrobeMenu.cs`, `src/VrInput.cs` | F6 window and VR controls |

## Status

Compiled with 0 warnings against Unity 2021.3 reference assemblies, the official BepInEx 5.4.23.4 and
the Photon PUN 2 API. The loadout parser, config parsing and generated meshes have automated checks.
**It has not been run inside Gorilla Tag yet.** These parts can only be confirmed in the game:

- The game still uses Photon PUN for rooms. Without it, cosmetics still work for you but are not shared.
- Bone lookup (`VRRig.head.rigTarget`, then bones named `head`, `body`, `hand.L`, `hand.R`).
- Your own gorilla is detected via `VRRig.isOfflineVRRig`.
- The `MirrorOnly` layer exists. If it doesn't, your own Head and Face cosmetics are hidden from you
  instead of blocking your view.
- `GorillaTag/UberShader` uses the `_BaseColor` and `_BaseMap` properties.

Each of these has a fallback and logs a clear message instead of crashing.
