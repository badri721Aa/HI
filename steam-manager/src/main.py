import tkinter as tk
from tkinter import ttk, messagebox, filedialog, scrolledtext
import json, os, subprocess, threading, shutil, time, sys
from pathlib import Path

APP_TITLE = "SteamKit Manager"
VERSION   = "3.0.0"
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".steamkit_manager.json")

# ── palette ──────────────────────────────────────────────────────────────────
P = {
    "bg":      "#0d1117", "surface": "#161b22", "sf2": "#21262d",
    "sf3":     "#2d333b", "border":  "#30363d",
    "accent":  "#58a6ff", "accent2": "#1f6feb",
    "green":   "#3fb950", "red":     "#f85149",
    "yellow":  "#e3b341", "purple":  "#bc8cff",
    "orange":  "#f0883e", "text":    "#e6edf3",
    "dim":     "#8b949e",
}

# ── games list (500+) ─────────────────────────────────────────────────────────
GAMES = [
    # FPS
    ("Counter-Strike 2",              "730",     "FPS",          "25 GB"),
    ("Team Fortress 2",               "440",     "FPS",          "15 GB"),
    ("Left 4 Dead 2",                 "550",     "FPS",          "13 GB"),
    ("DOOM Eternal",                  "782330",  "FPS",          "50 GB"),
    ("Doom: The Dark Ages",           "2996580", "FPS",          "100 GB"),
    ("Doom + Doom II",                "2280",    "FPS",          "1 GB"),
    ("Titanfall 2",                   "1237970", "FPS",          "48 GB"),
    ("Ultrakill",                     "1229490", "FPS",          "2 GB"),
    ("Deathloop",                     "1252330", "FPS",          "30 GB"),
    ("Prodeus",                       "964800",  "FPS",          "2 GB"),
    ("Ion Fury",                      "562860",  "FPS",          "1 GB"),
    ("Dusk",                          "519860",  "FPS",          "1 GB"),
    ("System Shock (2023)",           "482400",  "FPS",          "15 GB"),
    ("Metro Exodus",                  "412020",  "FPS",          "59 GB"),
    ("S.T.A.L.K.E.R. 2",             "1643320", "FPS",          "150 GB"),
    ("Atomic Heart",                  "668580",  "FPS",          "40 GB"),
    ("Ghostrunner",                   "1139900", "FPS",          "10 GB"),
    ("Ghostrunner 2",                 "2240850", "FPS",          "20 GB"),
    ("Neon White",                    "1533420", "FPS",          "4 GB"),
    ("Half-Life: Alyx",               "546560",  "FPS",          "67 GB"),
    ("Halo: MCC",                     "976730",  "FPS",          "100 GB"),
    ("Battlefield 2042",              "1517290", "FPS",          "100 GB"),
    ("Battlefield 1",                 "1238840", "FPS",          "80 GB"),
    ("Battlefield V",                 "1238810", "FPS",          "80 GB"),
    ("Far Cry 6",                     "2369390", "FPS",          "60 GB"),
    ("Rainbow Six Siege",             "359550",  "FPS",          "50 GB"),
    ("Hunt: Showdown",                "594650",  "FPS",          "30 GB"),
    ("Ready or Not",                  "1144200", "FPS",          "50 GB"),
    ("Insurgency: Sandstorm",         "581320",  "FPS",          "40 GB"),
    ("Hell Let Loose",                "686810",  "FPS",          "30 GB"),
    ("Squad",                         "393380",  "FPS",          "25 GB"),
    ("Arma 3",                        "107410",  "FPS",          "50 GB"),
    ("ARMA Reforger",                 "1874880", "FPS",          "18 GB"),
    ("Destiny 2",                     "1085660", "FPS",          "100 GB"),
    ("Warframe",                      "230410",  "FPS",          "35 GB"),
    ("Back 4 Blood",                  "924970",  "FPS",          "50 GB"),
    ("Deep Rock Galactic",            "548430",  "FPS",          "8 GB"),
    # Action RPG
    ("Elden Ring",                    "1245620", "Action RPG",   "60 GB"),
    ("Elden Ring: Shadow of Erdtree", "2778580", "Action RPG",   "8 GB"),
    ("Cyberpunk 2077",                "1091500", "Action RPG",   "70 GB"),
    ("The Witcher 3",                 "292030",  "Action RPG",   "50 GB"),
    ("Dark Souls III",                "374320",  "Action RPG",   "15 GB"),
    ("Sekiro: Shadows Die Twice",     "814380",  "Action RPG",   "12 GB"),
    ("Nioh 2",                        "1325200", "Action RPG",   "50 GB"),
    ("Wo Long: Fallen Dynasty",       "2118810", "Action RPG",   "30 GB"),
    ("Lies of P",                     "1627720", "Action RPG",   "22 GB"),
    ("Lords of the Fallen",           "1501750", "Action RPG",   "45 GB"),
    ("Monster Hunter: World",         "582010",  "Action RPG",   "48 GB"),
    ("Monster Hunter Rise",           "1446780", "Action RPG",   "23 GB"),
    ("Monster Hunter Wilds",          "2246340", "Action RPG",   "75 GB"),
    ("Wild Hearts",                   "2046960", "Action RPG",   "50 GB"),
    ("Black Myth: Wukong",            "2358720", "Action RPG",   "130 GB"),
    ("Hogwarts Legacy",               "990080",  "Action RPG",   "76 GB"),
    ("Immortals Fenyx Rising",        "1278060", "Action RPG",   "40 GB"),
    ("Assassin's Creed Valhalla",     "2208920", "Action RPG",   "50 GB"),
    ("Assassin's Creed Shadows",      "2933620", "Action RPG",   "80 GB"),
    ("Horizon Zero Dawn Remastered",  "1151640", "Action RPG",   "72 GB"),
    ("Ghost of Tsushima",             "2215430", "Action RPG",   "75 GB"),
    ("Avowed",                        "2457220", "Action RPG",   "60 GB"),
    ("Dragon Age: The Veilguard",     "1845910", "Action RPG",   "100 GB"),
    # RPG
    ("Baldur's Gate 3",               "1086940", "RPG",          "122 GB"),
    ("The Witcher 3 (GOTY)",          "292030",  "RPG",          "50 GB"),
    ("Disco Elysium",                 "632470",  "RPG",          "20 GB"),
    ("Divinity: Original Sin 2",      "435150",  "RPG",          "45 GB"),
    ("Pathfinder: WotR",              "1184370", "RPG",          "40 GB"),
    ("Starfield",                     "1716740", "RPG",          "125 GB"),
    ("Skyrim Special Edition",        "489830",  "RPG",          "12 GB"),
    ("Fallout 4",                     "377160",  "RPG",          "30 GB"),
    ("Fallout 76",                    "1151340", "RPG",          "110 GB"),
    ("Mass Effect Legendary",         "1328670", "RPG",          "120 GB"),
    ("Dragon Age: Inquisition",       "1222690", "RPG",          "26 GB"),
    ("Kingdom Come: Deliverance II",  "1747490", "RPG",          "100 GB"),
    ("Oblivion Remastered",           "2623190", "RPG",          "120 GB"),
    ("Kenshi",                        "233860",  "RPG",          "12 GB"),
    ("Mount & Blade II: Bannerlord",  "261550",  "RPG",          "30 GB"),
    ("Wartales",                      "1527950", "RPG",          "8 GB"),
    # JRPG
    ("Persona 5 Royal",               "1687950", "JRPG",         "22 GB"),
    ("Persona 4 Golden",              "1113000", "JRPG",         "15 GB"),
    ("Persona 3 Reload",              "2161700", "JRPG",         "25 GB"),
    ("Metaphor: ReFantazio",          "2679460", "JRPG",         "30 GB"),
    ("Final Fantasy XVI",             "2515020", "JRPG",         "100 GB"),
    ("Final Fantasy VII Remake",      "1462040", "JRPG",         "84 GB"),
    ("Final Fantasy VII Rebirth",     "2909400", "JRPG",         "150 GB"),
    ("Final Fantasy XIV Online",      "39210",   "JRPG",         "80 GB"),
    ("Like a Dragon: Ishin!",         "1842650", "JRPG",         "44 GB"),
    ("Like a Dragon: Inf. Wealth",    "2155230", "JRPG",         "58 GB"),
    ("Clair Obscur: Expedition 33",   "2933300", "JRPG",         "35 GB"),
    # Action / Adventure
    ("God of War",                    "1593500", "Action",       "34 GB"),
    ("God of War Ragnarök",           "2322010", "Action",       "190 GB"),
    ("Spider-Man Remastered",         "1817070", "Action",       "75 GB"),
    ("Spider-Man: Miles Morales",     "1817190", "Action",       "50 GB"),
    ("Spider-Man 2",                  "2459660", "Action",       "80 GB"),
    ("Armored Core VI",               "1888160", "Action",       "60 GB"),
    ("Warhammer 40K: Space Marine 2", "2183900", "Action",       "75 GB"),
    ("Ghostwire: Tokyo",              "1475810", "Action",       "20 GB"),
    ("Sifu",                          "1835780", "Action",       "14 GB"),
    ("Kena: Bridge of Spirits",       "1581630", "Action",       "30 GB"),
    ("Assassin's Creed Mirage",       "2461810", "Action",       "40 GB"),
    ("Control",                       "870780",  "Action",       "40 GB"),
    ("Ghostrunner",                   "1139900", "Action",       "10 GB"),
    ("Death Stranding",               "1190460", "Action",       "55 GB"),
    ("South of Midnight",             "2594450", "Action",       "50 GB"),
    ("Star Wars Jedi: Survivor",      "1774580", "Action",       "155 GB"),
    ("Star Wars Jedi: Fallen Order",  "1172380", "Action",       "48 GB"),
    ("Indiana Jones: Great Circle",   "2677660", "Action",       "100 GB"),
    ("Ratchet & Clank: Rift Apart",   "1895880", "Action",       "60 GB"),
    ("The Last of Us Part I",         "1888930", "Action",       "100 GB"),
    ("The Last of Us Part II",        "2531310", "Action",       "100 GB"),
    ("A Plague Tale: Requiem",        "1182900", "Action",       "55 GB"),
    ("A Plague Tale: Innocence",      "752590",  "Action",       "34 GB"),
    ("Watch Dogs: Legion",            "2314630", "Action",       "50 GB"),
    # Horror
    ("Resident Evil Village",         "1196590", "Horror",       "35 GB"),
    ("Resident Evil 4 Remake",        "2050650", "Horror",       "67 GB"),
    ("Resident Evil 2 Remake",        "883710",  "Horror",       "26 GB"),
    ("Resident Evil 3 Remake",        "952060",  "Horror",       "20 GB"),
    ("Resident Evil 7",               "418370",  "Horror",       "25 GB"),
    ("Alan Wake 2",                   "1903790", "Horror",       "90 GB"),
    ("Dead Space Remake",             "1693980", "Horror",       "50 GB"),
    ("Callisto Protocol",             "1272130", "Horror",       "44 GB"),
    ("Phasmophobia",                  "739630",  "Horror",       "16 GB"),
    ("SOMA",                          "282140",  "Horror",       "20 GB"),
    ("Amnesia: Rebirth",              "999220",  "Horror",       "10 GB"),
    ("Little Nightmares II",          "860510",  "Horror",       "12 GB"),
    ("The Forest",                    "242760",  "Horror",       "4 GB"),
    ("Sons Of The Forest",            "1326470", "Horror",       "16 GB"),
    # Survival
    ("Valheim",                       "892970",  "Survival",     "4 GB"),
    ("Rust",                          "252490",  "Survival",     "22 GB"),
    ("DayZ",                          "221100",  "Survival",     "16 GB"),
    ("Project Zomboid",               "108600",  "Survival",     "3 GB"),
    ("ARK: Survival Evolved",         "346110",  "Survival",     "400 GB"),
    ("ARK: Survival Ascended",        "2399830", "Survival",     "60 GB"),
    ("Palworld",                      "1623730", "Survival",     "45 GB"),
    ("Enshrouded",                    "1203620", "Survival",     "12 GB"),
    ("V Rising",                      "1604030", "Survival",     "8 GB"),
    ("Grounded",                      "962130",  "Survival",     "8 GB"),
    ("Green Hell",                    "815370",  "Survival",     "8 GB"),
    ("Subnautica",                    "264710",  "Survival",     "9 GB"),
    ("Subnautica: Below Zero",        "848450",  "Survival",     "9 GB"),
    ("This War of Mine",              "282070",  "Survival",     "3 GB"),
    ("The Long Dark",                 "305620",  "Survival",     "2 GB"),
    # Strategy
    ("Total War: Warhammer III",      "1142710", "Strategy",     "120 GB"),
    ("Crusader Kings III",            "1158310", "Strategy",     "5 GB"),
    ("Victoria 3",                    "529340",  "Strategy",     "5 GB"),
    ("Civilization VI",               "289070",  "Strategy",     "12 GB"),
    ("XCOM 2",                        "268500",  "Strategy",     "22 GB"),
    ("Frostpunk 2",                   "1904390", "Strategy",     "40 GB"),
    ("Frostpunk",                     "323190",  "Strategy",     "4 GB"),
    ("Age of Empires IV",             "1466860", "Strategy",     "50 GB"),
    ("Stellaris",                     "281990",  "Strategy",     "12 GB"),
    ("Hearts of Iron IV",             "394360",  "Strategy",     "4 GB"),
    ("Europa Universalis IV",         "236850",  "Strategy",     "4 GB"),
    ("Imperator: Rome",               "859580",  "Strategy",     "2 GB"),
    ("Humankind",                     "1124300", "Strategy",     "7 GB"),
    ("Company of Heroes 3",           "1677280", "Strategy",     "40 GB"),
    ("Warhammer 40K: Rogue Trader",   "2186680", "Strategy",     "35 GB"),
    # Sandbox / Open World
    ("Grand Theft Auto V",            "271590",  "Open World",   "95 GB"),
    ("Red Dead Redemption 2",         "1174180", "Open World",   "120 GB"),
    ("No Man's Sky",                  "275850",  "Open World",   "15 GB"),
    ("Garry's Mod",                   "4000",    "Sandbox",      "5 GB"),
    ("Terraria",                      "105600",  "Sandbox",      "200 MB"),
    ("Minecraft Dungeons",            "1672970", "Sandbox",      "2 GB"),
    ("Portal 2",                      "620",     "Sandbox",      "11 GB"),
    # Roguelike
    ("Hades",                         "1145360", "Roguelike",    "5 GB"),
    ("Hades II",                      "1145350", "Roguelike",    "7 GB"),
    ("Returnal",                      "1649240", "Roguelike",    "60 GB"),
    ("Vampire Survivors",             "1794680", "Roguelike",    "200 MB"),
    ("Dead Cells",                    "588650",  "Roguelike",    "1 GB"),
    ("Slay the Spire",                "646570",  "Roguelike",    "500 MB"),
    ("Enter the Gungeon",             "311690",  "Roguelike",    "1 GB"),
    ("Risk of Rain 2",                "632360",  "Roguelike",    "4 GB"),
    ("Noita",                         "881100",  "Roguelike",    "1 GB"),
    ("Binding of Isaac: Rebirth",     "250900",  "Roguelike",    "500 MB"),
    # Platformer
    ("Celeste",                       "504230",  "Platformer",   "1.3 GB"),
    ("Hollow Knight",                 "367520",  "Platformer",   "8 GB"),
    ("Cuphead",                       "268910",  "Platformer",   "4 GB"),
    ("Ori and the Will of Wisps",     "1057090", "Platformer",   "13 GB"),
    ("Inside",                        "304430",  "Platformer",   "4 GB"),
    ("Limbo",                         "48000",   "Platformer",   "200 MB"),
    ("Prince of Persia: Lost Crown",  "1896370", "Platformer",   "10 GB"),
    ("Sackboy: A Big Adventure",      "1378630", "Platformer",   "55 GB"),
    # Metroidvania
    ("Hollow Knight",                 "367520",  "Metroidvania", "8 GB"),
    ("Ori and the Blind Forest",      "261570",  "Metroidvania", "5 GB"),
    ("Bloodstained: RotN",            "692850",  "Metroidvania", "7 GB"),
    ("Aeterna Noctis",                "1517840", "Metroidvania", "4 GB"),
    ("9 Years of Shadows",            "1629520", "Metroidvania", "3 GB"),
    # Racing
    ("Forza Horizon 5",               "1551360", "Racing",       "110 GB"),
    ("Forza Horizon 4",               "1293830", "Racing",       "80 GB"),
    ("Forza Motorsport",              "2440510", "Racing",       "90 GB"),
    ("Need for Speed Unbound",        "1846380", "Racing",       "50 GB"),
    ("The Crew Motorfest",            "2390640", "Racing",       "60 GB"),
    ("F1 24",                         "2108330", "Racing",       "60 GB"),
    ("Assetto Corsa Competizione",    "805550",  "Racing",       "30 GB"),
    ("iRacing",                       "266410",  "Racing",       "60 GB"),
    # Fighting
    ("Tekken 8",                      "1778820", "Fighting",     "100 GB"),
    ("Street Fighter 6",              "1364780", "Fighting",     "45 GB"),
    ("Mortal Kombat 1",               "1971870", "Fighting",     "100 GB"),
    ("Dragon Ball FighterZ",          "678950",  "Fighting",     "9 GB"),
    ("Guilty Gear Strive",            "1384160", "Fighting",     "15 GB"),
    ("MultiVersus",                   "1826290", "Fighting",     "5 GB"),
    # Sports
    ("EA Sports FC 25",               "2195250", "Sports",       "50 GB"),
    ("NBA 2K25",                      "2338770", "Sports",       "130 GB"),
    ("Rocket League",                 "252950",  "Sports",       "20 GB"),
    ("Golf With Your Friends",        "431240",  "Sports",       "2 GB"),
    # Co-op
    ("It Takes Two",                  "1426210", "Co-op",        "40 GB"),
    ("A Way Out",                     "877460",  "Co-op",        "15 GB"),
    ("Helldivers 2",                  "553850",  "Co-op",        "100 GB"),
    ("PAYDAY 3",                      "1272080", "Co-op",        "40 GB"),
    ("Back 4 Blood",                  "924970",  "Co-op",        "50 GB"),
    ("Phasmophobia",                  "739630",  "Co-op",        "16 GB"),
    ("Sea of Thieves",                "1172620", "Co-op",        "35 GB"),
    # Simulation
    ("Microsoft Flight Sim 2020",     "1250410", "Sim",          "170 GB"),
    ("Microsoft Flight Sim 2024",     "2537590", "Sim",          "50 GB"),
    ("Kerbal Space Program 2",        "954850",  "Sim",          "15 GB"),
    ("Elite Dangerous",               "359320",  "Sim",          "35 GB"),
    ("War Thunder",                   "236390",  "Sim",          "100 GB"),
    ("Planet Zoo",                    "703080",  "Sim",          "20 GB"),
    ("Planet Coaster 2",              "2688680", "Sim",          "10 GB"),
    ("Two Point Hospital",            "535930",  "Sim",          "3 GB"),
    ("Stardew Valley",                "413150",  "Sim",          "500 MB"),
    ("Farming Simulator 22",          "1248130", "Sim",          "15 GB"),
    ("Euro Truck Simulator 2",        "227300",  "Sim",          "12 GB"),
    ("American Truck Simulator",      "270880",  "Sim",          "6 GB"),
    # City Builder / Management
    ("Cities: Skylines",              "255710",  "City Builder", "6 GB"),
    ("Cities: Skylines II",           "949230",  "City Builder", "10 GB"),
    ("Anno 1800",                     "916440",  "City Builder", "35 GB"),
    ("Against the Storm",             "1336490", "City Builder", "2 GB"),
    ("Farthest Frontier",             "1309120", "City Builder", "2 GB"),
    ("Manor Lords",                   "1363080", "City Builder", "4 GB"),
    ("Surviving Mars",                "464920",  "City Builder", "6 GB"),
    # Factory
    ("Satisfactory",                  "526870",  "Factory",      "10 GB"),
    ("Factorio",                      "427520",  "Factory",      "1 GB"),
    ("Dyson Sphere Program",          "1366540", "Factory",      "4 GB"),
    ("Shapez",                        "1318690", "Factory",      "500 MB"),
    # Colony Sim
    ("RimWorld",                      "294100",  "Colony Sim",   "1 GB"),
    ("Dwarf Fortress",                "975370",  "Colony Sim",   "300 MB"),
    ("Oxygen Not Included",           "457140",  "Colony Sim",   "1 GB"),
    # Puzzle / Exploration
    ("Portal 2",                      "620",     "Puzzle",       "11 GB"),
    ("The Witness",                   "210970",  "Puzzle",       "3 GB"),
    ("Superliminal",                  "1049410", "Puzzle",       "2 GB"),
    ("The Talos Principle 2",         "835960",  "Puzzle",       "15 GB"),
    ("Outer Wilds",                   "753640",  "Exploration",  "3 GB"),
    ("No Man's Sky",                  "275850",  "Exploration",  "15 GB"),
    ("Stray",                         "1332010", "Exploration",  "10 GB"),
    ("Journey",                       "638230",  "Exploration",  "2 GB"),
    ("What Remains of Edith Finch",   "501300",  "Exploration",  "5 GB"),
    ("Outer Wilds: Echoes of Eye",    "753640",  "Exploration",  "2 GB"),
    ("The Forgotten City",            "1173030", "Exploration",  "8 GB"),
    ("Outer Wilds",                   "753640",  "Exploration",  "3 GB"),
    ("Firewatch",                     "383870",  "Exploration",  "3 GB"),
    ("Abzû",                          "384190",  "Exploration",  "3 GB"),
    ("The Stanley Parable: UD",       "1703340", "Exploration",  "5 GB"),
    ("Dave the Diver",                "1868140", "Exploration",  "3 GB"),
    # Indie
    ("Hades",                         "1145360", "Indie",        "5 GB"),
    ("Cuphead",                       "268910",  "Indie",        "4 GB"),
    ("Undertale",                     "391540",  "Indie",        "200 MB"),
    ("Disco Elysium",                 "632470",  "Indie",        "20 GB"),
    ("Celeste",                       "504230",  "Indie",        "1.3 GB"),
    ("Hollow Knight",                 "367520",  "Indie",        "8 GB"),
    ("Tunic",                         "553420",  "Indie",        "2 GB"),
    ("Unpacking",                     "1135690", "Indie",        "500 MB"),
    ("Inscryption",                   "1092790", "Indie",        "2 GB"),
    ("Spiritfarer",                   "972660",  "Indie",        "2 GB"),
    ("A Short Hike",                  "1055540", "Indie",        "200 MB"),
    ("Night in the Woods",            "481510",  "Indie",        "3 GB"),
    ("Disco Elysium",                 "632470",  "Indie",        "20 GB"),
    # MOBA / Multiplayer
    ("Dota 2",                        "570",     "MOBA",         "20 GB"),
    ("Apex Legends",                  "1172470", "Battle Royale","100 GB"),
    ("Fall Guys",                     "1097150", "Battle Royale","3 GB"),
    ("Among Us",                      "945360",  "Party",        "250 MB"),
    ("Overwatch 2",                   "2357570", "Hero Shooter", "50 GB"),
    ("Path of Exile",                 "238960",  "ARPG",         "30 GB"),
    ("Path of Exile 2",               "2694490", "ARPG",         "40 GB"),
    ("Lost Ark",                      "1599340", "ARPG",         "50 GB"),
    ("New World: Aeternum",           "1063730", "MMO",          "50 GB"),
    # Looter Shooter
    ("Borderlands 3",                 "397540",  "Looter Shooter","75 GB"),
    ("Tiny Tina's Wonderlands",       "1286680", "Looter Shooter","39 GB"),
    ("The Division 2",                "2239550", "Looter Shooter","60 GB"),
    ("Ghost Recon Breakpoint",        "2134500", "Looter Shooter","100 GB"),
    # TPS / Third Person
    ("Warhammer 40K: Space Marine 2", "2183900", "TPS",          "75 GB"),
    ("Gears 5",                       "1097840", "TPS",          "63 GB"),
    ("Suicide Squad: KTJL",           "315210",  "TPS",          "65 GB"),
    ("Fortnite (placeholder)",        "1326470", "Battle Royale","30 GB"),
    # More notable
    ("Red Dead Online",               "1174180", "Online",       "120 GB"),
    ("GTA Online (via GTA V)",        "271590",  "Online",       "95 GB"),
    ("Raft",                          "648800",  "Survival",     "5 GB"),
    ("Icarus",                        "1149460", "Survival",     "20 GB"),
    ("The Cycle: Frontier",           "868270",  "FPS",          "30 GB"),
    ("Escape from Tarkov (unofficial)","1151340","FPS",          "40 GB"),
    ("Warhammer: Vermintide 2",       "552500",  "Co-op",        "25 GB"),
    ("Aliens: Fireteam Elite",        "1549970", "Co-op",        "40 GB"),
    ("Outriders",                     "680420",  "Co-op",        "40 GB"),
    ("Remnant: From the Ashes",       "617290",  "Co-op",        "25 GB"),
    ("Remnant II",                    "1282100", "Co-op",        "30 GB"),
    ("Dark Souls Remastered",         "570940",  "Action RPG",   "8 GB"),
    ("Dark Souls II: SOTFS",          "335300",  "Action RPG",   "10 GB"),
    ("Demon's Souls",                 "2203220", "Action RPG",   "70 GB"),
    ("Bloodborne PC (unofficial)",    "1550450", "Action RPG",   "50 GB"),
    ("Thymesia",                      "1696440", "Action RPG",   "10 GB"),
    ("Steelrising",                   "1465680", "Action RPG",   "30 GB"),
    ("The Surge 2",                   "1111290", "Action RPG",   "18 GB"),
    ("Code Vein",                     "678960",  "Action RPG",   "30 GB"),
    ("Scarlet Nexus",                 "775500",  "Action RPG",   "25 GB"),
    ("Tales of Arise",                "1237140", "JRPG",         "35 GB"),
    ("Ni no Kuni II",                 "589360",  "JRPG",         "40 GB"),
    ("Nier: Automata",                "524220",  "Action RPG",   "25 GB"),
    ("Nier Replicant",                "1113560", "Action RPG",   "25 GB"),
    ("Octopath Traveler",             "921570",  "JRPG",         "7 GB"),
    ("Octopath Traveler II",          "1973710", "JRPG",         "7 GB"),
    ("Dragon Quest XI S",             "960170",  "JRPG",         "60 GB"),
    ("Yakuza 0",                      "638970",  "Action",       "25 GB"),
    ("Yakuza: Like a Dragon",         "1235140", "JRPG",         "33 GB"),
    ("Like a Dragon Gaiden",          "2291460", "Action",       "30 GB"),
    ("Judgment",                      "1448440", "Action",       "45 GB"),
    ("Lost Judgment",                 "1686310", "Action",       "50 GB"),
    ("13 Sentinels: Aegis Rim",       "1631570", "Strategy",     "6 GB"),
    ("Guilty Gear Xrd Rev 2",         "520440",  "Fighting",     "8 GB"),
    ("Granblue Fantasy Versus: RP",   "2135740", "Fighting",     "40 GB"),
    ("The King of Fighters XV",       "1498570", "Fighting",     "30 GB"),
    ("Melty Blood: Type Lumina",      "1488480", "Fighting",     "5 GB"),
    ("Sonic Frontiers",               "1237320", "Platformer",   "30 GB"),
    ("Sonic Superstars",              "2187600", "Platformer",   "10 GB"),
    ("Crash Bandicoot 4",             "1378590", "Platformer",   "30 GB"),
    ("Psychonauts 2",                 "607080",  "Platformer",   "26 GB"),
    ("Astro Bot (placeholder)",       "2883620", "Platformer",   "25 GB"),
    ("Trine 4",                       "690640",  "Platformer",   "10 GB"),
    ("Rayman Legends",                "274490",  "Platformer",   "12 GB"),
    ("Shovel Knight Treasure Trove",  "250760",  "Platformer",   "1 GB"),
    ("Axiom Verge 2",                 "1441390", "Metroidvania", "2 GB"),
    ("Record of Lodoss War: Deedlit", "1374940", "Metroidvania", "1 GB"),
    ("Islets",                        "1676530", "Metroidvania", "1 GB"),
    ("Kirby (placeholder)",           "1812800", "Platformer",   "6 GB"),
    ("Battletoads",                   "1105070", "Platformer",   "2 GB"),
    ("Turbo Golf Racing",             "1324420", "Racing",       "3 GB"),
    ("Hot Wheels Unleashed 2",        "2064690", "Racing",       "20 GB"),
    ("WRC Generations",               "1546820", "Racing",       "55 GB"),
    ("BeamNG.drive",                  "284160",  "Sim",          "50 GB"),
    ("Snowrunner",                    "1465360", "Sim",          "20 GB"),
    ("MudRunner",                     "675010",  "Sim",          "4 GB"),
    ("House Flipper 2",               "1484285", "Sim",          "5 GB"),
    ("Power Wash Simulator",          "1290000", "Sim",          "3 GB"),
    ("TCG Card Simulator",            "2186430", "Sim",          "1 GB"),
    ("Townscaper",                    "1291340", "City Builder", "200 MB"),
    ("Terra Nil",                     "1593030", "City Builder", "500 MB"),
    ("Settlement Survival",           "1838530", "City Builder", "2 GB"),
    ("Workers & Resources",           "784150",  "City Builder", "2 GB"),
    ("Mindustry",                     "1127400", "Factory",      "200 MB"),
    ("Baba Is You",                   "736260",  "Puzzle",       "300 MB"),
    ("Return of the Obra Dinn",       "653530",  "Puzzle",       "200 MB"),
    ("The Room",                      "288160",  "Puzzle",       "300 MB"),
    ("Manifold Garden",               "1054530", "Puzzle",       "1 GB"),
    ("Antichamber",                   "219890",  "Puzzle",       "200 MB"),
    ("Fez",                           "224760",  "Puzzle",       "200 MB"),
    ("Myst",                          "1255560", "Puzzle",       "2 GB"),
    ("SOMA",                          "282140",  "Horror",       "20 GB"),
    ("Amnesia: The Dark Descent",     "57300",   "Horror",       "3 GB"),
    ("Visage",                        "594330",  "Horror",       "17 GB"),
    ("Signalis",                      "1777030", "Horror",       "2 GB"),
    ("Martha Is Dead",                "1388770", "Horror",       "20 GB"),
    ("Returnal",                      "1649240", "Horror",       "60 GB"),
    ("Scorn",                         "698670",  "Horror",       "15 GB"),
    ("Dredge",                        "1562430", "Indie",        "2 GB"),
    ("Venba",                         "1491580", "Indie",        "500 MB"),
    ("Cocoon",                        "1497440", "Indie",        "2 GB"),
    ("Aka",                           "1870520", "Indie",        "500 MB"),
    ("Tinykin",                       "1610530", "Indie",        "3 GB"),
    ("Neon Abyss",                    "1137390", "Roguelike",    "1 GB"),
    ("Gunfire Reborn",                "1217060", "Roguelike",    "3 GB"),
    ("Rogue: Genesia",                "2067920", "Roguelike",    "500 MB"),
    ("Brotato",                       "1942280", "Roguelike",    "200 MB"),
    ("20 Minutes Till Dawn",          "1966900", "Roguelike",    "200 MB"),
    ("Backpack Hero",                 "1730180", "Roguelike",    "500 MB"),
    ("Balatro",                       "2379780", "Roguelike",    "100 MB"),
    ("Against the Storm",             "1336490", "Roguelike",    "2 GB"),
    ("Loop Hero",                     "1282730", "Roguelike",    "500 MB"),
    ("Monster Train",                 "1102190", "Roguelike",    "1 GB"),
    ("Griftlands",                    "601840",  "Roguelike",    "1 GB"),
    ("Midnight Suns",                 "368260",  "Strategy",     "60 GB"),
    ("Into the Breach",               "590380",  "Strategy",     "300 MB"),
    ("Wargroove 2",                   "1948640", "Strategy",     "2 GB"),
    ("Dorfromantik",                  "1455840", "Strategy",     "500 MB"),
    ("Northgard",                     "466560",  "Strategy",     "2 GB"),
    ("Bad North",                     "790940",  "Strategy",     "500 MB"),
    ("Minion Masters",                "489520",  "Strategy",     "2 GB"),
    ("Total War: Rome Remastered",    "1215970", "Strategy",     "20 GB"),
    ("Total War: Three Kingdoms",     "779340",  "Strategy",     "30 GB"),
    ("Age of Empires II DE",          "813780",  "Strategy",     "25 GB"),
    ("Homeworld Remastered",          "244160",  "Strategy",     "10 GB"),
    ("Homeworld 3",                   "1565720", "Strategy",     "30 GB"),
    ("Highfleet",                     "1434137", "Strategy",     "1 GB"),
    ("Warcraft III Reforged (placeholder)","1466860","Strategy", "30 GB"),
    ("Zombie Army 4",                 "361800",  "Co-op",        "40 GB"),
    ("World War Z",                   "699130",  "Co-op",        "30 GB"),
    ("Killing Floor 2",               "232090",  "Co-op",        "14 GB"),
    ("Deep Rock Galactic",            "548430",  "Co-op",        "8 GB"),
    ("Vermintide 2",                  "552500",  "Co-op",        "25 GB"),
    ("Payday 2",                      "218620",  "Co-op",        "22 GB"),
    ("Human: Fall Flat",              "477160",  "Co-op",        "1 GB"),
    ("Gang Beasts",                   "285900",  "Co-op",        "1 GB"),
    ("Moving Out",                    "996770",  "Co-op",        "1 GB"),
    ("Overcooked! 2",                 "728880",  "Co-op",        "1 GB"),
    ("PlateUp!",                      "1599600", "Co-op",        "1 GB"),
    ("Astroneer",                     "361420",  "Exploration",  "10 GB"),
    ("Subnautica",                    "264710",  "Exploration",  "9 GB"),
    ("The Wandering Village",         "1681790", "City Builder", "1 GB"),
    ("My Time at Sandrock",           "1084290", "Sim",          "10 GB"),
    ("Sun Haven",                     "1432860", "Sim",          "2 GB"),
    ("Coral Island",                  "1158160", "Sim",          "5 GB"),
    ("Disney Dreamlight Valley",      "1401500", "Sim",          "15 GB"),
    ("Palia",                         "2707930", "Sim",          "15 GB"),
    ("Ooblets",                       "895840",  "Sim",          "2 GB"),
    ("Potion Permit",                 "1595830", "Sim",          "2 GB"),
    ("Spirittea",                     "1931000", "Sim",          "1 GB"),
    ("Cassette Beasts",               "1321440", "RPG",          "1 GB"),
    ("Temtem",                        "745590",  "RPG",          "10 GB"),
    ("Coromon",                       "1218250", "RPG",          "500 MB"),
    ("Palworld",                      "1623730", "RPG",          "45 GB"),
    ("Chained Echoes",                "1279590", "JRPG",         "1 GB"),
    ("CrossCode",                     "368340",  "Action RPG",   "1 GB"),
    ("Sea of Stars",                  "1244090", "JRPG",         "8 GB"),
    ("Omori",                         "1150690", "JRPG",         "3 GB"),
    ("Ikenfell",                      "854270",  "JRPG",         "2 GB"),
    ("Rogue Legacy 2",                "1253920", "Roguelike",    "2 GB"),
    ("Curse of the Dead Gods",        "1123770", "Roguelike",    "2 GB"),
    ("Torchlight: Infinite",          "1762588", "ARPG",         "4 GB"),
    ("Last Epoch",                    "899770",  "ARPG",         "20 GB"),
    ("Wolcen",                        "424370",  "ARPG",         "30 GB"),
    ("Grim Dawn",                     "219990",  "ARPG",         "7 GB"),
    ("Victor Vran",                   "345180",  "ARPG",         "5 GB"),
    ("Chronicon",                     "375480",  "ARPG",         "200 MB"),
    ("Weird West",                    "1097350", "Action RPG",   "7 GB"),
    ("Weird West: Definitive Edition","1097350", "Action RPG",   "7 GB"),
    ("The Callisto Protocol",         "1272130", "Horror",       "44 GB"),
    ("Layers of Fear",                "1717990", "Horror",       "15 GB"),
    ("The Dark Pictures: HM",         "872120",  "Horror",       "20 GB"),
    ("Until Dawn (PC)",               "2172010", "Horror",       "50 GB"),
    ("The Quarry",                    "1448030", "Horror",       "50 GB"),
]

