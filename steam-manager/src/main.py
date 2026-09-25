import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
import json
import os
import subprocess
import threading
import shutil
import zipfile
import tempfile
from pathlib import Path
import re
import time
import hashlib

# ─── CONFIG ───────────────────────────────────────────────────────────────────
APP_TITLE = "SteamKit Manager"
VERSION = "1.0.0"
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".steamkit_manager.json")

FAMOUS_GAMES = [
    {"name": "Counter-Strike 2", "appid": "730", "size": "25 GB"},
    {"name": "Dota 2", "appid": "570", "size": "20 GB"},
    {"name": "Grand Theft Auto V", "appid": "271590", "size": "95 GB"},
    {"name": "Red Dead Redemption 2", "appid": "1174180", "size": "120 GB"},
    {"name": "Cyberpunk 2077", "appid": "1091500", "size": "70 GB"},
    {"name": "Elden Ring", "appid": "1245620", "size": "60 GB"},
    {"name": "Baldur's Gate 3", "appid": "1086940", "size": "122 GB"},
    {"name": "Hogwarts Legacy", "appid": "990080", "size": "76 GB"},
    {"name": "The Witcher 3", "appid": "292030", "size": "50 GB"},
    {"name": "Dark Souls III", "appid": "374320", "size": "15 GB"},
    {"name": "ELDEN RING Shadow of the Erdtree", "appid": "2778580", "size": "8 GB"},
    {"name": "God of War", "appid": "1593500", "size": "34 GB"},
    {"name": "God of War Ragnarök", "appid": "2322010", "size": "190 GB"},
    {"name": "Horizon Zero Dawn", "appid": "1151640", "size": "72 GB"},
    {"name": "Sekiro: Shadows Die Twice", "appid": "814380", "size": "12 GB"},
    {"name": "DOOM Eternal", "appid": "782330", "size": "50 GB"},
    {"name": "Resident Evil Village", "appid": "1196590", "size": "35 GB"},
    {"name": "Resident Evil 4 Remake", "appid": "2050650", "size": "67 GB"},
    {"name": "Detroit: Become Human", "appid": "1222140", "size": "38 GB"},
    {"name": "Death Stranding", "appid": "1190460", "size": "55 GB"},
    {"name": "Hades", "appid": "1145360", "size": "5 GB"},
    {"name": "Monster Hunter: World", "appid": "582010", "size": "48 GB"},
    {"name": "Monster Hunter Rise", "appid": "1446780", "size": "23 GB"},
    {"name": "Deep Rock Galactic", "appid": "548430", "size": "8 GB"},
    {"name": "Valheim", "appid": "892970", "size": "4 GB"},
    {"name": "Terraria", "appid": "105600", "size": "200 MB"},
    {"name": "Stardew Valley", "appid": "413150", "size": "500 MB"},
    {"name": "Hollow Knight", "appid": "367520", "size": "8 GB"},
    {"name": "Celeste", "appid": "504230", "size": "1.3 GB"},
    {"name": "Cuphead", "appid": "268910", "size": "4 GB"},
    {"name": "Disco Elysium", "appid": "632470", "size": "20 GB"},
    {"name": "Divinity: Original Sin 2", "appid": "435150", "size": "45 GB"},
    {"name": "Pathfinder: Wrath of the Righteous", "appid": "1184370", "size": "40 GB"},
    {"name": "Total War: Warhammer III", "appid": "1142710", "size": "120 GB"},
    {"name": "Crusader Kings III", "appid": "1158310", "size": "5 GB"},
    {"name": "Victoria 3", "appid": "529340", "size": "5 GB"},
    {"name": "Civilization VI", "appid": "289070", "size": "12 GB"},
    {"name": "XCOM 2", "appid": "268500", "size": "22 GB"},
    {"name": "Astroneer", "appid": "361420", "size": "10 GB"},
    {"name": "No Man's Sky", "appid": "275850", "size": "15 GB"},
    {"name": "Subnautica", "appid": "264710", "size": "9 GB"},
    {"name": "The Forest", "appid": "242760", "size": "4 GB"},
    {"name": "Green Hell", "appid": "815370", "size": "8 GB"},
    {"name": "Project Zomboid", "appid": "108600", "size": "3 GB"},
    {"name": "DayZ", "appid": "221100", "size": "16 GB"},
    {"name": "Rust", "appid": "252490", "size": "22 GB"},
    {"name": "ARK: Survival Evolved", "appid": "346110", "size": "400 GB"},
    {"name": "Palworld", "appid": "1623730", "size": "45 GB"},
    {"name": "Sons Of The Forest", "appid": "1326470", "size": "16 GB"},
    {"name": "Enshrouded", "appid": "1203620", "size": "12 GB"},
    {"name": "V Rising", "appid": "1604030", "size": "8 GB"},
    {"name": "Phasmophobia", "appid": "739630", "size": "16 GB"},
    {"name": "Among Us", "appid": "945360", "size": "250 MB"},
    {"name": "Fall Guys", "appid": "1097150", "size": "3 GB"},
    {"name": "Apex Legends", "appid": "1172470", "size": "100 GB"},
    {"name": "Warframe", "appid": "230410", "size": "35 GB"},
    {"name": "Path of Exile", "appid": "238960", "size": "30 GB"},
    {"name": "Path of Exile 2", "appid": "2694490", "size": "40 GB"},
    {"name": "Lost Ark", "appid": "1599340", "size": "50 GB"},
    {"name": "New World", "appid": "1063730", "size": "50 GB"},
    {"name": "Team Fortress 2", "appid": "440", "size": "15 GB"},
    {"name": "Left 4 Dead 2", "appid": "550", "size": "13 GB"},
    {"name": "Garry's Mod", "appid": "4000", "size": "5 GB"},
    {"name": "Half-Life: Alyx", "appid": "546560", "size": "67 GB"},
    {"name": "Portal 2", "appid": "620", "size": "11 GB"},
    {"name": "Borderlands 3", "appid": "397540", "size": "75 GB"},
    {"name": "Tiny Tina's Wonderlands", "appid": "1286680", "size": "39 GB"},
    {"name": "Mass Effect Legendary Edition", "appid": "1328670", "size": "120 GB"},
    {"name": "Dragon Age: Inquisition", "appid": "1222690", "size": "26 GB"},
    {"name": "Starfield", "appid": "1716740", "size": "125 GB"},
    {"name": "The Elder Scrolls V: Skyrim SE", "appid": "489830", "size": "12 GB"},
    {"name": "Fallout 4", "appid": "377160", "size": "30 GB"},
    {"name": "Fallout 76", "appid": "1151340", "size": "110 GB"},
    {"name": "Sea of Thieves", "appid": "1172620", "size": "35 GB"},
    {"name": "Halo: The Master Chief Collection", "appid": "976730", "size": "100 GB"},
    {"name": "Forza Horizon 5", "appid": "1551360", "size": "110 GB"},
    {"name": "Forza Motorsport", "appid": "2440510", "size": "90 GB"},
    {"name": "Microsoft Flight Simulator 2020", "appid": "1250410", "size": "170 GB"},
    {"name": "Microsoft Flight Simulator 2024", "appid": "2537590", "size": "50 GB"},
    {"name": "Age of Empires IV", "appid": "1466860", "size": "50 GB"},
    {"name": "Gears 5", "appid": "1097840", "size": "63 GB"},
    {"name": "Control", "appid": "870780", "size": "40 GB"},
    {"name": "Alan Wake 2", "appid": "1903790", "size": "90 GB"},
    {"name": "Immortals Fenyx Rising", "appid": "1278060", "size": "40 GB"},
    {"name": "Assassin's Creed Valhalla", "appid": "2208920", "size": "50 GB"},
    {"name": "Assassin's Creed Mirage", "appid": "2461810", "size": "40 GB"},
    {"name": "Far Cry 6", "appid": "2369390", "size": "60 GB"},
    {"name": "Ghost of Tsushima", "appid": "2215430", "size": "75 GB"},
    {"name": "Spider-Man Remastered", "appid": "1817070", "size": "75 GB"},
    {"name": "Spider-Man: Miles Morales", "appid": "1817190", "size": "50 GB"},
    {"name": "Ratchet & Clank: Rift Apart", "appid": "1895880", "size": "60 GB"},
    {"name": "Returnal", "appid": "1649240", "size": "60 GB"},
    {"name": "The Last of Us Part I", "appid": "1888930", "size": "100 GB"},
    {"name": "Forspoken", "appid": "1612570", "size": "60 GB"},
    {"name": "Atomic Heart", "appid": "668580", "size": "40 GB"},
    {"name": "Lies of P", "appid": "1627720", "size": "22 GB"},
    {"name": "Lords of the Fallen 2023", "appid": "1501750", "size": "45 GB"},
    {"name": "Star Wars Jedi: Survivor", "appid": "1774580", "size": "155 GB"},
    {"name": "Star Wars Jedi: Fallen Order", "appid": "1172380", "size": "48 GB"},
    {"name": "Dead Space Remake", "appid": "1693980", "size": "50 GB"},
    {"name": "Callisto Protocol", "appid": "1272130", "size": "44 GB"},
    {"name": "A Plague Tale: Requiem", "appid": "1182900", "size": "55 GB"},
    {"name": "Plague Tale: Innocence", "appid": "752590", "size": "34 GB"},
    {"name": "SOMA", "appid": "282140", "size": "20 GB"},
    {"name": "Amnesia: Rebirth", "appid": "999220", "size": "10 GB"},
    {"name": "Little Nightmares II", "appid": "860510", "size": "12 GB"},
    {"name": "Ghostwire: Tokyo", "appid": "1475810", "size": "20 GB"},
    {"name": "Nioh 2", "appid": "1325200", "size": "50 GB"},
    {"name": "Wo Long: Fallen Dynasty", "appid": "2118810", "size": "30 GB"},
    {"name": "Wild Hearts", "appid": "2046960", "size": "50 GB"},
    {"name": "Armored Core VI", "appid": "1888160", "size": "60 GB"},
    {"name": "Warhammer 40K: Space Marine 2", "appid": "2183900", "size": "75 GB"},
    {"name": "Helldivers 2", "appid": "553850", "size": "100 GB"},
    {"name": "Suicide Squad: Kill the Justice League", "appid": "315210", "size": "65 GB"},
    {"name": "Skull and Bones", "appid": "774241", "size": "50 GB"},
    {"name": "Prince of Persia: The Lost Crown", "appid": "1896370", "size": "10 GB"},
    {"name": "Like a Dragon: Ishin!", "appid": "1842650", "size": "44 GB"},
    {"name": "Like a Dragon: Infinite Wealth", "appid": "2155230", "size": "58 GB"},
    {"name": "Persona 5 Royal", "appid": "1687950", "size": "22 GB"},
    {"name": "Persona 4 Golden", "appid": "1113000", "size": "15 GB"},
    {"name": "Fire Emblem Engage", "appid": "unavailable", "size": "N/A"},
    {"name": "Final Fantasy XVI", "appid": "2515020", "size": "100 GB"},
    {"name": "Final Fantasy VII Rebirth", "appid": "2909400", "size": "150 GB"},
    {"name": "Final Fantasy XIV Online", "appid": "39210", "size": "80 GB"},
    {"name": "Fortnite", "appid": "unavailable", "size": "N/A"},
    {"name": "Battlefield 2042", "appid": "1517290", "size": "100 GB"},
    {"name": "Call of Duty: Modern Warfare III", "appid": "2519060", "size": "110 GB"},
    {"name": "Overwatch 2", "appid": "2357570", "size": "50 GB"},
    {"name": "Rainbow Six Siege", "appid": "359550", "size": "50 GB"},
    {"name": "Escape from Tarkov", "appid": "unavailable", "size": "N/A"},
    {"name": "Hunt: Showdown", "appid": "594650", "size": "30 GB"},
    {"name": "Back 4 Blood", "appid": "924970", "size": "50 GB"},
    {"name": "PAYDAY 3", "appid": "1272080", "size": "40 GB"},
    {"name": "Ready or Not", "appid": "1144200", "size": "50 GB"},
    {"name": "Insurgency: Sandstorm", "appid": "581320", "size": "40 GB"},
    {"name": "Hell Let Loose", "appid": "686810", "size": "30 GB"},
    {"name": "Squad", "appid": "393380", "size": "25 GB"},
    {"name": "Arma 3", "appid": "107410", "size": "50 GB"},
    {"name": "ARMA Reforger", "appid": "1874880", "size": "18 GB"},
    {"name": "War Thunder", "appid": "236390", "size": "100 GB"},
    {"name": "World of Tanks Blitz", "appid": "444200", "size": "15 GB"},
    {"name": "Elite Dangerous", "appid": "359320", "size": "35 GB"},
    {"name": "Star Citizen", "appid": "unavailable", "size": "N/A"},
    {"name": "Destiny 2", "appid": "1085660", "size": "100 GB"},
    {"name": "The Division 2", "appid": "2239550", "size": "60 GB"},
    {"name": "Ghost Recon Breakpoint", "appid": "2134500", "size": "100 GB"},
    {"name": "Watch Dogs: Legion", "appid": "2314630", "size": "50 GB"},
    {"name": "Riders Republic", "appid": "2278210", "size": "40 GB"},
    {"name": "Steep", "appid": "460750", "size": "26 GB"},
    {"name": "Just Cause 4", "appid": "517630", "size": "40 GB"},
    {"name": "Rage 2", "appid": "1002360", "size": "50 GB"},
    {"name": "Metro Exodus", "appid": "412020", "size": "59 GB"},
    {"name": "S.T.A.L.K.E.R. 2", "appid": "1643320", "size": "150 GB"},
    {"name": "Chernobylite", "appid": "1016800", "size": "12 GB"},
    {"name": "The Outer Worlds", "appid": "cold", "size": "N/A"},
    {"name": "Grounded", "appid": "962130", "size": "8 GB"},
    {"name": "Deathloop", "appid": "1252330", "size": "30 GB"},
    {"name": "Twelve Minutes", "appid": "1097200", "size": "5 GB"},
    {"name": "What Remains of Edith Finch", "appid": "501300", "size": "5 GB"},
    {"name": "Inside", "appid": "304430", "size": "4 GB"},
    {"name": "Limbo", "appid": "48000", "size": "200 MB"},
    {"name": "Ori and the Will of the Wisps", "appid": "1057090", "size": "13 GB"},
    {"name": "Ghostrunner", "appid": "1139900", "size": "10 GB"},
    {"name": "Neon White", "appid": "1533420", "size": "4 GB"},
    {"name": "Ultrakill", "appid": "1229490", "size": "2 GB"},
    {"name": "Titanfall 2", "appid": "1237970", "size": "48 GB"},
    {"name": "Battlefield 1", "appid": "1238840", "size": "80 GB"},
    {"name": "Battlefield V", "appid": "1238810", "size": "80 GB"},
    {"name": "FIFA 23 / EA Sports FC 24", "appid": "2195250", "size": "50 GB"},
    {"name": "NBA 2K24", "appid": "2338770", "size": "130 GB"},
    {"name": "Madden NFL 24", "appid": "2349430", "size": "50 GB"},
    {"name": "F1 23", "appid": "2108330", "size": "60 GB"},
    {"name": "Riders Republic", "appid": "2278210", "size": "40 GB"},
    {"name": "It Takes Two", "appid": "1426210", "size": "40 GB"},
    {"name": "A Way Out", "appid": "1222690", "size": "15 GB"},
    {"name": "Unravel Two", "appid": "1201530", "size": "15 GB"},
    {"name": "Hazelight's A Way Out", "appid": "877460", "size": "15 GB"},
    {"name": "Sackboy: A Big Adventure", "appid": "1378630", "size": "55 GB"},
    {"name": "Kena: Bridge of Spirits", "appid": "1325200", "size": "30 GB"},
    {"name": "Solar Ash", "appid": "1258780", "size": "14 GB"},
    {"name": "Sifu", "appid": "1835780", "size": "14 GB"},
    {"name": "Norco", "appid": "1221250", "size": "2 GB"},
    {"name": "Vampire Survivors", "appid": "1794680", "size": "200 MB"},
    {"name": "Dave the Diver", "appid": "1868140", "size": "3 GB"},
    {"name": "Viewfinder", "appid": "1382230", "size": "6 GB"},
    {"name": "Tunic", "appid": "553420", "size": "2 GB"},
    {"name": "Planet Crafter", "appid": "1284190", "size": "2 GB"},
    {"name": "Satisfactory", "appid": "526870", "size": "10 GB"},
    {"name": "Dyson Sphere Program", "appid": "1366540", "size": "4 GB"},
    {"name": "Factorio", "appid": "427520", "size": "1 GB"},
    {"name": "Oxygen Not Included", "appid": "457140", "size": "1 GB"},
    {"name": "RimWorld", "appid": "294100", "size": "1 GB"},
    {"name": "Dwarf Fortress", "appid": "975370", "size": "300 MB"},
    {"name": "Kenshi", "appid": "233860", "size": "12 GB"},
    {"name": "Mount & Blade II: Bannerlord", "appid": "261550", "size": "30 GB"},
    {"name": "Wartales", "appid": "1527950", "size": "8 GB"},
    {"name": "Battle Brothers", "appid": "365360", "size": "1 GB"},
    {"name": "Frostpunk 2", "appid": "1904390", "size": "40 GB"},
    {"name": "Against the Storm", "appid": "1336490", "size": "2 GB"},
    {"name": "Anno 1800", "appid": "916440", "size": "35 GB"},
    {"name": "SimCity 4", "appid": "24780", "size": "1 GB"},
    {"name": "Cities: Skylines", "appid": "255710", "size": "6 GB"},
    {"name": "Cities: Skylines II", "appid": "949230", "size": "10 GB"},
    {"name": "Planet Zoo", "appid": "703080", "size": "20 GB"},
    {"name": "Planet Coaster 2", "appid": "2688680", "size": "10 GB"},
    {"name": "Two Point Hospital", "appid": "535930", "size": "2 GB"},
    {"name": "Kerbal Space Program 2", "appid": "954850", "size": "15 GB"},
    {"name": "Surviving Mars", "appid": "464920", "size": "4 GB"},
    {"name": "Frostpunk", "appid": "323190", "size": "4 GB"},
    {"name": "This War of Mine", "appid": "282070", "size": "3 GB"},
    {"name": "Spiritfarer", "appid": "972660", "size": "3 GB"},
    {"name": "Stray", "appid": "1332010", "size": "10 GB"},
    {"name": "A Short Hike", "appid": "1055540", "size": "200 MB"},
    {"name": "Journey", "appid": "638230", "size": "2 GB"},
    {"name": "Flower", "appid": "966330", "size": "1 GB"},
    {"name": "Everything", "appid": "582270", "size": "2 GB"},
    {"name": "Outer Wilds", "appid": "753640", "size": "3 GB"},
    {"name": "The Stanley Parable: Ultra Deluxe", "appid": "1703340", "size": "5 GB"},
    {"name": "Superliminal", "appid": "1049410", "size": "2 GB"},
    {"name": "Manifold Garden", "appid": "473950", "size": "2 GB"},
    {"name": "The Forgotten City", "appid": "1173030", "size": "8 GB"},
    {"name": "Tacoma", "appid": "343860", "size": "5 GB"},
    {"name": "Observation", "appid": "906100", "size": "5 GB"},
    {"name": "Returnal", "appid": "1649240", "size": "60 GB"},
    {"name": "Deathloop", "appid": "1252330", "size": "30 GB"},
    {"name": "Tinykin", "appid": "1463120", "size": "5 GB"},
    {"name": "Unpacking", "appid": "1135690", "size": "500 MB"},
    {"name": "Prodeus", "appid": "964800", "size": "2 GB"},
    {"name": "Ion Fury", "appid": "562860", "size": "1 GB"},
    {"name": "Dusk", "appid": "519860", "size": "1 GB"},
    {"name": "FEAR", "appid": "21090", "size": "2 GB"},
    {"name": "System Shock 2023", "appid": "482400", "size": "15 GB"},
    {"name": "Quake Remastered", "appid": "2310", "size": "2 GB"},
    {"name": "Doom + Doom II", "appid": "2280", "size": "1 GB"},
    {"name": "Quake II Remastered", "appid": "2310", "size": "2 GB"},
]


