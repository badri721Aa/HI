# SteamKit Manager

Desktop tool for managing Steam AppIDs, manifests, and Lua configurations.

## Features
- **Games Library** — browse 200+ famous/new games with AppIDs
- **Bulk Download** — click one button to generate manifests + Lua configs for 1000 games
- **Manifest Editor** — create/edit `.acf` Steam manifest files
- **Lua Config Editor** — generate stplug-in Lua configs per AppID
- **Depot Configuration** — pin depots, set branches, export depot config
- **Settings** — configure Steam path, Millennium path, output directories

## Building the EXE (Windows)

```
pip install pyinstaller
python build.py
# Output: dist/SteamKitManager.exe
```

Or just run directly:
```
python src/main.py
```

## Usage

1. Go to **Settings** tab → set your output folder
2. Go to **Games Library** → click **Download All** (generates all manifests + Lua configs)
3. Files land in your output folder under `manifests/` and `lua/`
4. Copy `.acf` files to Steam's `steamapps/` folder
5. Copy `.lua` files to your Millennium/stplug-in directory

## Output Structure

```
SteamKitOutput/
├── manifests/
│   ├── appmanifest_730.acf
│   ├── appmanifest_570.acf
│   └── ...
├── lua/
│   ├── 730.lua
│   ├── 570.lua
│   └── ...
└── depot_config.lua
```