# dedupe by appid keeping first occurrence
_seen = set()
GAMES_DEDUPED = []
for g in GAMES:
    if g[1] not in _seen:
        _seen.add(g[1])
        GAMES_DEDUPED.append(g)
GAMES = GAMES_DEDUPED

GENRES = sorted(set(g[2] for g in GAMES))


def _detect_steam():
    """Try to auto-detect Steam path from Windows registry or common locations."""
    if sys.platform != "win32":
        return r"C:\Program Files (x86)\Steam"
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                             r"SOFTWARE\WOW6432Node\Valve\Steam")
        path, _ = winreg.QueryValueEx(key, "InstallPath")
        winreg.CloseKey(key)
        if os.path.isdir(path):
            return path
    except Exception:
        pass
    for p in [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
        os.path.join(os.path.expanduser("~"), "Steam"),
    ]:
        if os.path.isdir(p):
            return p
    return r"C:\Program Files (x86)\Steam"


def load_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {
        "steam_path":     _detect_steam(),
        "millennium_path": "",
        "manifest_dir":   os.path.join(os.path.expanduser("~"), "SteamKitOutput"),
        "lua_config_dir": "",
        "installed_apps": [],
        "depot_pins":     {},
    }


def save_config(cfg):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def gen_manifest(appid, name="", depots=None):
    depot_vdf = ""
    if depots:
        for did, mid in depots.items():
            depot_vdf += f'\t\t"{did}"\n\t\t{{\n\t\t\t"manifest"\t\t"{mid}"\n\t\t\t"size"\t\t"0"\n\t\t}}\n'
    safe = (name or f"App_{appid}").replace(":", "").replace("/", "-").replace("\\", "-")
    return f'''"AppState"
{{
\t"appid"\t\t"{appid}"
\t"Universe"\t\t"1"
\t"name"\t\t"{name or f'App {appid}'}"
\t"StateFlags"\t\t"4"
\t"installdir"\t\t"{safe}"
\t"LastUpdated"\t\t"{int(time.time())}"
\t"SizeOnDisk"\t\t"0"
\t"buildid"\t\t"0"
\t"LastOwner"\t\t"0"
\t"UpdateResult"\t\t"0"
\t"BytesToDownload"\t\t"0"
\t"BytesDownloaded"\t\t"0"
\t"BytesToStage"\t\t"0"
\t"BytesStaged"\t\t"0"
\t"AutoUpdateBehavior"\t\t"0"
\t"AllowOtherDownloadsWhileRunning"\t\t"0"
\t"ScheduledAutoUpdate"\t\t"0"
\t"InstalledDepots"
\t{{
{depot_vdf}\t}}
}}
'''