PALETTE = {
    "bg": "#0d1117",
    "surface": "#161b22",
    "surface2": "#21262d",
    "accent": "#58a6ff",
    "accent2": "#1f6feb",
    "green": "#3fb950",
    "red": "#f85149",
    "yellow": "#d29922",
    "text": "#e6edf3",
    "text_dim": "#8b949e",
    "border": "#30363d",
}


def load_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {
        "steam_path": "",
        "millennium_path": "",
        "manifest_dir": "",
        "lua_config_dir": "",
        "installed_apps": [],
        "depot_pins": {},
    }


def save_config(cfg):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


# ─── LUA CONFIG GENERATOR ────────────────────────────────────────────────────

def generate_lua_config(appid, depots=None, unlocked=True, custom_params=None):
    depot_block = ""
    if depots:
        depot_lines = []
        for depot_id, branch in depots.items():
            depot_lines.append(f'  ["{depot_id}"] = "{branch}",')
        depot_block = "depots = {\n" + "\n".join(depot_lines) + "\n},"

    params_block = ""
    if custom_params:
        p_lines = []
        for k, v in custom_params.items():
            if isinstance(v, str):
                p_lines.append(f'  {k} = "{v}",')
            elif isinstance(v, bool):
                p_lines.append(f'  {k} = {"true" if v else "false"},')
            else:
                p_lines.append(f'  {k} = {v},')
        params_block = "\n".join(p_lines)

    lua = f"""-- SteamKit Manager - Auto-generated Lua config
-- AppID: {appid}
-- Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}

return {{
  appid = "{appid}",
  unlocked = {"true" if unlocked else "false"},
  {depot_block}
  {params_block}
  version = "1",
}}
"""
    return lua


# ─── MANIFEST GENERATOR ──────────────────────────────────────────────────────

def generate_manifest(appid, depots=None):
    manifest = {
        "AppState": {
            "appid": appid,
            "Universe": "1",
            "name": f"App {appid}",
            "StateFlags": "4",
            "installdir": f"App_{appid}",
            "LastUpdated": str(int(time.time())),
            "SizeOnDisk": "0",
            "buildid": "0",
            "LastOwner": "0",
            "UpdateResult": "0",
            "BytesToDownload": "0",
            "BytesDownloaded": "0",
            "BytesToStage": "0",
            "BytesStaged": "0",
            "AutoUpdateBehavior": "0",
            "AllowOtherDownloadsWhileRunning": "0",
            "ScheduledAutoUpdate": "0",
            "InstalledDepots": {}
        }
    }
    if depots:
        for d_id, d_manifest in depots.items():
            manifest["AppState"]["InstalledDepots"][d_id] = {
                "manifest": d_manifest,
                "size": "0"
            }
    return manifest


def manifest_to_vdf(data, indent=0):
    lines = []
    prefix = "\t" * indent
    for k, v in data.items():
        if isinstance(v, dict):
            lines.append(f'{prefix}"{k}"')
            lines.append(f'{prefix}{{')
            lines.append(manifest_to_vdf(v, indent + 1))
            lines.append(f'{prefix}}}')
        else:
            lines.append(f'{prefix}"{k}"\t\t"{v}"')
    return "\n".join(lines)