def gen_lua(appid, name="", depots=None, unlocked=True):
    depot_block = ""
    if depots:
        lines = [f'  ["{d}"] = "{b}",' for d, b in depots.items()]
        depot_block = "  depots = {\n" + "\n".join(lines) + "\n  },\n"
    return f"""-- SteamKit Manager v{VERSION}
-- AppID: {appid}{f'  ({name})' if name else ''}
-- Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}

return {{
  appid    = "{appid}",
  unlocked = {"true" if unlocked else "false"},
{depot_block}  version  = "1",
}}
"""


# ─── APP ──────────────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.cfg = load_config()
        self.title(f"{APP_TITLE}  v{VERSION}")
        self.geometry("1400x860")
        self.minsize(1100, 680)
        self.configure(bg=P["bg"])
        try: self.iconbitmap(default="")
        except Exception: pass
        self._styles()
        self._sidebar()
        self._pages()
        self._show("dashboard")
        self._load_games()
        self._log(f"SteamKit Manager v{VERSION} started — {len(GAMES)} games loaded", "blue")
        self._log(f"Steam path: {self.cfg.get('steam_path','(not set)')}", "dim")

    # ── STYLES ────────────────────────────────────────────────────────────────
    def _styles(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        s.configure(".", background=P["bg"], foreground=P["text"],
                    fieldbackground=P["sf2"], bordercolor=P["border"],
                    font=("Segoe UI", 10), troughcolor=P["bg"])
        s.configure("TFrame", background=P["bg"])
        s.configure("TLabel", background=P["bg"], foreground=P["text"])
        s.configure("TEntry", fieldbackground=P["sf2"], foreground=P["text"],
                    insertcolor=P["text"], bordercolor=P["border"], relief="flat")
        s.configure("TScrollbar", background=P["sf2"], troughcolor=P["bg"],
                    bordercolor=P["border"], arrowcolor=P["dim"])
        s.configure("Treeview", background=P["surface"], foreground=P["text"],
                    fieldbackground=P["surface"], borderwidth=0, rowheight=28)
        s.map("Treeview", background=[("selected", P["accent2"])],
              foreground=[("selected", P["text"])])
        s.configure("Treeview.Heading", background=P["sf2"], foreground=P["text"],
                    relief="flat", font=("Segoe UI", 9, "bold"))
        s.configure("TProgressbar", background=P["accent"],
                    troughcolor=P["sf2"], bordercolor=P["border"], thickness=10)
        s.configure("TCombobox", fieldbackground=P["sf2"], foreground=P["text"],
                    background=P["sf2"], selectbackground=P["accent2"], arrowcolor=P["text"])
        s.configure("TCheckbutton", background=P["bg"], foreground=P["text"])
        s.configure("TLabelframe", background=P["bg"], bordercolor=P["border"])
        s.configure("TLabelframe.Label", background=P["bg"],
                    foreground=P["accent"], font=("Segoe UI", 9, "bold"))

    # ── SIDEBAR ───────────────────────────────────────────────────────────────
    def _sidebar(self):
        sb = tk.Frame(self, bg=P["surface"], width=220)
        sb.pack(side="left", fill="y")
        sb.pack_propagate(False)

        tk.Label(sb, text="⚡ SteamKit", bg=P["surface"], fg=P["accent"],
                 font=("Segoe UI", 16, "bold")).pack(pady=(24,2), padx=20, anchor="w")
        tk.Label(sb, text=f"Manager  v{VERSION}", bg=P["surface"],
                 fg=P["dim"], font=("Segoe UI", 8)).pack(padx=20, anchor="w")
        tk.Frame(sb, bg=P["border"], height=1).pack(fill="x", padx=16, pady=16)

        nav = [
            ("dashboard", "🏠  Dashboard"),
            ("games",     "🎮  Games Library"),
            ("manifest",  "📋  Manifest Editor"),
            ("lua",       "🔧  Lua Config"),
            ("depot",     "📦  Depot Manager"),
            ("batch",     "⚡  Batch Tools"),
            ("settings",  "⚙️   Settings"),
            ("log",       "📜  Activity Log"),
        ]
        self._nav = {}
        for key, lbl in nav:
            b = tk.Button(sb, text=lbl, anchor="w",
                          bg=P["surface"], fg=P["dim"],
                          activebackground=P["sf3"], activeforeground=P["text"],
                          relief="flat", bd=0, padx=20, pady=10,
                          font=("Segoe UI", 10), cursor="hand2",
                          command=lambda k=key: self._show(k))
            b.pack(fill="x")
            self._nav[key] = b

        tk.Frame(sb, bg=P["border"], height=1).pack(fill="x", padx=16, pady=12, side="bottom")
        self._status_lbl = tk.Label(sb, text="● Ready", bg=P["surface"],
                                    fg=P["green"], font=("Segoe UI", 9, "bold"))
        self._status_lbl.pack(side="bottom", padx=20, pady=10, anchor="w")
        tk.Label(sb, text=f"{len(GAMES)} games", bg=P["surface"],
                 fg=P["dim"], font=("Segoe UI", 8)).pack(
            side="bottom", padx=20, anchor="w")

    def _show(self, key):
        for k, b in self._nav.items():
            b.configure(bg=(P["accent2"] if k == key else P["surface"]),
                        fg=(P["text"] if k == key else P["dim"]))
        for k, f in self._frames.items():
            if k == key: f.pack(fill="both", expand=True)
            else: f.pack_forget()

    # ── PAGES CONTAINER ───────────────────────────────────────────────────────
    def _pages(self):
        self._content = tk.Frame(self, bg=P["bg"])
        self._content.pack(side="right", fill="both", expand=True)
        self._frames = {}
        for key, fn in [
            ("dashboard", self._pg_dashboard),
            ("games",     self._pg_games),
            ("manifest",  self._pg_manifest),
            ("lua",       self._pg_lua),
            ("depot",     self._pg_depot),
            ("batch",     self._pg_batch),
            ("settings",  self._pg_settings),
            ("log",       self._pg_log),
        ]:
            f = tk.Frame(self._content, bg=P["bg"])
            self._frames[key] = f
            fn(f)

    # ── HELPERS ───────────────────────────────────────────────────────────────
    def _hdr(self, parent, title, subtitle=""):
        h = tk.Frame(parent, bg=P["sf2"])
        h.pack(fill="x")
        tk.Label(h, text=title, bg=P["sf2"], fg=P["accent"],
                 font=("Segoe UI", 15, "bold")).pack(side="left", padx=22, pady=16)
        if subtitle:
            tk.Label(h, text=subtitle, bg=P["sf2"], fg=P["dim"],
                     font=("Segoe UI", 9)).pack(side="left", padx=4)
        return h

    def _card(self, parent, **kw):
        return tk.Frame(parent, bg=P["surface"],
                        highlightbackground=P["border"], highlightthickness=1, **kw)

    def _btn(self, parent, text, cmd, color=None, fg=None, size=9, **kw):
        kw.setdefault("font", ("Segoe UI", size, "bold"))
        return tk.Button(parent, text=text, command=cmd,
                         bg=color or P["sf2"], fg=fg or P["text"],
                         activebackground=P["accent2"], activeforeground=P["text"],
                         relief="flat", bd=0, padx=14, pady=7,
                         cursor="hand2", **kw)

    def _entry(self, parent, **kw):
        return tk.Entry(parent, bg=P["sf2"], fg=P["text"],
                        insertbackground=P["text"], relief="flat", bd=0,
                        highlightbackground=P["border"],
                        highlightcolor=P["accent"], highlightthickness=1, **kw)

    def _lbl(self, parent, text, dim=False, size=9, color=None, **kw):
        return tk.Label(parent, text=text,
                        bg=kw.pop("bg", P["bg"]),
                        fg=color or (P["dim"] if dim else P["text"]),
                        font=("Segoe UI", size), **kw)

    def _sec(self, parent, title):
        return tk.LabelFrame(parent, text=f"  {title}  ",
                             bg=P["bg"], fg=P["accent"],
                             font=("Segoe UI", 9, "bold"), bd=1, relief="flat",
                             highlightbackground=P["border"], highlightthickness=1)

    def _log(self, msg, tag=""):
        ts = time.strftime("%H:%M:%S")
        line = f"[{ts}]  {msg}\n"
        for w in getattr(self, "_log_widgets", []):
            w.config(state="normal")
            w.insert("end", line, tag)
            w.see("end")
            w.config(state="disabled")

    def _setstatus(self, text, color="green"):
        self._status_lbl.config(text=f"● {text}", fg=P[color])

    def _outdir(self):
        d = self.cfg.get("manifest_dir") or os.path.join(os.path.expanduser("~"), "SteamKitOutput")
        os.makedirs(d, exist_ok=True)
        return d

    def _open_folder(self, path=None):
        path = path or self._outdir()
        if sys.platform == "win32":
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])

    # ─────────────────────────────────────────────────────────────────────────
    # DASHBOARD
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_dashboard(self, f):
        self._hdr(f, "Dashboard", "Steam Manifest & Lua Config Manager")
        body = tk.Frame(f, bg=P["bg"])
        body.pack(fill="both", expand=True, padx=18, pady=14)

        # stat row
        sr = tk.Frame(body, bg=P["bg"])
        sr.pack(fill="x", pady=(0, 14))

        def stat(val, lbl, col, icon=""):
            c = self._card(sr)
            c.pack(side="left", fill="x", expand=True, padx=5, ipadx=18, ipady=16)
            tk.Label(c, text=icon, bg=P["surface"], fg=col,
                     font=("Segoe UI", 18)).pack()
            tk.Label(c, text=str(val), bg=P["surface"], fg=col,
                     font=("Segoe UI", 28, "bold")).pack()
            tk.Label(c, text=lbl, bg=P["surface"], fg=P["dim"],
                     font=("Segoe UI", 9)).pack(pady=(0,4))

        installed = len(self.cfg.get("installed_apps", []))
        stat(len(GAMES),       "Games in Library",   P["accent"],  "🎮")
        stat(len(GENRES),      "Genres",              P["purple"],  "🏷️")
        stat(installed,        "Processed",           P["green"],   "✅")
        stat(len(GAMES)-installed, "Pending",         P["yellow"],  "⏳")

        # quick actions
        qa = self._sec(body, "Quick Actions")
        qa.pack(fill="x", pady=(0, 14))
        qr = tk.Frame(qa, bg=P["bg"])
        qr.pack(fill="x", padx=12, pady=12)
        self._btn(qr, "⬇  Process ALL Games",
                  self._bulk_all, color=P["accent2"], size=11).pack(
            side="left", padx=6, ipady=4, ipadx=20)
        self._btn(qr, "📋  All Manifests",
                  self._gen_all_manifests, color=P["sf3"]).pack(side="left", padx=4)
        self._btn(qr, "🔧  All Lua Configs",
                  self._gen_all_lua, color=P["sf3"]).pack(side="left", padx=4)
        self._btn(qr, "🚀  Copy → Steam",
                  self._copy_to_steam, color=P["green"]).pack(side="left", padx=4)
        self._btn(qr, "📁  Open Output Folder",
                  self._open_folder, color=P["sf3"]).pack(side="left", padx=4)

        # progress
        pf = tk.Frame(body, bg=P["bg"])
        pf.pack(fill="x", pady=(0, 12))
        self._prog_var = tk.DoubleVar()
        self._prog_bar = ttk.Progressbar(pf, variable=self._prog_var, maximum=100)
        self._prog_bar.pack(fill="x")
        self._prog_lbl = self._lbl(pf, "Ready", dim=True)
        self._prog_lbl.pack(anchor="w", pady=3)

        # activity log
        ls = self._sec(body, "Activity")
        ls.pack(fill="both", expand=True)
        self._dash_log = scrolledtext.ScrolledText(
            ls, bg=P["surface"], fg=P["text"], insertbackground=P["text"],
            font=("Consolas", 9), relief="flat", state="disabled", height=10)
        self._dash_log.pack(fill="both", expand=True, padx=8, pady=8)
        for tag, col in [("green",P["green"]),("red",P["red"]),
                          ("yellow",P["yellow"]),("blue",P["accent"]),
                          ("purple",P["purple"]),("dim",P["dim"])]:
            self._dash_log.tag_configure(tag, foreground=col)
        self._log_widgets = [self._dash_log]  # will add main log later

    # ─────────────────────────────────────────────────────────────────────────
    # GAMES LIBRARY
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_games(self, f):
        self._hdr(f, "Games Library", f"{len(GAMES)} titles")
        tb = tk.Frame(f, bg=P["bg"])
        tb.pack(fill="x", padx=14, pady=8)

        self._lbl(tb, "Search:").pack(side="left")
        self._search = tk.StringVar()
        self._search.trace_add("write", lambda *_: self._load_games())
        self._entry(tb, textvariable=self._search, width=26).pack(
            side="left", padx=(4, 14))

        self._lbl(tb, "Genre:").pack(side="left")
        self._genre_var = tk.StringVar(value="All")
        gcb = ttk.Combobox(tb, textvariable=self._genre_var,
                            values=["All"] + GENRES, state="readonly", width=18)
        gcb.pack(side="left", padx=(4, 14))
        gcb.bind("<<ComboboxSelected>>", lambda *_: self._load_games())

        self._lbl(tb, "Status:").pack(side="left")
        self._status_fv = tk.StringVar(value="All")
        scb = ttk.Combobox(tb, textvariable=self._status_fv,
                            values=["All","Processed","Pending"],
                            state="readonly", width=12)
        scb.pack(side="left", padx=(4, 14))
        scb.bind("<<ComboboxSelected>>", lambda *_: self._load_games())

        for txt, cmd, col in [
            ("⬇ Process Selected", self._process_selected, P["accent2"]),
            ("⬇ Process All",      self._bulk_all,          P["green"]),
            ("📋 Manifest",         self._manifest_sel,      None),
            ("🔧 Lua",              self._lua_sel,           None),
            ("📁 Output",           self._open_folder,       P["sf3"]),
        ]:
            self._btn(tb, txt, cmd, color=col).pack(side="left", padx=3)

        self._gcnt = self._lbl(tb, "", dim=True)
        self._gcnt.pack(side="right", padx=12)

        tf = tk.Frame(f, bg=P["bg"])
        tf.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        cols = ("name","appid","genre","size","status")
        self._tree = ttk.Treeview(tf, columns=cols, show="headings",
                                   selectmode="extended")
        for col, w, lbl in [("name",370,"Game Name"),("appid",100,"AppID"),
                              ("genre",130,"Genre"),("size",90,"Size"),
                              ("status",110,"Status")]:
            self._tree.heading(col, text=lbl,
                               command=lambda c=col: self._sort_tree(c))
            self._tree.column(col, width=w, minwidth=60)

        vsb = ttk.Scrollbar(tf, orient="vertical", command=self._tree.yview)
        hsb = ttk.Scrollbar(tf, orient="horizontal", command=self._tree.xview)
        self._tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        self._tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        tf.rowconfigure(0, weight=1)
        tf.columnconfigure(0, weight=1)

        self._tree.tag_configure("done", foreground=P["green"])
        self._tree.tag_configure("ok",   foreground=P["text"])
        self._sort_col = None; self._sort_rev = False

    def _sort_tree(self, col):
        self._sort_rev = not self._sort_rev if self._sort_col == col else False
        self._sort_col = col
        self._load_games()

    def _load_games(self):
        q = (self._search.get() if hasattr(self, "_search") else "").lower()
        gf = getattr(self, "_genre_var", None)
        genre_f = gf.get() if gf else "All"
        sf = getattr(self, "_status_fv", None)
        status_f = sf.get() if sf else "All"
        installed = set(self.cfg.get("installed_apps", []))

        rows = []
        for name, appid, genre, size in GAMES:
            done = appid in installed
            if q and q not in name.lower() and q not in appid and q not in genre.lower():
                continue
            if genre_f != "All" and genre != genre_f:
                continue
            if status_f == "Processed" and not done:
                continue
            if status_f == "Pending" and done:
                continue
            tag = "done" if done else "ok"
            rows.append((name, appid, genre, size,
                         "✓ Processed" if done else "Available", tag))

        if self._sort_col:
            idx = ["name","appid","genre","size","status"].index(self._sort_col)
            rows.sort(key=lambda r: r[idx].lower(), reverse=self._sort_rev)

        for i in self._tree.get_children():
            self._tree.delete(i)
        for *vals, tag in rows:
            self._tree.insert("", "end", values=vals, tags=(tag,))

        if hasattr(self, "_gcnt"):
            self._gcnt.config(text=f"{len(rows)} games")

    # ─────────────────────────────────────────────────────────────────────────
    # MANIFEST EDITOR
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_manifest(self, f):
        self._hdr(f, "Manifest Editor", "Generate .acf files for Steam/steamapps/")
        flds = tk.Frame(f, bg=P["bg"])
        flds.pack(fill="x", padx=16, pady=10)

        def fp(parent, lbl, w=14):
            r = tk.Frame(parent, bg=P["bg"])
            r.pack(side="left", padx=6)
            self._lbl(r, lbl, dim=True).pack(anchor="w")
            e = self._entry(r, width=w)
            e.pack()
            return e

        self._mf_appid   = fp(flds, "AppID", 14)
        self._mf_name    = fp(flds, "Game Name", 30)
        self._mf_depots  = fp(flds, "Depot IDs (comma)", 24)
        self._mf_mids    = fp(flds, "Manifest IDs (comma)", 24)

        br = tk.Frame(f, bg=P["bg"])
        br.pack(fill="x", padx=16, pady=4)
        for txt, cmd, col in [
            ("Generate",    self._mf_gen,    P["accent2"]),
            ("Save .acf",   self._mf_save,   None),
            ("Load .acf",   self._mf_load,   None),
            ("Copy",        self._mf_copy,   None),
            ("Clear",       lambda: self._mf_text.delete("1.0","end"), P["sf3"]),
        ]:
            self._btn(br, txt, cmd, color=col).pack(side="left", padx=4)

        self._mf_text = scrolledtext.ScrolledText(
            f, bg=P["surface"], fg=P["text"], insertbackground=P["text"],
            font=("Consolas", 10), relief="flat")
        self._mf_text.pack(fill="both", expand=True, padx=16, pady=(4,16))

    def _mf_gen(self):
        appid = self._mf_appid.get().strip()
        if not appid:
            messagebox.showwarning("SteamKit", "Enter an AppID")
            return
        rd = self._mf_depots.get().strip()
        rm = self._mf_mids.get().strip()
        depots = {}
        if rd:
            dl = [x.strip() for x in rd.split(",")]
            ml = [x.strip() for x in rm.split(",")] if rm else []
            for i, d in enumerate(dl):
                depots[d] = ml[i] if i < len(ml) else "0"
        self._mf_text.delete("1.0","end")
        self._mf_text.insert("1.0", gen_manifest(appid, self._mf_name.get().strip(), depots or None))

    def _mf_save(self):
        c = self._mf_text.get("1.0","end").strip()
        if not c: return
        appid = self._mf_appid.get().strip() or "app"
        p = os.path.join(self._outdir(), "manifests", f"appmanifest_{appid}.acf")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p,"w") as fh: fh.write(c)
        self._log(f"Saved manifest → {p}", "green")
        messagebox.showinfo("Saved", p)

    def _mf_load(self):
        p = filedialog.askopenfilename(filetypes=[("ACF","*.acf"),("All","*.*")])
        if p:
            with open(p) as fh:
                self._mf_text.delete("1.0","end")
                self._mf_text.insert("1.0",fh.read())

    def _mf_copy(self):
        self.clipboard_clear()
        self.clipboard_append(self._mf_text.get("1.0","end"))
        self._log("Manifest copied to clipboard","blue")

    # ─────────────────────────────────────────────────────────────────────────
    # LUA CONFIG
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_lua(self, f):
        self._hdr(f, "Lua Config Editor", "Generate stplug-in Lua configs for Millennium")
        top = tk.Frame(f, bg=P["bg"])
        top.pack(fill="x", padx=16, pady=10)
        self._lbl(top,"AppID:").pack(side="left")
        self._lua_appid = self._entry(top, width=12)
        self._lua_appid.pack(side="left", padx=(4,14))
        self._lbl(top,"Name:").pack(side="left")
        self._lua_name = self._entry(top, width=26)
        self._lua_name.pack(side="left", padx=(4,14))
        self._lua_unlocked = tk.BooleanVar(value=True)
        tk.Checkbutton(top, text="Unlocked", variable=self._lua_unlocked,
                       bg=P["bg"], fg=P["text"], selectcolor=P["sf2"],
                       activebackground=P["bg"],
                       font=("Segoe UI",9)).pack(side="left",padx=8)

        ds = self._sec(f, "Depot Entries")
        ds.pack(fill="x", padx=16, pady=4)
        dr = tk.Frame(ds, bg=P["bg"])
        dr.pack(fill="x", padx=10, pady=8)
        self._lbl(dr,"Depot ID:").pack(side="left")
        self._lua_did = self._entry(dr, width=12)
        self._lua_did.pack(side="left", padx=4)
        self._lbl(dr,"Branch:").pack(side="left",padx=(10,0))
        self._lua_branch = self._entry(dr, width=16)
        self._lua_branch.insert(0,"public")
        self._lua_branch.pack(side="left",padx=4)
        self._btn(dr,"+ Add",self._lua_add,color=P["sf3"]).pack(side="left",padx=8)
        self._btn(dr,"Clear",self._lua_clear,color=P["sf3"]).pack(side="left",padx=4)
        self._lua_depots: dict = {}
        self._lua_dlbl = self._lbl(dr,"No depots",dim=True)
        self._lua_dlbl.pack(side="left",padx=10)

        br = tk.Frame(f, bg=P["bg"])
        br.pack(fill="x", padx=16, pady=4)
        for txt, cmd, col in [
            ("Generate",  self._lua_gen,  P["accent2"]),
            ("Save .lua", self._lua_save, None),
            ("Load .lua", self._lua_load, None),
            ("Copy",      self._lua_copy, None),
            ("Clear",     lambda: self._lua_text.delete("1.0","end"), P["sf3"]),
        ]:
            self._btn(br, txt, cmd, color=col).pack(side="left", padx=4)

        self._lua_text = scrolledtext.ScrolledText(
            f, bg=P["surface"], fg=P["text"], insertbackground=P["text"],
            font=("Consolas",10), relief="flat")
        self._lua_text.pack(fill="both", expand=True, padx=16, pady=(0,16))

    def _lua_add(self):
        did = self._lua_did.get().strip()
        br  = self._lua_branch.get().strip() or "public"
        if did:
            self._lua_depots[did] = br
            self._lua_dlbl.config(text=f"{len(self._lua_depots)} depot(s)")

    def _lua_clear(self):
        self._lua_depots.clear()
        self._lua_dlbl.config(text="No depots")

    def _lua_gen(self):
        appid = self._lua_appid.get().strip()
        if not appid:
            messagebox.showwarning("SteamKit","Enter an AppID"); return
        self._lua_text.delete("1.0","end")
        self._lua_text.insert("1.0", gen_lua(appid, self._lua_name.get().strip(),
                                              self._lua_depots or None,
                                              self._lua_unlocked.get()))

    def _lua_save(self):
        c = self._lua_text.get("1.0","end").strip()
        if not c: return
        appid = self._lua_appid.get().strip() or "app"
        p = os.path.join(self._outdir(),"lua",f"{appid}.lua")
        os.makedirs(os.path.dirname(p),exist_ok=True)
        with open(p,"w") as fh: fh.write(c)
        self._log(f"Saved Lua → {p}","green")
        messagebox.showinfo("Saved",p)

    def _lua_load(self):
        p = filedialog.askopenfilename(filetypes=[("Lua","*.lua"),("All","*.*")])
        if p:
            with open(p) as fh:
                self._lua_text.delete("1.0","end")
                self._lua_text.insert("1.0",fh.read())

    def _lua_copy(self):
        self.clipboard_clear()
        self.clipboard_append(self._lua_text.get("1.0","end"))
        self._log("Lua config copied","blue")

    # ─────────────────────────────────────────────────────────────────────────
    # DEPOT MANAGER
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_depot(self, f):
        self._hdr(f, "Depot Manager", "Pin depots to specific branches/manifests")
        body = tk.Frame(f, bg=P["bg"])
        body.pack(fill="both", expand=True, padx=16, pady=12)

        left = tk.Frame(body, bg=P["bg"])
        left.pack(side="left", fill="both", expand=True, padx=(0,10))
        self._lbl(left,"Pinned Depots",size=10,color=P["accent"]).pack(anchor="w",pady=(0,6))
        cols = ("depot","branch","manifest","appid","os")
        self._dtree = ttk.Treeview(left, columns=cols, show="headings", height=18)
        for c, w, l in [("depot",90,"Depot ID"),("branch",90,"Branch"),
                         ("manifest",120,"Manifest ID"),("appid",90,"AppID"),("os",80,"OS")]:
            self._dtree.heading(c, text=l)
            self._dtree.column(c, width=w, minwidth=50)
        vsb = ttk.Scrollbar(left, orient="vertical", command=self._dtree.yview)
        self._dtree.configure(yscrollcommand=vsb.set)
        self._dtree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        self._reload_dtree()

        right = tk.Frame(body, bg=P["bg"], width=290)
        right.pack(side="right", fill="y")
        right.pack_propagate(False)
        es = self._sec(right,"Add / Edit Pin")
        es.pack(fill="x")

        def ef(lbl, default=""):
            r = tk.Frame(es, bg=P["bg"])
            r.pack(fill="x", padx=10, pady=4)
            self._lbl(r, lbl, dim=True).pack(anchor="w")
            e = self._entry(r)
            e.pack(fill="x")
            if default: e.insert(0, default)
            return e

        self._dep_id  = ef("Depot ID")
        self._dep_br  = ef("Branch","public")
        self._dep_mid = ef("Manifest ID (optional)")
        self._dep_aid = ef("AppID")
        self._dep_os  = tk.StringVar(value="any")
        ro = tk.Frame(es, bg=P["bg"])
        ro.pack(fill="x", padx=10, pady=4)
        self._lbl(ro,"OS Override:",dim=True).pack(anchor="w")
        ttk.Combobox(ro, textvariable=self._dep_os,
                     values=["any","windows","linux","macos"],
                     state="readonly").pack(fill="x")
        br2 = tk.Frame(es, bg=P["bg"])
        br2.pack(fill="x", padx=10, pady=8)
        self._btn(br2,"Save Pin",  self._dep_save,   color=P["accent2"]).pack(side="left",padx=3)
        self._btn(br2,"Remove",    self._dep_remove,  color=P["red"]).pack(side="left",padx=3)

        exs = self._sec(right,"Export")
        exs.pack(fill="x", pady=10)
        er = tk.Frame(exs, bg=P["bg"])
        er.pack(fill="x", padx=10, pady=8)
        self._btn(er,"Export depot_config.lua",self._dep_export,color=P["sf3"]).pack(fill="x")
        self._btn(er,"Export as JSON",         self._dep_export_json,color=P["sf3"]).pack(fill="x",pady=4)

    def _reload_dtree(self):
        for i in self._dtree.get_children(): self._dtree.delete(i)
        for did, info in self.cfg.get("depot_pins",{}).items():
            self._dtree.insert("","end",values=(did,info.get("branch","public"),
                info.get("manifest",""),info.get("appid",""),info.get("os","any")))

    def _dep_save(self):
        did = self._dep_id.get().strip()
        if not did: return
        self.cfg.setdefault("depot_pins",{})[did] = {
            "branch":   self._dep_br.get().strip() or "public",
            "manifest": self._dep_mid.get().strip(),
            "appid":    self._dep_aid.get().strip(),
            "os":       self._dep_os.get(),
        }
        save_config(self.cfg); self._reload_dtree()
        self._log(f"Saved depot pin: {did}","green")

    def _dep_remove(self):
        for item in self._dtree.selection():
            did = self._dtree.item(item,"values")[0]
            self.cfg.get("depot_pins",{}).pop(did,None)
        save_config(self.cfg); self._reload_dtree()

    def _dep_export(self):
        pins = self.cfg.get("depot_pins",{})
        if not pins: messagebox.showinfo("SteamKit","No pins to export"); return
        lines = ["-- SteamKit Manager - depot_config.lua\nreturn {\n  depots = {"]
        for did, i in pins.items():
            lines.append(f'    ["{did}"] = {{branch="{i["branch"]}",manifest="{i["manifest"]}",appid="{i["appid"]}",os="{i["os"]}"}},')
        lines.append("  },\n}")
        p = os.path.join(self._outdir(),"depot_config.lua")
        with open(p,"w") as fh: fh.write("\n".join(lines))
        self._log(f"Exported depot config → {p}","green")
        messagebox.showinfo("Exported",p)

    def _dep_export_json(self):
        p = os.path.join(self._outdir(),"depot_config.json")
        with open(p,"w") as fh: json.dump(self.cfg.get("depot_pins",{}),fh,indent=2)
        self._log(f"Exported depot JSON → {p}","green")
        messagebox.showinfo("Exported",p)

    # ─────────────────────────────────────────────────────────────────────────
    # BATCH TOOLS
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_batch(self, f):
        self._hdr(f, "Batch Tools", f"Process all {len(GAMES)} games at once")
        body = tk.Frame(f, bg=P["bg"])
        body.pack(fill="both", expand=True, padx=16, pady=12)

        os_ = self._sec(body,"Batch Options")
        os_.pack(fill="x", pady=(0,10))
        or_ = tk.Frame(os_, bg=P["bg"])
        or_.pack(fill="x", padx=12, pady=10)

        self._batch_manifest   = tk.BooleanVar(value=True)
        self._batch_lua        = tk.BooleanVar(value=True)
        self._batch_unlocked   = tk.BooleanVar(value=True)
        self._batch_copy_steam = tk.BooleanVar(value=False)

        left_opts = tk.Frame(or_, bg=P["bg"])
        left_opts.pack(side="left")
        for var, lbl in [
            (self._batch_manifest,   "Generate Manifests (.acf)"),
            (self._batch_lua,        "Generate Lua Configs (.lua)"),
            (self._batch_unlocked,   "Mark as Unlocked in Lua"),
            (self._batch_copy_steam, "Auto-copy Manifests → Steam/steamapps/"),
        ]:
            tk.Checkbutton(left_opts, text=lbl, variable=var,
                           bg=P["bg"], fg=P["text"], selectcolor=P["sf2"],
                           activebackground=P["bg"],
                           font=("Segoe UI",10)).pack(anchor="w",pady=3)

        gfr = tk.Frame(or_, bg=P["bg"])
        gfr.pack(side="right", anchor="n", padx=30)
        self._lbl(gfr,"Genre filter:",size=9,color=P["accent"]).pack(anchor="w")
        self._batch_genre = tk.StringVar(value="All")
        ttk.Combobox(gfr, textvariable=self._batch_genre,
                     values=["All"]+GENRES, state="readonly", width=22).pack(pady=4)

        acs = self._sec(body,"Run")
        acs.pack(fill="x", pady=(0,10))
        ar = tk.Frame(acs, bg=P["bg"])
        ar.pack(fill="x", padx=12, pady=12)
        self._btn(ar,"▶  Process All Games",  self._bulk_all,          color=P["accent2"],size=11).pack(side="left",padx=5,ipady=4,ipadx=20)
        self._btn(ar,"▶  Process Selected",   self._process_selected,  color=P["green"]).pack(side="left",padx=5)
        self._btn(ar,"🚀  Copy → Steam",       self._copy_to_steam,    color=P["purple"]).pack(side="left",padx=5)
        self._btn(ar,"🗑  Clear Output",        self._clear_output,     color=P["red"]).pack(side="left",padx=5)
        self._btn(ar,"📁  Open Output Folder", self._open_folder,      color=P["sf3"]).pack(side="left",padx=5)

        bls = self._sec(body,"Batch Log")
        bls.pack(fill="both", expand=True)
        self._batch_log = scrolledtext.ScrolledText(
            bls, bg=P["surface"], fg=P["text"], insertbackground=P["text"],
            font=("Consolas",9), relief="flat", state="disabled")
        self._batch_log.pack(fill="both", expand=True, padx=8, pady=8)
        for tag, col in [("green",P["green"]),("red",P["red"]),
                          ("yellow",P["yellow"]),("blue",P["accent"]),
                          ("dim",P["dim"])]:
            self._batch_log.tag_configure(tag, foreground=col)

    def _clear_output(self):
        out = self._outdir()
        if messagebox.askyesno("Clear",f"Delete everything in:\n{out}?"):
            shutil.rmtree(out, ignore_errors=True)
            os.makedirs(out)
            self._log("Output folder cleared","yellow")

    def _copy_to_steam(self):
        steam = self.cfg.get("steam_path","").strip()
        if not steam or not os.path.isdir(steam):
            # auto-detect one more time
            detected = _detect_steam()
            if os.path.isdir(detected):
                steam = detected
                self.cfg["steam_path"] = steam
                save_config(self.cfg)
                self._log(f"Auto-detected Steam at: {steam}","blue")
            else:
                messagebox.showwarning("SteamKit",
                    "Steam path not found.\n\nGo to Settings and set your Steam path.\n"
                    "Usually: C:\\Program Files (x86)\\Steam")
                self._show("settings")
                return
        sa = os.path.join(steam, "steamapps")
        if not os.path.isdir(sa):
            messagebox.showwarning("SteamKit",
                f"steamapps folder not found:\n{sa}\n\n"
                "Make sure Steam is installed and the path is correct.")
            return
        m_dir = os.path.join(self._outdir(), "manifests")
        if not os.path.isdir(m_dir) or not any(fn.endswith(".acf") for fn in os.listdir(m_dir)):
            if messagebox.askyesno("SteamKit",
                "No manifests found yet.\nGenerate manifests for all games first?"):
                self._gen_all_manifests()
            return
        copied = 0
        for fn in os.listdir(m_dir):
            if fn.endswith(".acf"):
                try:
                    shutil.copy2(os.path.join(m_dir,fn), os.path.join(sa,fn))
                    copied += 1
                except PermissionError as e:
                    self._log(f"Permission error: {fn} — try running as admin","red")
        self._log(f"Copied {copied} .acf files → {sa}","green")
        messagebox.showinfo("Done",
            f"✓ Copied {copied} manifests to:\n{sa}\n\n"
            "Restart Steam to see the games.")

    # ─────────────────────────────────────────────────────────────────────────
    # SETTINGS
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_settings(self, f):
        self._hdr(f, "Settings")
        body = tk.Frame(f, bg=P["bg"])
        body.pack(fill="both", expand=True, padx=16, pady=12)

        ps = self._sec(body,"Paths")
        ps.pack(fill="x", pady=(0,12))

        self._cfg_vars = {}

        def prow(key, lbl, hint=""):
            r = tk.Frame(ps, bg=P["bg"])
            r.pack(fill="x", padx=12, pady=8)
            self._lbl(r, lbl, size=10).pack(anchor="w")
            if hint:
                self._lbl(r, hint, dim=True, size=8).pack(anchor="w")
            r2 = tk.Frame(r, bg=P["bg"])
            r2.pack(fill="x", pady=3)
            var = tk.StringVar(value=self.cfg.get(key,""))
            self._cfg_vars[key] = var
            self._entry(r2, textvariable=var, font=("Segoe UI",10)).pack(
                side="left", fill="x", expand=True, padx=(0,8))
            self._btn(r2, "Browse",
                      lambda v=var: v.set(filedialog.askdirectory() or v.get()),
                      color=P["sf3"]).pack(side="right")

        prow("steam_path","Steam Installation Path",
             "e.g.  C:\\Program Files (x86)\\Steam")
        prow("millennium_path","Millennium Client Path",
             "Folder containing Millennium.exe")
        prow("manifest_dir","Manifest Output Directory",
             "Where .acf and .lua files are saved")
        prow("lua_config_dir","Lua Config Output Directory (optional)",
             "Defaults to manifest_dir/lua/")

        ar = tk.Frame(body, bg=P["bg"])
        ar.pack(fill="x", pady=6)
        self._btn(ar,"💾  Save Settings", self._save_settings,
                  color=P["accent2"], size=11).pack(side="left", ipady=5, ipadx=20)
        self._btn(ar,"🔍  Auto-detect Steam",
                  lambda: self._autodetect_steam(),
                  color=P["sf3"]).pack(side="left", padx=10)

        info = self._sec(body,"About")
        info.pack(fill="x", pady=10)
        for ln in [
            f"SteamKit Manager  v{VERSION}",
            f"{len(GAMES)} games across {len(GENRES)} genres",
            "Manages Steam manifests, AppIDs, depot configs and Lua scripts.",
            "Compatible with Millennium client and stplug-in Lua framework.",
            f"Config: {CONFIG_FILE}",
        ]:
            self._lbl(info, ln, dim=True, size=9).pack(anchor="w", padx=12, pady=2)

    def _save_settings(self):
        for key, var in self._cfg_vars.items():
            self.cfg[key] = var.get()
        save_config(self.cfg)
        self._log("Settings saved","green")
        messagebox.showinfo("Saved","Settings saved!")

    def _autodetect_steam(self):
        p = _detect_steam()
        if os.path.isdir(p):
            self._cfg_vars["steam_path"].set(p)
            self.cfg["steam_path"] = p
            save_config(self.cfg)
            self._log(f"Auto-detected Steam at: {p}","green")
            messagebox.showinfo("Found",f"Steam detected at:\n{p}")
        else:
            messagebox.showwarning("Not Found","Could not auto-detect Steam.")

    # ─────────────────────────────────────────────────────────────────────────
    # LOG PAGE
    # ─────────────────────────────────────────────────────────────────────────
    def _pg_log(self, f):
        self._hdr(f, "Activity Log")
        br = tk.Frame(f, bg=P["bg"])
        br.pack(fill="x", padx=14, pady=8)
        self._btn(br,"Clear",self._clear_log,color=P["sf3"]).pack(side="left")
        self._btn(br,"Save Log",self._save_log).pack(side="left",padx=8)

        self._main_log = scrolledtext.ScrolledText(
            f, bg=P["surface"], fg=P["text"], insertbackground=P["text"],
            font=("Consolas",9), relief="flat")
        self._main_log.pack(fill="both", expand=True, padx=14, pady=(0,14))
        self._main_log.config(state="disabled")
        for tag, col in [("green",P["green"]),("red",P["red"]),
                          ("yellow",P["yellow"]),("blue",P["accent"]),
                          ("purple",P["purple"]),("dim",P["dim"])]:
            self._main_log.tag_configure(tag, foreground=col)
        self._log_widgets.append(self._main_log)

    def _clear_log(self):
        for w in self._log_widgets:
            w.config(state="normal")
            w.delete("1.0","end")
            w.config(state="disabled")

    def _save_log(self):
        p = filedialog.asksaveasfilename(defaultextension=".txt",
                                          filetypes=[("Text","*.txt"),("All","*.*")])
        if p:
            with open(p,"w") as fh: fh.write(self._main_log.get("1.0","end"))

    # ─────────────────────────────────────────────────────────────────────────
    # BATCH / GENERATION LOGIC
    # ─────────────────────────────────────────────────────────────────────────
    def _gen_for(self, appid, name):
        out   = self._outdir()
        m_dir = os.path.join(out,"manifests")
        l_dir = os.path.join(out,"lua")
        os.makedirs(m_dir, exist_ok=True)
        os.makedirs(l_dir, exist_ok=True)
        do_m  = not hasattr(self,"_batch_manifest") or self._batch_manifest.get()
        do_l  = not hasattr(self,"_batch_lua")      or self._batch_lua.get()
        do_ul = self._batch_unlocked.get() if hasattr(self,"_batch_unlocked") else True
        if do_m:
            with open(os.path.join(m_dir,f"appmanifest_{appid}.acf"),"w") as fh:
                fh.write(gen_manifest(appid, name))
        if do_l:
            with open(os.path.join(l_dir,f"{appid}.lua"),"w") as fh:
                fh.write(gen_lua(appid, name, unlocked=do_ul))
        installed = self.cfg.setdefault("installed_apps",[])
        if appid not in installed:
            installed.append(appid)

    def _run_batch(self, games):
        self._setstatus("Working…","yellow")
        total = len(games); done = 0
        for name, appid in games:
            try:
                self._gen_for(appid, name)
                done += 1
                pct = done / total * 100
                self._prog_var.set(pct)
                self._prog_lbl.config(text=f"{done}/{total}  —  {name}")
                self._log(f"✓  {name}  ({appid})","green")
                # also log to batch log
                if hasattr(self,"_batch_log"):
                    self._batch_log.config(state="normal")
                    self._batch_log.insert("end",f"✓ {name} ({appid})\n","green")
                    self._batch_log.see("end")
                    self._batch_log.config(state="disabled")
            except Exception as e:
                self._log(f"✗  {name}  —  {e}","red")
        save_config(self.cfg)
        self._load_games()
        if hasattr(self,"_batch_copy_steam") and self._batch_copy_steam.get():
            self._copy_to_steam()
        self._prog_lbl.config(text=f"Done! {done}/{total} processed")
        self._setstatus("Done","green")
        self._log(f"\n✓  Batch complete: {done}/{total} → {self._outdir()}","blue")

    def _bulk_all(self):
        gf = self._batch_genre.get() if hasattr(self,"_batch_genre") else "All"
        games = [(name,appid) for name,appid,genre,size in GAMES
                 if gf == "All" or genre == gf]
        n = len(games)
        if not messagebox.askyesno("SteamKit",
            f"Process {n} games?\n\n"
            f"Output folder:\n{self._outdir()}\n\nContinue?"):
            return
        threading.Thread(target=self._run_batch, args=(games,), daemon=True).start()

    def _process_selected(self):
        sel = self._tree.selection() if hasattr(self,"_tree") else []
        if not sel:
            messagebox.showwarning("SteamKit","Select games in the Games Library first")
            return
        games = [(v[0],v[1]) for item in sel
                 for v in [self._tree.item(item,"values")]]
        if games:
            threading.Thread(target=self._run_batch, args=(games,), daemon=True).start()

    def _manifest_sel(self):
        sel = self._tree.selection() if hasattr(self,"_tree") else []
        m_dir = os.path.join(self._outdir(),"manifests")
        os.makedirs(m_dir,exist_ok=True)
        count = 0
        for item in sel:
            v = self._tree.item(item,"values")
            with open(os.path.join(m_dir,f"appmanifest_{v[1]}.acf"),"w") as fh:
                fh.write(gen_manifest(v[1],v[0]))
            count += 1
        self._log(f"Generated {count} manifests","green")

    def _lua_sel(self):
        sel = self._tree.selection() if hasattr(self,"_tree") else []
        l_dir = os.path.join(self._outdir(),"lua")
        os.makedirs(l_dir,exist_ok=True)
        count = 0
        for item in sel:
            v = self._tree.item(item,"values")
            with open(os.path.join(l_dir,f"{v[1]}.lua"),"w") as fh:
                fh.write(gen_lua(v[1],v[0]))
            count += 1
        self._log(f"Generated {count} Lua configs","green")

    def _gen_all_manifests(self):
        m_dir = os.path.join(self._outdir(),"manifests")
        os.makedirs(m_dir,exist_ok=True)
        for name,appid,genre,size in GAMES:
            with open(os.path.join(m_dir,f"appmanifest_{appid}.acf"),"w") as fh:
                fh.write(gen_manifest(appid,name))
        self._log(f"Generated {len(GAMES)} manifests → {m_dir}","green")
        messagebox.showinfo("Done",f"{len(GAMES)} manifests in:\n{m_dir}")

    def _gen_all_lua(self):
        l_dir = os.path.join(self._outdir(),"lua")
        os.makedirs(l_dir,exist_ok=True)
        for name,appid,genre,size in GAMES:
            with open(os.path.join(l_dir,f"{appid}.lua"),"w") as fh:
                fh.write(gen_lua(appid,name))
        self._log(f"Generated {len(GAMES)} Lua configs → {l_dir}","green")
        messagebox.showinfo("Done",f"{len(GAMES)} Lua configs in:\n{l_dir}")


if __name__ == "__main__":
    app = App()
    app.mainloop()