# ─── APP ─────────────────────────────────────────────────────────────────────

class SteamKitApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.config_data = load_config()
        self.title(f"{APP_TITLE} v{VERSION}")
        self.geometry("1200x800")
        self.configure(bg=PALETTE["bg"])
        self.resizable(True, True)
        self.minsize(900, 600)
        self._setup_styles()
        self._build_ui()
        self._load_game_list()

    def _setup_styles(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        s.configure(".", background=PALETTE["bg"], foreground=PALETTE["text"],
                     fieldbackground=PALETTE["surface"], bordercolor=PALETTE["border"],
                     font=("Segoe UI", 10))
        s.configure("TNotebook", background=PALETTE["bg"], bordercolor=PALETTE["border"])
        s.configure("TNotebook.Tab", background=PALETTE["surface2"],
                     foreground=PALETTE["text_dim"], padding=[12, 6])
        s.map("TNotebook.Tab",
              background=[("selected", PALETTE["accent2"])],
              foreground=[("selected", PALETTE["text"])])
        s.configure("TFrame", background=PALETTE["bg"])
        s.configure("TLabel", background=PALETTE["bg"], foreground=PALETTE["text"])
        s.configure("TEntry", fieldbackground=PALETTE["surface2"],
                     foreground=PALETTE["text"], insertcolor=PALETTE["text"],
                     bordercolor=PALETTE["border"])
        s.configure("TButton", background=PALETTE["surface2"],
                     foreground=PALETTE["text"], bordercolor=PALETTE["border"],
                     padding=[8, 4])
        s.map("TButton",
              background=[("active", PALETTE["accent2"])],
              foreground=[("active", PALETTE["text"])])
        s.configure("Treeview", background=PALETTE["surface"],
                     foreground=PALETTE["text"], fieldbackground=PALETTE["surface"],
                     bordercolor=PALETTE["border"], rowheight=28)
        s.map("Treeview",
              background=[("selected", PALETTE["accent2"])],
              foreground=[("selected", PALETTE["text"])])
        s.configure("Treeview.Heading", background=PALETTE["surface2"],
                     foreground=PALETTE["text"], relief="flat",
                     font=("Segoe UI", 10, "bold"))
        s.configure("TScrollbar", background=PALETTE["surface2"],
                     troughcolor=PALETTE["bg"], bordercolor=PALETTE["border"])
        s.configure("TProgressbar", background=PALETTE["accent"],
                     troughcolor=PALETTE["surface2"], bordercolor=PALETTE["border"])
        s.configure("TCombobox", fieldbackground=PALETTE["surface2"],
                     foreground=PALETTE["text"], background=PALETTE["surface2"],
                     selectbackground=PALETTE["accent2"])
        s.configure("TCheckbutton", background=PALETTE["bg"], foreground=PALETTE["text"])
        s.configure("TLabelframe", background=PALETTE["bg"],
                     foreground=PALETTE["text_dim"], bordercolor=PALETTE["border"])
        s.configure("TLabelframe.Label", background=PALETTE["bg"],
                     foreground=PALETTE["accent"])

    def _btn(self, parent, text, cmd, color=None, **kwargs):
        kwargs.setdefault("font", ("Segoe UI", 9, "bold"))
        b = tk.Button(parent, text=text, command=cmd,
                      bg=color or PALETTE["surface2"], fg=PALETTE["text"],
                      activebackground=PALETTE["accent2"], activeforeground=PALETTE["text"],
                      relief="flat", bd=0, padx=12, pady=5,
                      cursor="hand2", **kwargs)
        return b

    def _entry(self, parent, textvariable=None, **kwargs):
        e = tk.Entry(parent, bg=PALETTE["surface2"], fg=PALETTE["text"],
                     insertbackground=PALETTE["text"],
                     relief="flat", bd=1,
                     highlightbackground=PALETTE["border"],
                     highlightcolor=PALETTE["accent"],
                     highlightthickness=1,
                     textvariable=textvariable, **kwargs)
        return e

    def _label(self, parent, text, dim=False, **kwargs):
        return tk.Label(parent, text=text,
                        bg=kwargs.pop("bg", PALETTE["bg"]),
                        fg=PALETTE["text_dim"] if dim else PALETTE["text"],
                        font=("Segoe UI", kwargs.pop("size", 9)),
                        **kwargs)

    def _build_ui(self):
        # header
        hdr = tk.Frame(self, bg=PALETTE["surface"], height=56)
        hdr.pack(fill="x", side="top")
        hdr.pack_propagate(False)
        tk.Label(hdr, text="⚡ SteamKit Manager", bg=PALETTE["surface"],
                 fg=PALETTE["accent"], font=("Segoe UI", 16, "bold")).pack(
            side="left", padx=18, pady=8)
        tk.Label(hdr, text=f"v{VERSION}", bg=PALETTE["surface"],
                 fg=PALETTE["text_dim"], font=("Segoe UI", 9)).pack(side="left", pady=8)

        status_frame = tk.Frame(hdr, bg=PALETTE["surface"])
        status_frame.pack(side="right", padx=18)
        self.status_label = tk.Label(status_frame, text="● Ready",
                                      bg=PALETTE["surface"], fg=PALETTE["green"],
                                      font=("Segoe UI", 9, "bold"))
        self.status_label.pack(side="right")

        # notebook
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=8)

        self._tab_dashboard(nb)
        self._tab_games(nb)
        self._tab_manifest(nb)
        self._tab_lua(nb)
        self._tab_depot(nb)
        self._tab_settings(nb)
        self._tab_log(nb)

    # ─── DASHBOARD TAB ────────────────────────────────────────────────────────

    def _tab_dashboard(self, nb):
        f = tk.Frame(nb, bg=PALETTE["bg"])
        nb.add(f, text="  Dashboard  ")

        # stats row
        stats = tk.Frame(f, bg=PALETTE["bg"])
        stats.pack(fill="x", padx=16, pady=(16, 8))

        def stat_card(parent, label, value, color):
            c = tk.Frame(parent, bg=PALETTE["surface"], bd=0, relief="flat",
                         highlightbackground=PALETTE["border"], highlightthickness=1)
            c.pack(side="left", padx=6, pady=4, ipadx=18, ipady=12, fill="x", expand=True)
            tk.Label(c, text=value, bg=PALETTE["surface"], fg=color,
                     font=("Segoe UI", 22, "bold")).pack()
            tk.Label(c, text=label, bg=PALETTE["surface"], fg=PALETTE["text_dim"],
                     font=("Segoe UI", 9)).pack()

        self.stat_total = tk.StringVar(value=str(len(FAMOUS_GAMES)))
        self.stat_installed = tk.StringVar(value="0")
        self.stat_manifests = tk.StringVar(value="0")

        stat_card(stats, "Total Games", str(len(FAMOUS_GAMES)), PALETTE["accent"])
        stat_card(stats, "Installed", "0", PALETTE["green"])
        stat_card(stats, "Manifests Generated", "0", PALETTE["yellow"])

        # quick actions
        qa = tk.LabelFrame(f, text=" Quick Actions ", bg=PALETTE["bg"],
                           fg=PALETTE["accent"], font=("Segoe UI", 10, "bold"),
                           bd=1, relief="flat",
                           highlightbackground=PALETTE["border"], highlightthickness=1)
        qa.pack(fill="x", padx=16, pady=8)

        row1 = tk.Frame(qa, bg=PALETTE["bg"])
        row1.pack(fill="x", padx=10, pady=10)

        self._btn(row1, "⬇  Download Top 1000 Games",
                  self._bulk_download_all, color=PALETTE["accent2"],
                  font=("Segoe UI", 11, "bold")).pack(side="left", padx=6, ipady=6, ipadx=12)
        self._btn(row1, "📋  Generate All Manifests",
                  self._gen_all_manifests, color=PALETTE["surface2"]).pack(
            side="left", padx=6)
        self._btn(row1, "🔧  Generate All Lua Configs",
                  self._gen_all_lua, color=PALETTE["surface2"]).pack(
            side="left", padx=6)
        self._btn(row1, "📁  Open Output Folder",
                  self._open_output_folder, color=PALETTE["surface2"]).pack(
            side="left", padx=6)

        # progress area
        prog_frame = tk.Frame(f, bg=PALETTE["bg"])
        prog_frame.pack(fill="x", padx=16, pady=4)
        self._label(prog_frame, "Download Progress:", dim=True).pack(anchor="w")
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(prog_frame, variable=self.progress_var,
                                             maximum=100, length=400)
        self.progress_bar.pack(fill="x", pady=(4, 0))
        self.progress_text = self._label(prog_frame, "", dim=True)
        self.progress_text.pack(anchor="w")

        # recent log
        log_frame = tk.LabelFrame(f, text=" Activity Log ", bg=PALETTE["bg"],
                                   fg=PALETTE["accent"], font=("Segoe UI", 10, "bold"),
                                   bd=1, relief="flat",
                                   highlightbackground=PALETTE["border"], highlightthickness=1)
        log_frame.pack(fill="both", expand=True, padx=16, pady=8)
        self.dashboard_log = scrolledtext.ScrolledText(
            log_frame, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 9),
            relief="flat", state="disabled", height=8)
        self.dashboard_log.pack(fill="both", expand=True, padx=6, pady=6)

    # ─── GAMES TAB ────────────────────────────────────────────────────────────

    def _tab_games(self, nb):
        f = tk.Frame(nb, bg=PALETTE["bg"])
        nb.add(f, text="  Games Library  ")

        toolbar = tk.Frame(f, bg=PALETTE["bg"])
        toolbar.pack(fill="x", padx=12, pady=8)

        self._label(toolbar, "Search:").pack(side="left", padx=(0, 4))
        self.search_var = tk.StringVar()
        self.search_var.trace("w", self._filter_games)
        self._entry(toolbar, textvariable=self.search_var, width=30).pack(
            side="left", padx=(0, 12))

        self._label(toolbar, "Filter:").pack(side="left", padx=(0, 4))
        self.filter_var = tk.StringVar(value="All")
        fil = ttk.Combobox(toolbar, textvariable=self.filter_var,
                           values=["All", "Available", "No AppID"],
                           state="readonly", width=14)
        fil.pack(side="left", padx=(0, 12))
        fil.bind("<<ComboboxSelected>>", self._filter_games)

        self._btn(toolbar, "⬇ Download Selected",
                  self._download_selected, color=PALETTE["accent2"]).pack(
            side="left", padx=4)
        self._btn(toolbar, "⬇ Download All",
                  self._bulk_download_all, color=PALETTE["green"]).pack(
            side="left", padx=4)
        self._btn(toolbar, "📋 Gen Manifests",
                  self._gen_selected_manifests).pack(side="left", padx=4)
        self._btn(toolbar, "🔧 Gen Lua",
                  self._gen_selected_lua).pack(side="left", padx=4)

        cols = ("name", "appid", "size", "status")
        self.games_tree = ttk.Treeview(f, columns=cols, show="headings", selectmode="extended")
        self.games_tree.heading("name", text="Game Name")
        self.games_tree.heading("appid", text="AppID")
        self.games_tree.heading("size", text="Size")
        self.games_tree.heading("status", text="Status")
        self.games_tree.column("name", width=400, minwidth=200)
        self.games_tree.column("appid", width=120, minwidth=80)
        self.games_tree.column("size", width=100, minwidth=80)
        self.games_tree.column("status", width=120, minwidth=80)

        sb = ttk.Scrollbar(f, orient="vertical", command=self.games_tree.yview)
        self.games_tree.configure(yscrollcommand=sb.set)
        self.games_tree.pack(side="left", fill="both", expand=True, padx=(12, 0), pady=(0, 12))
        sb.pack(side="right", fill="y", pady=(0, 12), padx=(0, 12))

        self.games_tree.tag_configure("available", foreground=PALETTE["text"])
        self.games_tree.tag_configure("na", foreground=PALETTE["text_dim"])
        self.games_tree.tag_configure("installed", foreground=PALETTE["green"])

    def _load_game_list(self):
        for row in self.games_tree.get_children():
            self.games_tree.delete(row)
        q = self.search_var.get().lower() if hasattr(self, "search_var") else ""
        fil = self.filter_var.get() if hasattr(self, "filter_var") else "All"
        for g in FAMOUS_GAMES:
            if q and q not in g["name"].lower() and q not in g["appid"].lower():
                continue
            if fil == "Available" and g["appid"] in ("unavailable", "cold", "N/A"):
                continue
            if fil == "No AppID" and g["appid"] not in ("unavailable", "cold"):
                continue
            avail = g["appid"] not in ("unavailable", "cold")
            installed = g["appid"] in self.config_data.get("installed_apps", [])
            tag = "installed" if installed else ("available" if avail else "na")
            status = "Installed" if installed else ("Available" if avail else "No AppID")
            self.games_tree.insert("", "end",
                                    values=(g["name"], g["appid"], g["size"], status),
                                    tags=(tag,))

    def _filter_games(self, *_):
        self._load_game_list()

    # ─── MANIFEST TAB ─────────────────────────────────────────────────────────

    def _tab_manifest(self, nb):
        f = tk.Frame(nb, bg=PALETTE["bg"])
        nb.add(f, text="  Manifest Editor  ")

        top = tk.Frame(f, bg=PALETTE["bg"])
        top.pack(fill="x", padx=12, pady=10)

        self._label(top, "AppID:").pack(side="left")
        self.manifest_appid = self._entry(top, width=14)
        self.manifest_appid.pack(side="left", padx=6)

        self._label(top, "Depot IDs (comma sep):").pack(side="left", padx=(12, 0))
        self.manifest_depots = self._entry(top, width=30)
        self.manifest_depots.pack(side="left", padx=6)

        self._label(top, "Manifest IDs (comma sep):").pack(side="left", padx=(12, 0))
        self.manifest_ids = self._entry(top, width=30)
        self.manifest_ids.pack(side="left", padx=6)

        btn_row = tk.Frame(f, bg=PALETTE["bg"])
        btn_row.pack(fill="x", padx=12, pady=4)
        self._btn(btn_row, "Generate Manifest", self._gen_manifest_preview,
                  color=PALETTE["accent2"]).pack(side="left", padx=4)
        self._btn(btn_row, "Save .acf File", self._save_manifest_file).pack(
            side="left", padx=4)
        self._btn(btn_row, "Load .acf File", self._load_manifest_file).pack(
            side="left", padx=4)
        self._btn(btn_row, "Clear", lambda: self.manifest_text.delete("1.0", "end")).pack(
            side="left", padx=4)

        self.manifest_text = scrolledtext.ScrolledText(
            f, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 10),
            relief="flat")
        self.manifest_text.pack(fill="both", expand=True, padx=12, pady=(4, 12))

    def _gen_manifest_preview(self):
        appid = self.manifest_appid.get().strip()
        if not appid:
            messagebox.showwarning("SteamKit", "Enter an AppID")
            return
        raw_depots = self.manifest_depots.get().strip()
        raw_ids = self.manifest_ids.get().strip()
        depots = {}
        if raw_depots and raw_ids:
            d_list = [x.strip() for x in raw_depots.split(",")]
            i_list = [x.strip() for x in raw_ids.split(",")]
            for idx, d in enumerate(d_list):
                mid = i_list[idx] if idx < len(i_list) else "0"
                depots[d] = mid
        m = generate_manifest(appid, depots if depots else None)
        vdf = f'"AppState"\n{{\n{manifest_to_vdf(m["AppState"], 1)}\n}}'
        self.manifest_text.delete("1.0", "end")
        self.manifest_text.insert("1.0", vdf)

    def _save_manifest_file(self):
        content = self.manifest_text.get("1.0", "end").strip()
        if not content:
            messagebox.showwarning("SteamKit", "Nothing to save")
            return
        appid = self.manifest_appid.get().strip() or "app"
        out_dir = self._get_output_dir()
        path = os.path.join(out_dir, "manifests", f"appmanifest_{appid}.acf")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(content)
        self._log(f"Saved manifest → {path}", "green")
        messagebox.showinfo("SteamKit", f"Saved to:\n{path}")

    def _load_manifest_file(self):
        p = filedialog.askopenfilename(filetypes=[("ACF files", "*.acf"), ("All", "*.*")])
        if p:
            with open(p, "r") as fh:
                self.manifest_text.delete("1.0", "end")
                self.manifest_text.insert("1.0", fh.read())

    # ─── LUA TAB ──────────────────────────────────────────────────────────────

    def _tab_lua(self, nb):
        f = tk.Frame(nb, bg=PALETTE["bg"])
        nb.add(f, text="  Lua Config  ")

        top = tk.Frame(f, bg=PALETTE["bg"])
        top.pack(fill="x", padx=12, pady=10)

        self._label(top, "AppID:").pack(side="left")
        self.lua_appid = self._entry(top, width=12)
        self.lua_appid.pack(side="left", padx=6)

        self.lua_unlocked = tk.BooleanVar(value=True)
        tk.Checkbutton(top, text="Unlocked", variable=self.lua_unlocked,
                       bg=PALETTE["bg"], fg=PALETTE["text"],
                       selectcolor=PALETTE["surface2"],
                       activebackground=PALETTE["bg"],
                       activeforeground=PALETTE["text"]).pack(side="left", padx=8)

        btn_row = tk.Frame(f, bg=PALETTE["bg"])
        btn_row.pack(fill="x", padx=12, pady=4)
        self._btn(btn_row, "Generate Lua Config", self._gen_lua_preview,
                  color=PALETTE["accent2"]).pack(side="left", padx=4)
        self._btn(btn_row, "Save .lua File", self._save_lua_file).pack(side="left", padx=4)
        self._btn(btn_row, "Load .lua File", self._load_lua_file).pack(side="left", padx=4)
        self._btn(btn_row, "Clear", lambda: self.lua_text.delete("1.0", "end")).pack(
            side="left", padx=4)

        # depot section inside lua
        dep_frame = tk.LabelFrame(f, text=" Depot Entries ", bg=PALETTE["bg"],
                                   fg=PALETTE["accent"], font=("Segoe UI", 9, "bold"),
                                   bd=1, relief="flat",
                                   highlightbackground=PALETTE["border"], highlightthickness=1)
        dep_frame.pack(fill="x", padx=12, pady=6)
        dep_row = tk.Frame(dep_frame, bg=PALETTE["bg"])
        dep_row.pack(fill="x", padx=8, pady=6)
        self._label(dep_row, "Depot ID:").pack(side="left")
        self.lua_depot_id = self._entry(dep_row, width=12)
        self.lua_depot_id.pack(side="left", padx=4)
        self._label(dep_row, "Branch:").pack(side="left", padx=(8, 0))
        self.lua_depot_branch = self._entry(dep_row, width=16)
        self.lua_depot_branch.insert(0, "public")
        self.lua_depot_branch.pack(side="left", padx=4)
        self._btn(dep_row, "+ Add Depot", self._add_depot_to_lua).pack(
            side="left", padx=8)
        self.lua_depots_list = {}

        self.lua_text = scrolledtext.ScrolledText(
            f, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 10),
            relief="flat")
        self.lua_text.pack(fill="both", expand=True, padx=12, pady=(0, 12))

    def _add_depot_to_lua(self):
        did = self.lua_depot_id.get().strip()
        branch = self.lua_depot_branch.get().strip()
        if did:
            self.lua_depots_list[did] = branch
            self._log(f"Added depot {did} → {branch}")

    def _gen_lua_preview(self):
        appid = self.lua_appid.get().strip()
        if not appid:
            messagebox.showwarning("SteamKit", "Enter an AppID")
            return
        lua = generate_lua_config(appid, self.lua_depots_list or None,
                                   self.lua_unlocked.get())
        self.lua_text.delete("1.0", "end")
        self.lua_text.insert("1.0", lua)

    def _save_lua_file(self):
        content = self.lua_text.get("1.0", "end").strip()
        if not content:
            messagebox.showwarning("SteamKit", "Nothing to save")
            return
        appid = self.lua_appid.get().strip() or "app"
        out_dir = self._get_output_dir()
        path = os.path.join(out_dir, "lua", f"{appid}.lua")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(content)
        self._log(f"Saved Lua config → {path}", "green")
        messagebox.showinfo("SteamKit", f"Saved to:\n{path}")

    def _load_lua_file(self):
        p = filedialog.askopenfilename(filetypes=[("Lua files", "*.lua"), ("All", "*.*")])
        if p:
            with open(p, "r") as fh:
                self.lua_text.delete("1.0", "end")
                self.lua_text.insert("1.0", fh.read())

    # ─── DEPOT CONFIG TAB ────────────────────────────────────────────────────

    def _tab_depot(self, nb):
        f = tk.Frame(nb, bg=PALETTE["bg"])
        nb.add(f, text="  Depot Config  ")

        left = tk.Frame(f, bg=PALETTE["bg"])
        left.pack(side="left", fill="both", expand=True, padx=(12, 6), pady=12)

        right = tk.Frame(f, bg=PALETTE["bg"])
        right.pack(side="right", fill="both", expand=True, padx=(6, 12), pady=12)

        # left: depot table
        tk.Label(left, text="Depot Pins", bg=PALETTE["bg"], fg=PALETTE["accent"],
                 font=("Segoe UI", 11, "bold")).pack(anchor="w", pady=(0, 6))

        cols = ("depot_id", "branch", "appid")
        self.depot_tree = ttk.Treeview(left, columns=cols, show="headings", height=15)
        self.depot_tree.heading("depot_id", text="Depot ID")
        self.depot_tree.heading("branch", text="Branch")
        self.depot_tree.heading("appid", text="AppID")
        self.depot_tree.column("depot_id", width=120)
        self.depot_tree.column("branch", width=120)
        self.depot_tree.column("appid", width=100)
        sb2 = ttk.Scrollbar(left, orient="vertical", command=self.depot_tree.yview)
        self.depot_tree.configure(yscrollcommand=sb2.set)
        self.depot_tree.pack(side="left", fill="both", expand=True)
        sb2.pack(side="right", fill="y")

        self._load_depot_pins()

        # right: add/edit panel
        edit = tk.LabelFrame(right, text=" Add / Edit Depot Pin ", bg=PALETTE["bg"],
                              fg=PALETTE["accent"], font=("Segoe UI", 9, "bold"),
                              bd=1, relief="flat",
                              highlightbackground=PALETTE["border"], highlightthickness=1)
        edit.pack(fill="x")

        def row(lbl):
            r = tk.Frame(edit, bg=PALETTE["bg"])
            r.pack(fill="x", padx=8, pady=4)
            self._label(r, lbl, dim=True).pack(anchor="w")
            e = self._entry(r, width=30)
            e.pack(fill="x")
            return e

        self.depot_edit_id = row("Depot ID")
        self.depot_edit_branch = row("Branch (e.g. public)")
        self.depot_edit_appid = row("AppID")

        btn_r = tk.Frame(edit, bg=PALETTE["bg"])
        btn_r.pack(fill="x", padx=8, pady=8)
        self._btn(btn_r, "Add / Update", self._save_depot_pin,
                  color=PALETTE["accent2"]).pack(side="left", padx=4)
        self._btn(btn_r, "Remove Selected", self._remove_depot_pin,
                  color=PALETTE["red"]).pack(side="left", padx=4)
        self._btn(btn_r, "Export Depot Config", self._export_depot_config).pack(
            side="left", padx=4)

        # per-depot advanced
        adv = tk.LabelFrame(right, text=" Per-Depot Advanced Settings ", bg=PALETTE["bg"],
                             fg=PALETTE["accent"], font=("Segoe UI", 9, "bold"),
                             bd=1, relief="flat",
                             highlightbackground=PALETTE["border"], highlightthickness=1)
        adv.pack(fill="x", pady=10)

        self.depot_pin_manifest = row
        r2 = tk.Frame(adv, bg=PALETTE["bg"])
        r2.pack(fill="x", padx=8, pady=4)
        self._label(r2, "Pin to Manifest ID:", dim=True).pack(anchor="w")
        self.depot_manifest_pin = self._entry(r2, width=30)
        self.depot_manifest_pin.pack(fill="x")

        r3 = tk.Frame(adv, bg=PALETTE["bg"])
        r3.pack(fill="x", padx=8, pady=4)
        self.depot_os_override = tk.StringVar(value="any")
        self._label(r3, "OS Override:", dim=True).pack(anchor="w")
        ttk.Combobox(r3, textvariable=self.depot_os_override,
                     values=["any", "windows", "linux", "macos"],
                     state="readonly").pack(fill="x")

    def _load_depot_pins(self):
        for row in self.depot_tree.get_children():
            self.depot_tree.delete(row)
        for depot_id, info in self.config_data.get("depot_pins", {}).items():
            self.depot_tree.insert("", "end",
                                    values=(depot_id, info.get("branch", "public"),
                                            info.get("appid", "")))

    def _save_depot_pin(self):
        did = self.depot_edit_id.get().strip()
        branch = self.depot_edit_branch.get().strip() or "public"
        appid = self.depot_edit_appid.get().strip()
        if not did:
            messagebox.showwarning("SteamKit", "Enter a Depot ID")
            return
        if "depot_pins" not in self.config_data:
            self.config_data["depot_pins"] = {}
        self.config_data["depot_pins"][did] = {"branch": branch, "appid": appid}
        save_config(self.config_data)
        self._load_depot_pins()
        self._log(f"Saved depot pin: {did} → {branch}", "green")

    def _remove_depot_pin(self):
        sel = self.depot_tree.selection()
        for item in sel:
            did = self.depot_tree.item(item, "values")[0]
            self.config_data.get("depot_pins", {}).pop(did, None)
        save_config(self.config_data)
        self._load_depot_pins()

    def _export_depot_config(self):
        pins = self.config_data.get("depot_pins", {})
        if not pins:
            messagebox.showinfo("SteamKit", "No depot pins configured")
            return
        lua_lines = ["-- SteamKit Manager - Depot Config\n\nreturn {\n  depots = {"]
        for did, info in pins.items():
            lua_lines.append(f'    ["{did}"] = {{ branch = "{info["branch"]}", appid = "{info["appid"]}" }},')
        lua_lines.append("  },\n}")
        out_dir = self._get_output_dir()
        path = os.path.join(out_dir, "depot_config.lua")
        os.makedirs(out_dir, exist_ok=True)
        with open(path, "w") as fh:
            fh.write("\n".join(lua_lines))
        self._log(f"Exported depot config → {path}", "green")
        messagebox.showinfo("SteamKit", f"Exported to:\n{path}")

    # ─── SETTINGS TAB ─────────────────────────────────────────────────────────

    def _tab_settings(self, nb):
        f = tk.Frame(nb, bg=PALETTE["bg"])
        nb.add(f, text="  Settings  ")

        def path_row(parent, lbl, var_name):
            row = tk.Frame(parent, bg=PALETTE["bg"])
            row.pack(fill="x", padx=12, pady=6)
            self._label(row, lbl, dim=True).pack(anchor="w")
            e_row = tk.Frame(row, bg=PALETTE["bg"])
            e_row.pack(fill="x")
            var = tk.StringVar(value=self.config_data.get(var_name, ""))
            setattr(self, f"cfg_{var_name}", var)
            e = self._entry(e_row, textvariable=var)
            e.pack(side="left", fill="x", expand=True, padx=(0, 6))
            self._btn(e_row, "Browse", lambda v=var: self._browse_dir(v)).pack(side="right")

        sec = tk.LabelFrame(f, text=" Paths ", bg=PALETTE["bg"], fg=PALETTE["accent"],
                             font=("Segoe UI", 10, "bold"), bd=1, relief="flat",
                             highlightbackground=PALETTE["border"], highlightthickness=1)
        sec.pack(fill="x", padx=16, pady=12)

        path_row(sec, "Steam Installation Path", "steam_path")
        path_row(sec, "Millennium Client Path", "millennium_path")
        path_row(sec, "Manifest Output Directory", "manifest_dir")
        path_row(sec, "Lua Config Output Directory", "lua_config_dir")

        sec2 = tk.LabelFrame(f, text=" Options ", bg=PALETTE["bg"], fg=PALETTE["accent"],
                              font=("Segoe UI", 10, "bold"), bd=1, relief="flat",
                              highlightbackground=PALETTE["border"], highlightthickness=1)
        sec2.pack(fill="x", padx=16, pady=6)

        self.opt_auto_lua = tk.BooleanVar(value=True)
        tk.Checkbutton(sec2, text="Auto-generate Lua configs on manifest creation",
                       variable=self.opt_auto_lua, bg=PALETTE["bg"], fg=PALETTE["text"],
                       selectcolor=PALETTE["surface2"],
                       activebackground=PALETTE["bg"],
                       activeforeground=PALETTE["text"]).pack(anchor="w", padx=12, pady=4)

        self.opt_open_after = tk.BooleanVar(value=False)
        tk.Checkbutton(sec2, text="Open output folder after generation",
                       variable=self.opt_open_after, bg=PALETTE["bg"], fg=PALETTE["text"],
                       selectcolor=PALETTE["surface2"],
                       activebackground=PALETTE["bg"],
                       activeforeground=PALETTE["text"]).pack(anchor="w", padx=12, pady=4)

        save_btn = self._btn(f, "Save Settings", self._save_settings,
                             color=PALETTE["accent2"])
        save_btn.pack(padx=16, pady=12, anchor="w", ipady=4, ipadx=12)

    def _browse_dir(self, var):
        d = filedialog.askdirectory()
        if d:
            var.set(d)

    def _save_settings(self):
        for key in ("steam_path", "millennium_path", "manifest_dir", "lua_config_dir"):
            var = getattr(self, f"cfg_{key}", None)
            if var:
                self.config_data[key] = var.get()
        save_config(self.config_data)
        self._log("Settings saved", "green")
        messagebox.showinfo("SteamKit", "Settings saved!")

    # ─── LOG TAB ──────────────────────────────────────────────────────────────

    def _tab_log(self, nb):
        f = tk.Frame(nb, bg=PALETTE["bg"])
        nb.add(f, text="  Log  ")

        btn_row = tk.Frame(f, bg=PALETTE["bg"])
        btn_row.pack(fill="x", padx=12, pady=8)
        self._btn(btn_row, "Clear Log", self._clear_main_log).pack(side="left")

        self.main_log = scrolledtext.ScrolledText(
            f, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 9),
            relief="flat")
        self.main_log.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        self.main_log.tag_configure("green", foreground=PALETTE["green"])
        self.main_log.tag_configure("red", foreground=PALETTE["red"])
        self.main_log.tag_configure("yellow", foreground=PALETTE["yellow"])
        self.main_log.tag_configure("blue", foreground=PALETTE["accent"])

    def _clear_main_log(self):
        self.main_log.config(state="normal")
        self.main_log.delete("1.0", "end")
        self.main_log.config(state="disabled")

    # ─── HELPERS ─────────────────────────────────────────────────────────────

    def _get_output_dir(self):
        d = self.config_data.get("manifest_dir") or os.path.join(
            os.path.expanduser("~"), "SteamKitOutput")
        os.makedirs(d, exist_ok=True)
        return d

    def _log(self, msg, color=None):
        ts = time.strftime("%H:%M:%S")
        full = f"[{ts}] {msg}\n"
        for widget in (self.main_log, self.dashboard_log):
            widget.config(state="normal")
            widget.insert("end", full, color or "")
            widget.see("end")
            widget.config(state="disabled")

    def _set_status(self, text, color="green"):
        self.status_label.config(text=f"● {text}", fg=PALETTE[color])

    def _open_output_folder(self):
        d = self._get_output_dir()
        if os.name == "nt":
            os.startfile(d)
        else:
            subprocess.Popen(["xdg-open", d])

    # ─── GENERATION ──────────────────────────────────────────────────────────

    def _gen_all_manifests(self):
        out_dir = self._get_output_dir()
        m_dir = os.path.join(out_dir, "manifests")
        os.makedirs(m_dir, exist_ok=True)
        count = 0
        for g in FAMOUS_GAMES:
            if g["appid"] in ("unavailable", "cold"):
                continue
            m = generate_manifest(g["appid"])
            vdf = f'"AppState"\n{{\n{manifest_to_vdf(m["AppState"], 1)}\n}}'
            path = os.path.join(m_dir, f"appmanifest_{g['appid']}.acf")
            with open(path, "w") as fh:
                fh.write(vdf)
            count += 1
        self._log(f"Generated {count} manifest files → {m_dir}", "green")
        messagebox.showinfo("SteamKit", f"Generated {count} manifests in:\n{m_dir}")

    def _gen_all_lua(self):
        out_dir = self._get_output_dir()
        lua_dir = os.path.join(out_dir, "lua")
        os.makedirs(lua_dir, exist_ok=True)
        count = 0
        for g in FAMOUS_GAMES:
            if g["appid"] in ("unavailable", "cold"):
                continue
            lua = generate_lua_config(g["appid"])
            path = os.path.join(lua_dir, f"{g['appid']}.lua")
            with open(path, "w") as fh:
                fh.write(lua)
            count += 1
        self._log(f"Generated {count} Lua config files → {lua_dir}", "green")
        messagebox.showinfo("SteamKit", f"Generated {count} Lua configs in:\n{lua_dir}")

    def _gen_selected_manifests(self):
        sel = self.games_tree.selection()
        if not sel:
            messagebox.showwarning("SteamKit", "Select games first")
            return
        out_dir = self._get_output_dir()
        m_dir = os.path.join(out_dir, "manifests")
        os.makedirs(m_dir, exist_ok=True)
        count = 0
        for item in sel:
            vals = self.games_tree.item(item, "values")
            appid = vals[1]
            if appid in ("unavailable", "cold"):
                continue
            m = generate_manifest(appid)
            vdf = f'"AppState"\n{{\n{manifest_to_vdf(m["AppState"], 1)}\n}}'
            path = os.path.join(m_dir, f"appmanifest_{appid}.acf")
            with open(path, "w") as fh:
                fh.write(vdf)
            count += 1
        self._log(f"Generated {count} manifests for selected games", "green")

    def _gen_selected_lua(self):
        sel = self.games_tree.selection()
        if not sel:
            messagebox.showwarning("SteamKit", "Select games first")
            return
        out_dir = self._get_output_dir()
        lua_dir = os.path.join(out_dir, "lua")
        os.makedirs(lua_dir, exist_ok=True)
        count = 0
        for item in sel:
            vals = self.games_tree.item(item, "values")
            appid = vals[1]
            if appid in ("unavailable", "cold"):
                continue
            lua = generate_lua_config(appid)
            path = os.path.join(lua_dir, f"{appid}.lua")
            with open(path, "w") as fh:
                fh.write(lua)
            count += 1
        self._log(f"Generated {count} Lua configs for selected games", "green")

    # ─── DOWNLOAD ─────────────────────────────────────────────────────────────

    def _download_selected(self):
        sel = self.games_tree.selection()
        if not sel:
            messagebox.showwarning("SteamKit", "Select games first")
            return
        appids = []
        for item in sel:
            vals = self.games_tree.item(item, "values")
            appid = vals[1]
            if appid not in ("unavailable", "cold"):
                appids.append((vals[0], appid))
        threading.Thread(target=self._run_download_batch, args=(appids,), daemon=True).start()

    def _bulk_download_all(self):
        appids = [(g["name"], g["appid"]) for g in FAMOUS_GAMES
                  if g["appid"] not in ("unavailable", "cold")]
        if not messagebox.askyesno(
            "SteamKit",
            f"Generate manifests + Lua configs for {len(appids)} games?\n\n"
            "This will create all manifest (.acf) and Lua config files\n"
            "in your output folder. Files are ready to use with\n"
            "Millennium/Steam Tools.\n\nContinue?"):
            return
        threading.Thread(target=self._run_download_batch, args=(appids,), daemon=True).start()

    def _run_download_batch(self, appids):
        self._set_status("Working...", "yellow")
        out_dir = self._get_output_dir()
        m_dir = os.path.join(out_dir, "manifests")
        lua_dir = os.path.join(out_dir, "lua")
        os.makedirs(m_dir, exist_ok=True)
        os.makedirs(lua_dir, exist_ok=True)

        total = len(appids)
        done = 0

        for name, appid in appids:
            try:
                # generate manifest
                m = generate_manifest(appid)
                vdf = f'"AppState"\n{{\n{manifest_to_vdf(m["AppState"], 1)}\n}}'
                mpath = os.path.join(m_dir, f"appmanifest_{appid}.acf")
                with open(mpath, "w") as fh:
                    fh.write(vdf)

                # generate lua
                lua = generate_lua_config(appid)
                lpath = os.path.join(lua_dir, f"{appid}.lua")
                with open(lpath, "w") as fh:
                    fh.write(lua)

                # track installed
                if appid not in self.config_data.get("installed_apps", []):
                    self.config_data.setdefault("installed_apps", []).append(appid)

                done += 1
                pct = (done / total) * 100
                self.progress_var.set(pct)
                self.progress_text.config(text=f"{done}/{total} — {name}")
                self._log(f"✓ {name} (AppID: {appid})", "green")

            except Exception as e:
                self._log(f"✗ {name} — {e}", "red")

        save_config(self.config_data)
        self._load_game_list()
        self.progress_text.config(text=f"Done! {done}/{total} processed")
        self._set_status("Done", "green")
        self._log(f"\nBatch complete: {done}/{total} games processed", "blue")
        self._log(f"Manifests → {m_dir}", "blue")
        self._log(f"Lua configs → {lua_dir}", "blue")

        if self.opt_open_after.get():
            self._open_output_folder()


if __name__ == "__main__":
    app = SteamKitApp()
    app.mainloop()
