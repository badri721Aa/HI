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
import webbrowser
import sys

APP_TITLE = "SteamKit Manager"
VERSION = "2.0.0"
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".steamkit_manager.json")

FAMOUS_GAMES = [
    {"name": "Counter-Strike 2",                    "appid": "730",     "size": "25 GB",   "genre": "FPS"},
    {"name": "Dota 2",                               "appid": "570",     "size": "20 GB",   "genre": "MOBA"},
    {"name": "Grand Theft Auto V",                   "appid": "271590",  "size": "95 GB",   "genre": "Action"},
    {"name": "Red Dead Redemption 2",                "appid": "1174180", "size": "120 GB",  "genre": "Action"},
    {"name": "Cyberpunk 2077",                       "appid": "1091500", "size": "70 GB",   "genre": "RPG"},
    {"name": "Elden Ring",                           "appid": "1245620", "size": "60 GB",   "genre": "Action RPG"},
    {"name": "Baldur's Gate 3",                      "appid": "1086940", "size": "122 GB",  "genre": "RPG"},
    {"name": "Hogwarts Legacy",                      "appid": "990080",  "size": "76 GB",   "genre": "Action RPG"},
    {"name": "The Witcher 3: Wild Hunt",             "appid": "292030",  "size": "50 GB",   "genre": "RPG"},
    {"name": "Dark Souls III",                       "appid": "374320",  "size": "15 GB",   "genre": "Action RPG"},
    {"name": "ELDEN RING Shadow of the Erdtree",     "appid": "2778580", "size": "8 GB",    "genre": "DLC"},
    {"name": "God of War",                           "appid": "1593500", "size": "34 GB",   "genre": "Action"},
    {"name": "God of War Ragnarök",                  "appid": "2322010", "size": "190 GB",  "genre": "Action"},
    {"name": "Horizon Zero Dawn Remastered",         "appid": "1151640", "size": "72 GB",   "genre": "Action RPG"},
    {"name": "Sekiro: Shadows Die Twice",            "appid": "814380",  "size": "12 GB",   "genre": "Action RPG"},
    {"name": "DOOM Eternal",                         "appid": "782330",  "size": "50 GB",   "genre": "FPS"},
    {"name": "Resident Evil Village",                "appid": "1196590", "size": "35 GB",   "genre": "Horror"},
    {"name": "Resident Evil 4 Remake",               "appid": "2050650", "size": "67 GB",   "genre": "Horror"},
    {"name": "Resident Evil 2 Remake",               "appid": "883710",  "size": "26 GB",   "genre": "Horror"},
    {"name": "Detroit: Become Human",                "appid": "1222140", "size": "38 GB",   "genre": "Adventure"},
    {"name": "Death Stranding",                      "appid": "1190460", "size": "55 GB",   "genre": "Action"},
    {"name": "Hades",                                "appid": "1145360", "size": "5 GB",    "genre": "Roguelike"},
    {"name": "Hades II",                             "appid": "1145350", "size": "7 GB",    "genre": "Roguelike"},
    {"name": "Monster Hunter: World",                "appid": "582010",  "size": "48 GB",   "genre": "Action RPG"},
    {"name": "Monster Hunter Rise",                  "appid": "1446780", "size": "23 GB",   "genre": "Action RPG"},
    {"name": "Monster Hunter Wilds",                 "appid": "2246340", "size": "75 GB",   "genre": "Action RPG"},
    {"name": "Deep Rock Galactic",                   "appid": "548430",  "size": "8 GB",    "genre": "Co-op FPS"},
    {"name": "Valheim",                              "appid": "892970",  "size": "4 GB",    "genre": "Survival"},
    {"name": "Terraria",                             "appid": "105600",  "size": "200 MB",  "genre": "Sandbox"},
    {"name": "Stardew Valley",                       "appid": "413150",  "size": "500 MB",  "genre": "Farming Sim"},
    {"name": "Hollow Knight",                        "appid": "367520",  "size": "8 GB",    "genre": "Metroidvania"},
    {"name": "Hollow Knight: Silksong",              "appid": "1030300", "size": "4 GB",    "genre": "Metroidvania"},
    {"name": "Celeste",                              "appid": "504230",  "size": "1.3 GB",  "genre": "Platformer"},
    {"name": "Cuphead",                              "appid": "268910",  "size": "4 GB",    "genre": "Run & Gun"},
    {"name": "Disco Elysium",                        "appid": "632470",  "size": "20 GB",   "genre": "RPG"},
    {"name": "Divinity: Original Sin 2",             "appid": "435150",  "size": "45 GB",   "genre": "RPG"},
    {"name": "Pathfinder: Wrath of the Righteous",   "appid": "1184370", "size": "40 GB",   "genre": "RPG"},
    {"name": "Total War: Warhammer III",             "appid": "1142710", "size": "120 GB",  "genre": "Strategy"},
    {"name": "Crusader Kings III",                   "appid": "1158310", "size": "5 GB",    "genre": "Strategy"},
    {"name": "Victoria 3",                           "appid": "529340",  "size": "5 GB",    "genre": "Strategy"},
    {"name": "Civilization VI",                      "appid": "289070",  "size": "12 GB",   "genre": "Strategy"},
    {"name": "XCOM 2",                               "appid": "268500",  "size": "22 GB",   "genre": "Strategy"},
    {"name": "Astroneer",                            "appid": "361420",  "size": "10 GB",   "genre": "Exploration"},
    {"name": "No Man's Sky",                         "appid": "275850",  "size": "15 GB",   "genre": "Exploration"},
    {"name": "Subnautica",                           "appid": "264710",  "size": "9 GB",    "genre": "Survival"},
    {"name": "The Forest",                           "appid": "242760",  "size": "4 GB",    "genre": "Survival Horror"},
    {"name": "Green Hell",                           "appid": "815370",  "size": "8 GB",    "genre": "Survival"},
    {"name": "Project Zomboid",                      "appid": "108600",  "size": "3 GB",    "genre": "Survival"},
    {"name": "DayZ",                                 "appid": "221100",  "size": "16 GB",   "genre": "Survival"},
    {"name": "Rust",                                 "appid": "252490",  "size": "22 GB",   "genre": "Survival"},
    {"name": "ARK: Survival Evolved",                "appid": "346110",  "size": "400 GB",  "genre": "Survival"},
    {"name": "ARK: Survival Ascended",               "appid": "2399830", "size": "60 GB",   "genre": "Survival"},
    {"name": "Palworld",                             "appid": "1623730", "size": "45 GB",   "genre": "Survival"},
    {"name": "Sons Of The Forest",                   "appid": "1326470", "size": "16 GB",   "genre": "Survival Horror"},
    {"name": "Enshrouded",                           "appid": "1203620", "size": "12 GB",   "genre": "Survival RPG"},
    {"name": "V Rising",                             "appid": "1604030", "size": "8 GB",    "genre": "Survival"},
    {"name": "Phasmophobia",                         "appid": "739630",  "size": "16 GB",   "genre": "Horror"},
    {"name": "Among Us",                             "appid": "945360",  "size": "250 MB",  "genre": "Party"},
    {"name": "Fall Guys",                            "appid": "1097150", "size": "3 GB",    "genre": "Battle Royale"},
    {"name": "Apex Legends",                         "appid": "1172470", "size": "100 GB",  "genre": "Battle Royale"},
    {"name": "Warframe",                             "appid": "230410",  "size": "35 GB",   "genre": "Action RPG"},
    {"name": "Path of Exile",                        "appid": "238960",  "size": "30 GB",   "genre": "ARPG"},
    {"name": "Path of Exile 2",                      "appid": "2694490", "size": "40 GB",   "genre": "ARPG"},
    {"name": "Lost Ark",                             "appid": "1599340", "size": "50 GB",   "genre": "ARPG"},
    {"name": "New World",                            "appid": "1063730", "size": "50 GB",   "genre": "MMO"},
    {"name": "Team Fortress 2",                      "appid": "440",     "size": "15 GB",   "genre": "FPS"},
    {"name": "Left 4 Dead 2",                        "appid": "550",     "size": "13 GB",   "genre": "Co-op FPS"},
    {"name": "Garry's Mod",                          "appid": "4000",    "size": "5 GB",    "genre": "Sandbox"},
    {"name": "Half-Life: Alyx",                      "appid": "546560",  "size": "67 GB",   "genre": "VR FPS"},
    {"name": "Portal 2",                             "appid": "620",     "size": "11 GB",   "genre": "Puzzle"},
    {"name": "Borderlands 3",                        "appid": "397540",  "size": "75 GB",   "genre": "Looter Shooter"},
    {"name": "Tiny Tina's Wonderlands",              "appid": "1286680", "size": "39 GB",   "genre": "Looter Shooter"},
    {"name": "Mass Effect Legendary Edition",        "appid": "1328670", "size": "120 GB",  "genre": "RPG"},
    {"name": "Dragon Age: Inquisition",              "appid": "1222690", "size": "26 GB",   "genre": "RPG"},
    {"name": "Dragon Age: The Veilguard",            "appid": "1845910", "size": "100 GB",  "genre": "RPG"},
    {"name": "Starfield",                            "appid": "1716740", "size": "125 GB",  "genre": "RPG"},
    {"name": "The Elder Scrolls V: Skyrim SE",       "appid": "489830",  "size": "12 GB",   "genre": "RPG"},
    {"name": "Fallout 4",                            "appid": "377160",  "size": "30 GB",   "genre": "RPG"},
    {"name": "Fallout 76",                           "appid": "1151340", "size": "110 GB",  "genre": "MMO RPG"},
    {"name": "Sea of Thieves",                       "appid": "1172620", "size": "35 GB",   "genre": "Adventure"},
    {"name": "Halo: The Master Chief Collection",    "appid": "976730",  "size": "100 GB",  "genre": "FPS"},
    {"name": "Forza Horizon 5",                      "appid": "1551360", "size": "110 GB",  "genre": "Racing"},
    {"name": "Forza Motorsport",                     "appid": "2440510", "size": "90 GB",   "genre": "Racing"},
    {"name": "Microsoft Flight Simulator 2020",      "appid": "1250410", "size": "170 GB",  "genre": "Sim"},
    {"name": "Microsoft Flight Simulator 2024",      "appid": "2537590", "size": "50 GB",   "genre": "Sim"},
    {"name": "Age of Empires IV",                    "appid": "1466860", "size": "50 GB",   "genre": "RTS"},
    {"name": "Gears 5",                              "appid": "1097840", "size": "63 GB",   "genre": "TPS"},
    {"name": "Control",                              "appid": "870780",  "size": "40 GB",   "genre": "Action"},
    {"name": "Alan Wake 2",                          "appid": "1903790", "size": "90 GB",   "genre": "Horror"},
    {"name": "Immortals Fenyx Rising",               "appid": "1278060", "size": "40 GB",   "genre": "Action RPG"},
    {"name": "Assassin's Creed Valhalla",            "appid": "2208920", "size": "50 GB",   "genre": "Action RPG"},
    {"name": "Assassin's Creed Mirage",              "appid": "2461810", "size": "40 GB",   "genre": "Action"},
    {"name": "Assassin's Creed Shadows",             "appid": "2933620", "size": "80 GB",   "genre": "Action RPG"},
    {"name": "Far Cry 6",                            "appid": "2369390", "size": "60 GB",   "genre": "FPS"},
    {"name": "Ghost of Tsushima",                    "appid": "2215430", "size": "75 GB",   "genre": "Action"},
    {"name": "Spider-Man Remastered",                "appid": "1817070", "size": "75 GB",   "genre": "Action"},
    {"name": "Spider-Man: Miles Morales",            "appid": "1817190", "size": "50 GB",   "genre": "Action"},
    {"name": "Spider-Man 2",                         "appid": "2459660", "size": "80 GB",   "genre": "Action"},
    {"name": "Ratchet & Clank: Rift Apart",          "appid": "1895880", "size": "60 GB",   "genre": "Platformer"},
    {"name": "Returnal",                             "appid": "1649240", "size": "60 GB",   "genre": "Roguelike"},
    {"name": "The Last of Us Part I",                "appid": "1888930", "size": "100 GB",  "genre": "Action Adventure"},
    {"name": "The Last of Us Part II Remastered",    "appid": "2531310", "size": "100 GB",  "genre": "Action Adventure"},
    {"name": "Atomic Heart",                         "appid": "668580",  "size": "40 GB",   "genre": "FPS"},
    {"name": "Lies of P",                            "appid": "1627720", "size": "22 GB",   "genre": "Action RPG"},
    {"name": "Lords of the Fallen 2023",             "appid": "1501750", "size": "45 GB",   "genre": "Action RPG"},
    {"name": "Star Wars Jedi: Survivor",             "appid": "1774580", "size": "155 GB",  "genre": "Action"},
    {"name": "Star Wars Jedi: Fallen Order",         "appid": "1172380", "size": "48 GB",   "genre": "Action"},
    {"name": "Dead Space Remake",                    "appid": "1693980", "size": "50 GB",   "genre": "Horror"},
    {"name": "Callisto Protocol",                    "appid": "1272130", "size": "44 GB",   "genre": "Horror"},
    {"name": "A Plague Tale: Requiem",               "appid": "1182900", "size": "55 GB",   "genre": "Action Adventure"},
    {"name": "A Plague Tale: Innocence",             "appid": "752590",  "size": "34 GB",   "genre": "Action Adventure"},
    {"name": "SOMA",                                 "appid": "282140",  "size": "20 GB",   "genre": "Horror"},
    {"name": "Amnesia: Rebirth",                     "appid": "999220",  "size": "10 GB",   "genre": "Horror"},
    {"name": "Little Nightmares II",                 "appid": "860510",  "size": "12 GB",   "genre": "Horror"},
    {"name": "Ghostwire: Tokyo",                     "appid": "1475810", "size": "20 GB",   "genre": "Action"},
    {"name": "Nioh 2",                               "appid": "1325200", "size": "50 GB",   "genre": "Action RPG"},
    {"name": "Wo Long: Fallen Dynasty",              "appid": "2118810", "size": "30 GB",   "genre": "Action RPG"},
    {"name": "Wild Hearts",                          "appid": "2046960", "size": "50 GB",   "genre": "Action RPG"},
    {"name": "Armored Core VI",                      "appid": "1888160", "size": "60 GB",   "genre": "Action"},
    {"name": "Warhammer 40K: Space Marine 2",        "appid": "2183900", "size": "75 GB",   "genre": "Action"},
    {"name": "Helldivers 2",                         "appid": "553850",  "size": "100 GB",  "genre": "Co-op TPS"},
    {"name": "Suicide Squad: Kill the Justice League","appid": "315210", "size": "65 GB",   "genre": "Action"},
    {"name": "Prince of Persia: The Lost Crown",     "appid": "1896370", "size": "10 GB",   "genre": "Metroidvania"},
    {"name": "Like a Dragon: Ishin!",               "appid": "1842650", "size": "44 GB",   "genre": "Action RPG"},
    {"name": "Like a Dragon: Infinite Wealth",       "appid": "2155230", "size": "58 GB",   "genre": "JRPG"},
    {"name": "Like a Dragon: Pirate Yakuza in Hawaii","appid":"2861580", "size": "65 GB",   "genre": "JRPG"},
    {"name": "Persona 5 Royal",                      "appid": "1687950", "size": "22 GB",   "genre": "JRPG"},
    {"name": "Persona 4 Golden",                     "appid": "1113000", "size": "15 GB",   "genre": "JRPG"},
    {"name": "Persona 3 Reload",                     "appid": "2161700", "size": "25 GB",   "genre": "JRPG"},
    {"name": "Final Fantasy XVI",                    "appid": "2515020", "size": "100 GB",  "genre": "JRPG"},
    {"name": "Final Fantasy VII Rebirth",            "appid": "2909400", "size": "150 GB",  "genre": "JRPG"},
    {"name": "Final Fantasy VII Remake",             "appid": "1462040", "size": "84 GB",   "genre": "JRPG"},
    {"name": "Final Fantasy XIV Online",             "appid": "39210",   "size": "80 GB",   "genre": "MMO"},
    {"name": "Battlefield 2042",                     "appid": "1517290", "size": "100 GB",  "genre": "FPS"},
    {"name": "Battlefield 1",                        "appid": "1238840", "size": "80 GB",   "genre": "FPS"},
    {"name": "Battlefield V",                        "appid": "1238810", "size": "80 GB",   "genre": "FPS"},
    {"name": "Call of Duty: Modern Warfare III",     "appid": "2519060", "size": "110 GB",  "genre": "FPS"},
    {"name": "Overwatch 2",                          "appid": "2357570", "size": "50 GB",   "genre": "Hero Shooter"},
    {"name": "Rainbow Six Siege",                    "appid": "359550",  "size": "50 GB",   "genre": "Tactical FPS"},
    {"name": "Hunt: Showdown",                       "appid": "594650",  "size": "30 GB",   "genre": "FPS"},
    {"name": "Back 4 Blood",                         "appid": "924970",  "size": "50 GB",   "genre": "Co-op FPS"},
    {"name": "PAYDAY 3",                             "appid": "1272080", "size": "40 GB",   "genre": "Heist"},
    {"name": "Ready or Not",                         "appid": "1144200", "size": "50 GB",   "genre": "Tactical FPS"},
    {"name": "Insurgency: Sandstorm",                "appid": "581320",  "size": "40 GB",   "genre": "Tactical FPS"},
    {"name": "Hell Let Loose",                       "appid": "686810",  "size": "30 GB",   "genre": "FPS"},
    {"name": "Squad",                                "appid": "393380",  "size": "25 GB",   "genre": "Tactical FPS"},
    {"name": "Arma 3",                               "appid": "107410",  "size": "50 GB",   "genre": "Tactical FPS"},
    {"name": "ARMA Reforger",                        "appid": "1874880", "size": "18 GB",   "genre": "Tactical FPS"},
    {"name": "War Thunder",                          "appid": "236390",  "size": "100 GB",  "genre": "Combat Sim"},
    {"name": "Elite Dangerous",                      "appid": "359320",  "size": "35 GB",   "genre": "Space Sim"},
    {"name": "Destiny 2",                            "appid": "1085660", "size": "100 GB",  "genre": "FPS RPG"},
    {"name": "The Division 2",                       "appid": "2239550", "size": "60 GB",   "genre": "TPS RPG"},
    {"name": "Ghost Recon Breakpoint",               "appid": "2134500", "size": "100 GB",  "genre": "Tactical TPS"},
    {"name": "Watch Dogs: Legion",                   "appid": "2314630", "size": "50 GB",   "genre": "Action"},
    {"name": "Metro Exodus",                         "appid": "412020",  "size": "59 GB",   "genre": "FPS"},
    {"name": "S.T.A.L.K.E.R. 2: Heart of Chornobyl","appid": "1643320", "size": "150 GB",  "genre": "FPS"},
    {"name": "Grounded",                             "appid": "962130",  "size": "8 GB",    "genre": "Survival"},
    {"name": "Deathloop",                            "appid": "1252330", "size": "30 GB",   "genre": "FPS"},
    {"name": "What Remains of Edith Finch",          "appid": "501300",  "size": "5 GB",    "genre": "Walking Sim"},
    {"name": "Inside",                               "appid": "304430",  "size": "4 GB",    "genre": "Platformer"},
    {"name": "Limbo",                                "appid": "48000",   "size": "200 MB",  "genre": "Platformer"},
    {"name": "Ori and the Will of the Wisps",        "appid": "1057090", "size": "13 GB",   "genre": "Platformer"},
    {"name": "Ghostrunner",                          "appid": "1139900", "size": "10 GB",   "genre": "Action"},
    {"name": "Ghostrunner 2",                        "appid": "2240850", "size": "20 GB",   "genre": "Action"},
    {"name": "Neon White",                           "appid": "1533420", "size": "4 GB",    "genre": "Action"},
    {"name": "Ultrakill",                            "appid": "1229490", "size": "2 GB",    "genre": "FPS"},
    {"name": "Titanfall 2",                          "appid": "1237970", "size": "48 GB",   "genre": "FPS"},
    {"name": "It Takes Two",                         "appid": "1426210", "size": "40 GB",   "genre": "Co-op"},
    {"name": "A Way Out",                            "appid": "877460",  "size": "15 GB",   "genre": "Co-op"},
    {"name": "Sackboy: A Big Adventure",             "appid": "1378630", "size": "55 GB",   "genre": "Platformer"},
    {"name": "Kena: Bridge of Spirits",              "appid": "1581630", "size": "30 GB",   "genre": "Action"},
    {"name": "Sifu",                                 "appid": "1835780", "size": "14 GB",   "genre": "Action"},
    {"name": "Vampire Survivors",                    "appid": "1794680", "size": "200 MB",  "genre": "Roguelike"},
    {"name": "Dave the Diver",                       "appid": "1868140", "size": "3 GB",    "genre": "Adventure"},
    {"name": "Tunic",                                "appid": "553420",  "size": "2 GB",    "genre": "Action Adventure"},
    {"name": "Satisfactory",                         "appid": "526870",  "size": "10 GB",   "genre": "Factory"},
    {"name": "Dyson Sphere Program",                 "appid": "1366540", "size": "4 GB",    "genre": "Factory"},
    {"name": "Factorio",                             "appid": "427520",  "size": "1 GB",    "genre": "Factory"},
    {"name": "Oxygen Not Included",                  "appid": "457140",  "size": "1 GB",    "genre": "Simulation"},
    {"name": "RimWorld",                             "appid": "294100",  "size": "1 GB",    "genre": "Colony Sim"},
    {"name": "Dwarf Fortress",                       "appid": "975370",  "size": "300 MB",  "genre": "Colony Sim"},
    {"name": "Kenshi",                               "appid": "233860",  "size": "12 GB",   "genre": "RPG"},
    {"name": "Mount & Blade II: Bannerlord",         "appid": "261550",  "size": "30 GB",   "genre": "RPG"},
    {"name": "Wartales",                             "appid": "1527950", "size": "8 GB",    "genre": "Tactical RPG"},
    {"name": "Frostpunk 2",                          "appid": "1904390", "size": "40 GB",   "genre": "Strategy"},
    {"name": "Against the Storm",                    "appid": "1336490", "size": "2 GB",    "genre": "City Builder"},
    {"name": "Anno 1800",                            "appid": "916440",  "size": "35 GB",   "genre": "City Builder"},
    {"name": "Cities: Skylines",                     "appid": "255710",  "size": "6 GB",    "genre": "City Builder"},
    {"name": "Cities: Skylines II",                  "appid": "949230",  "size": "10 GB",   "genre": "City Builder"},
    {"name": "Planet Zoo",                           "appid": "703080",  "size": "20 GB",   "genre": "Management"},
    {"name": "Planet Coaster 2",                     "appid": "2688680", "size": "10 GB",   "genre": "Management"},
    {"name": "Kerbal Space Program 2",               "appid": "954850",  "size": "15 GB",   "genre": "Space Sim"},
    {"name": "Frostpunk",                            "appid": "323190",  "size": "4 GB",    "genre": "Strategy"},
    {"name": "This War of Mine",                     "appid": "282070",  "size": "3 GB",    "genre": "Survival"},
    {"name": "Stray",                                "appid": "1332010", "size": "10 GB",   "genre": "Adventure"},
    {"name": "Journey",                              "appid": "638230",  "size": "2 GB",    "genre": "Adventure"},
    {"name": "Outer Wilds",                          "appid": "753640",  "size": "3 GB",    "genre": "Adventure"},
    {"name": "The Stanley Parable: Ultra Deluxe",    "appid": "1703340", "size": "5 GB",    "genre": "Adventure"},
    {"name": "Superliminal",                         "appid": "1049410", "size": "2 GB",    "genre": "Puzzle"},
    {"name": "The Forgotten City",                   "appid": "1173030", "size": "8 GB",    "genre": "Adventure"},
    {"name": "Unpacking",                            "appid": "1135690", "size": "500 MB",  "genre": "Puzzle"},
    {"name": "Prodeus",                              "appid": "964800",  "size": "2 GB",    "genre": "FPS"},
    {"name": "Ion Fury",                             "appid": "562860",  "size": "1 GB",    "genre": "FPS"},
    {"name": "Dusk",                                 "appid": "519860",  "size": "1 GB",    "genre": "FPS"},
    {"name": "System Shock 2023",                    "appid": "482400",  "size": "15 GB",   "genre": "FPS"},
    {"name": "Doom + Doom II",                       "appid": "2280",    "size": "1 GB",    "genre": "FPS"},
    {"name": "Forza Horizon 4",                      "appid": "1293830", "size": "80 GB",   "genre": "Racing"},
    {"name": "Need for Speed Unbound",               "appid": "1846380", "size": "50 GB",   "genre": "Racing"},
    {"name": "The Crew Motorfest",                   "appid": "2390640", "size": "60 GB",   "genre": "Racing"},
    {"name": "EA Sports FC 25",                      "appid": "2195250", "size": "50 GB",   "genre": "Sports"},
    {"name": "NBA 2K25",                             "appid": "2338770", "size": "130 GB",  "genre": "Sports"},
    {"name": "F1 24",                                "appid": "2108330", "size": "60 GB",   "genre": "Racing"},
    {"name": "Tekken 8",                             "appid": "1778820", "size": "100 GB",  "genre": "Fighting"},
    {"name": "Street Fighter 6",                     "appid": "1364780", "size": "45 GB",   "genre": "Fighting"},
    {"name": "Mortal Kombat 1",                      "appid": "1971870", "size": "100 GB",  "genre": "Fighting"},
    {"name": "Dragon Ball FighterZ",                 "appid": "678950",  "size": "9 GB",    "genre": "Fighting"},
    {"name": "Black Myth: Wukong",                   "appid": "2358720", "size": "130 GB",  "genre": "Action RPG"},
    {"name": "Metaphor: ReFantazio",                 "appid": "2679460", "size": "30 GB",   "genre": "JRPG"},
    {"name": "Wuthering Waves",                      "appid": "unavailable","size": "30 GB","genre": "Action RPG"},
    {"name": "Indiana Jones and the Great Circle",   "appid": "2677660", "size": "100 GB",  "genre": "Action Adventure"},
    {"name": "Avowed",                               "appid": "2457220", "size": "60 GB",   "genre": "RPG"},
    {"name": "Kingdom Come: Deliverance II",         "appid": "1747490", "size": "100 GB",  "genre": "RPG"},
    {"name": "Clair Obscur: Expedition 33",          "appid": "2933300", "size": "35 GB",   "genre": "JRPG"},
    {"name": "South of Midnight",                    "appid": "2594450", "size": "50 GB",   "genre": "Action"},
    {"name": "Doom: The Dark Ages",                  "appid": "2996580", "size": "100 GB",  "genre": "FPS"},
    {"name": "The Witcher 4",                        "appid": "unavailable","size": "TBD",  "genre": "RPG"},
    {"name": "GTA VI",                               "appid": "unavailable","size": "TBD",  "genre": "Action"},
    {"name": "Oblivion Remastered",                  "appid": "2623190", "size": "120 GB",  "genre": "RPG"},
    {"name": "Half-Life 3",                          "appid": "unavailable","size": "TBD",  "genre": "FPS"},
]

PALETTE = {
    "bg":       "#0d1117",
    "surface":  "#161b22",
    "surface2": "#21262d",
    "surface3": "#2d333b",
    "accent":   "#58a6ff",
    "accent2":  "#1f6feb",
    "green":    "#3fb950",
    "red":      "#f85149",
    "yellow":   "#d29922",
    "purple":   "#bc8cff",
    "orange":   "#f0883e",
    "text":     "#e6edf3",
    "text_dim": "#8b949e",
    "border":   "#30363d",
}

GENRES = sorted(set(g["genre"] for g in FAMOUS_GAMES))


def load_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {
        "steam_path": r"C:\Program Files (x86)\Steam",
        "millennium_path": "",
        "manifest_dir": os.path.join(os.path.expanduser("~"), "SteamKitOutput"),
        "lua_config_dir": "",
        "installed_apps": [],
        "depot_pins": {},
        "theme": "dark",
    }


def save_config(cfg):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def generate_lua_config(appid, name="", depots=None, unlocked=True):
    depot_block = ""
    if depots:
        lines = [f'  ["{d}"] = "{b}",' for d, b in depots.items()]
        depot_block = "  depots = {\n" + "\n".join(lines) + "\n  },"
    return f"""-- SteamKit Manager v{VERSION}
-- AppID: {appid}{f'  ({name})' if name else ''}
-- Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}

return {{
  appid    = "{appid}",
  unlocked = {"true" if unlocked else "false"},
{depot_block}
  version  = "1",
}}
"""


def generate_manifest_vdf(appid, name="", depots=None):
    depot_vdf = ""
    if depots:
        for did, mid in depots.items():
            depot_vdf += f'\t\t"{did}"\n\t\t{{\n\t\t\t"manifest"\t\t"{mid}"\n\t\t\t"size"\t\t"0"\n\t\t}}\n'
    return f'''"AppState"
{{
\t"appid"\t\t"{appid}"
\t"Universe"\t\t"1"
\t"name"\t\t"{name or f'App {appid}'}"
\t"StateFlags"\t\t"4"
\t"installdir"\t\t"{name.replace(':', '').replace('/', '-') or f'App_{appid}'}"
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


# ─── MAIN APP ─────────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.cfg = load_config()
        self.title(f"{APP_TITLE}  v{VERSION}")
        self.geometry("1300x820")
        self.minsize(1000, 660)
        self.configure(bg=PALETTE["bg"])
        try:
            self.iconbitmap(default="")
        except Exception:
            pass
        self._styles()
        self._sidebar()
        self._pages()
        self._show("dashboard")
        self._load_games()

    # ── STYLES ────────────────────────────────────────────────────────────────

    def _styles(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        bg, fg, sf2, bdr = PALETTE["bg"], PALETTE["text"], PALETTE["surface2"], PALETTE["border"]
        s.configure(".", background=bg, foreground=fg, fieldbackground=sf2,
                    bordercolor=bdr, font=("Segoe UI", 10), troughcolor=bg)
        s.configure("TNotebook", background=bg, borderwidth=0)
        s.configure("TNotebook.Tab", background=sf2, foreground=PALETTE["text_dim"],
                    padding=[14, 7], borderwidth=0)
        s.map("TNotebook.Tab",
              background=[("selected", PALETTE["accent2"])],
              foreground=[("selected", PALETTE["text"])])
        s.configure("TFrame", background=bg)
        s.configure("TLabel", background=bg, foreground=fg)
        s.configure("TEntry", fieldbackground=sf2, foreground=fg, insertcolor=fg,
                    bordercolor=bdr, relief="flat")
        s.configure("TScrollbar", background=sf2, troughcolor=bg, bordercolor=bdr,
                    arrowcolor=PALETTE["text_dim"])
        s.configure("Treeview", background=PALETTE["surface"], foreground=fg,
                    fieldbackground=PALETTE["surface"], borderwidth=0, rowheight=30)
        s.map("Treeview", background=[("selected", PALETTE["accent2"])],
              foreground=[("selected", fg)])
        s.configure("Treeview.Heading", background=sf2, foreground=fg, relief="flat",
                    font=("Segoe UI", 9, "bold"))
        s.configure("TProgressbar", background=PALETTE["accent"],
                    troughcolor=PALETTE["surface2"], bordercolor=bdr, thickness=8)
        s.configure("TCombobox", fieldbackground=sf2, foreground=fg, background=sf2,
                    selectbackground=PALETTE["accent2"], arrowcolor=fg)
        s.configure("TCheckbutton", background=bg, foreground=fg)
        s.configure("TLabelframe", background=bg, bordercolor=bdr)
        s.configure("TLabelframe.Label", background=bg, foreground=PALETTE["accent"],
                    font=("Segoe UI", 9, "bold"))

    # ── SIDEBAR ───────────────────────────────────────────────────────────────

    def _sidebar(self):
        sb = tk.Frame(self, bg=PALETTE["surface"], width=210)
        sb.pack(side="left", fill="y")
        sb.pack_propagate(False)

        # logo
        tk.Label(sb, text="⚡ SteamKit", bg=PALETTE["surface"], fg=PALETTE["accent"],
                 font=("Segoe UI", 15, "bold")).pack(pady=(22, 2), padx=18, anchor="w")
        tk.Label(sb, text=f"Manager  v{VERSION}", bg=PALETTE["surface"],
                 fg=PALETTE["text_dim"], font=("Segoe UI", 8)).pack(padx=18, anchor="w")

        tk.Frame(sb, bg=PALETTE["border"], height=1).pack(fill="x", padx=14, pady=14)

        nav = [
            ("dashboard",  "🏠  Dashboard"),
            ("games",      "🎮  Games Library"),
            ("manifest",   "📋  Manifest Editor"),
            ("lua",        "🔧  Lua Config"),
            ("depot",      "📦  Depot Manager"),
            ("batch",      "⚡  Batch Tools"),
            ("settings",   "⚙️   Settings"),
            ("log",        "📜  Activity Log"),
        ]
        self._nav_btns = {}
        for key, label in nav:
            btn = tk.Button(sb, text=label, anchor="w",
                            bg=PALETTE["surface"], fg=PALETTE["text_dim"],
                            activebackground=PALETTE["surface3"],
                            activeforeground=PALETTE["text"],
                            relief="flat", bd=0, padx=18, pady=9,
                            font=("Segoe UI", 10), cursor="hand2",
                            command=lambda k=key: self._show(k))
            btn.pack(fill="x")
            self._nav_btns[key] = btn

        # bottom info
        tk.Frame(sb, bg=PALETTE["border"], height=1).pack(fill="x", padx=14, pady=14, side="bottom")
        self._status_lbl = tk.Label(sb, text="● Ready", bg=PALETTE["surface"],
                                    fg=PALETTE["green"], font=("Segoe UI", 9, "bold"))
        self._status_lbl.pack(side="bottom", padx=18, pady=10, anchor="w")

    def _show(self, key):
        for k, btn in self._nav_btns.items():
            if k == key:
                btn.configure(bg=PALETTE["accent2"], fg=PALETTE["text"])
            else:
                btn.configure(bg=PALETTE["surface"], fg=PALETTE["text_dim"])
        for k, frame in self._page_frames.items():
            if k == key:
                frame.pack(fill="both", expand=True)
            else:
                frame.pack_forget()

    # ── PAGES CONTAINER ───────────────────────────────────────────────────────

    def _pages(self):
        self._content = tk.Frame(self, bg=PALETTE["bg"])
        self._content.pack(side="right", fill="both", expand=True)
        self._page_frames = {}
        for key, builder in [
            ("dashboard", self._page_dashboard),
            ("games",     self._page_games),
            ("manifest",  self._page_manifest),
            ("lua",       self._page_lua),
            ("depot",     self._page_depot),
            ("batch",     self._page_batch),
            ("settings",  self._page_settings),
            ("log",       self._page_log),
        ]:
            f = tk.Frame(self._content, bg=PALETTE["bg"])
            self._page_frames[key] = f
            builder(f)

    # ─────────────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def _ph(self, text, size=18, bold=True):
        font = ("Segoe UI", size, "bold" if bold else "normal")
        return font

    def _card(self, parent, **kw):
        f = tk.Frame(parent, bg=PALETTE["surface"],
                     highlightbackground=PALETTE["border"], highlightthickness=1, **kw)
        return f

    def _btn(self, parent, text, cmd, color=None, fg=None, size=9, **kw):
        kw.setdefault("font", ("Segoe UI", size, "bold"))
        return tk.Button(parent, text=text, command=cmd,
                         bg=color or PALETTE["surface2"],
                         fg=fg or PALETTE["text"],
                         activebackground=PALETTE["accent2"],
                         activeforeground=PALETTE["text"],
                         relief="flat", bd=0, padx=12, pady=6,
                         cursor="hand2", **kw)

    def _entry(self, parent, **kw):
        return tk.Entry(parent, bg=PALETTE["surface2"], fg=PALETTE["text"],
                        insertbackground=PALETTE["text"], relief="flat", bd=0,
                        highlightbackground=PALETTE["border"],
                        highlightcolor=PALETTE["accent"], highlightthickness=1, **kw)

    def _lbl(self, parent, text, dim=False, size=9, color=None, **kw):
        return tk.Label(parent, text=text,
                        bg=kw.pop("bg", PALETTE["bg"]),
                        fg=color or (PALETTE["text_dim"] if dim else PALETTE["text"]),
                        font=("Segoe UI", size), **kw)

    def _section(self, parent, title):
        f = tk.LabelFrame(parent, text=f"  {title}  ",
                          bg=PALETTE["bg"], fg=PALETTE["accent"],
                          font=("Segoe UI", 9, "bold"), bd=1, relief="flat",
                          highlightbackground=PALETTE["border"], highlightthickness=1)
        return f

    def _log(self, msg, tag=None):
        ts = time.strftime("%H:%M:%S")
        line = f"[{ts}]  {msg}\n"
        for w in (self._main_log, self._dash_log):
            w.config(state="normal")
            w.insert("end", line, tag or "")
            w.see("end")
            w.config(state="disabled")

    def _status(self, text, color="green"):
        self._status_lbl.config(text=f"● {text}", fg=PALETTE[color])

    def _out_dir(self):
        d = self.cfg.get("manifest_dir") or os.path.join(os.path.expanduser("~"), "SteamKitOutput")
        os.makedirs(d, exist_ok=True)
        return d

    def _open_folder(self, path=None):
        path = path or self._out_dir()
        if sys.platform == "win32":
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])

    # ─────────────────────────────────────────────────────────────────────────
    # DASHBOARD
    # ─────────────────────────────────────────────────────────────────────────

    def _page_dashboard(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Dashboard", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)
        tk.Label(hdr, text="Manage your Steam manifests, AppIDs & Lua configs",
                 bg=PALETTE["surface2"], fg=PALETTE["text_dim"],
                 font=("Segoe UI", 9)).pack(side="left", padx=4, pady=14)

        body = tk.Frame(f, bg=PALETTE["bg"])
        body.pack(fill="both", expand=True, padx=16, pady=12)

        # stat cards
        stats_row = tk.Frame(body, bg=PALETTE["bg"])
        stats_row.pack(fill="x", pady=(0, 12))
        available = sum(1 for g in FAMOUS_GAMES if g["appid"] not in ("unavailable",))
        installed = len(self.cfg.get("installed_apps", []))

        def stat(parent, val, lbl, color):
            c = self._card(parent)
            c.pack(side="left", fill="x", expand=True, padx=5, ipadx=16, ipady=14)
            tk.Label(c, text=val, bg=PALETTE["surface"], fg=color,
                     font=("Segoe UI", 26, "bold")).pack()
            tk.Label(c, text=lbl, bg=PALETTE["surface"], fg=PALETTE["text_dim"],
                     font=("Segoe UI", 9)).pack()
            return c

        self._stat_total   = stat(stats_row, str(len(FAMOUS_GAMES)), "Total Games in Library", PALETTE["accent"])
        self._stat_avail   = stat(stats_row, str(available), "Games with AppID", PALETTE["green"])
        self._stat_inst    = stat(stats_row, str(installed), "Processed / Installed", PALETTE["yellow"])
        self._stat_genres  = stat(stats_row, str(len(GENRES)), "Genres", PALETTE["purple"])

        # quick actions
        qa = self._section(body, "Quick Actions")
        qa.pack(fill="x", pady=(0, 12))
        row1 = tk.Frame(qa, bg=PALETTE["bg"])
        row1.pack(fill="x", padx=10, pady=10)

        self._btn(row1, "⬇  Process All Games",
                  self._bulk_all, color=PALETTE["accent2"], size=11).pack(
            side="left", padx=5, ipady=5, ipadx=16)
        self._btn(row1, "📋  All Manifests",
                  self._gen_all_manifests).pack(side="left", padx=5)
        self._btn(row1, "🔧  All Lua Configs",
                  self._gen_all_lua).pack(side="left", padx=5)
        self._btn(row1, "📁  Open Output",
                  self._open_folder, color=PALETTE["surface3"]).pack(side="left", padx=5)
        self._btn(row1, "🚀  Copy to Steam",
                  self._copy_to_steam, color=PALETTE["green"]).pack(side="left", padx=5)

        # progress
        prog = tk.Frame(body, bg=PALETTE["bg"])
        prog.pack(fill="x", pady=(0, 10))
        self._prog_var = tk.DoubleVar()
        self._prog_bar = ttk.Progressbar(prog, variable=self._prog_var, maximum=100)
        self._prog_bar.pack(fill="x")
        self._prog_lbl = self._lbl(prog, "", dim=True)
        self._prog_lbl.pack(anchor="w", pady=2)

        # dash log
        log_sec = self._section(body, "Activity")
        log_sec.pack(fill="both", expand=True)
        self._dash_log = scrolledtext.ScrolledText(
            log_sec, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 9),
            relief="flat", state="disabled", height=10)
        self._dash_log.pack(fill="both", expand=True, padx=6, pady=6)
        self._dash_log.tag_configure("green",  foreground=PALETTE["green"])
        self._dash_log.tag_configure("red",    foreground=PALETTE["red"])
        self._dash_log.tag_configure("yellow", foreground=PALETTE["yellow"])
        self._dash_log.tag_configure("blue",   foreground=PALETTE["accent"])

    # ─────────────────────────────────────────────────────────────────────────
    # GAMES LIBRARY
    # ─────────────────────────────────────────────────────────────────────────

    def _page_games(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Games Library", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)

        toolbar = tk.Frame(f, bg=PALETTE["bg"])
        toolbar.pack(fill="x", padx=12, pady=8)

        self._lbl(toolbar, "Search:").pack(side="left")
        self._search = tk.StringVar()
        self._search.trace("w", lambda *_: self._load_games())
        self._entry(toolbar, textvariable=self._search, width=28).pack(
            side="left", padx=(4, 14))

        self._lbl(toolbar, "Genre:").pack(side="left")
        self._genre_var = tk.StringVar(value="All")
        genre_cb = ttk.Combobox(toolbar, textvariable=self._genre_var,
                                 values=["All"] + GENRES, state="readonly", width=18)
        genre_cb.pack(side="left", padx=(4, 14))
        genre_cb.bind("<<ComboboxSelected>>", lambda *_: self._load_games())

        self._lbl(toolbar, "Status:").pack(side="left")
        self._status_var = tk.StringVar(value="All")
        st_cb = ttk.Combobox(toolbar, textvariable=self._status_var,
                              values=["All", "Available", "Processed", "No AppID"],
                              state="readonly", width=14)
        st_cb.pack(side="left", padx=(4, 14))
        st_cb.bind("<<ComboboxSelected>>", lambda *_: self._load_games())

        # action buttons
        for txt, cmd, col in [
            ("⬇ Process Selected", self._process_selected, PALETTE["accent2"]),
            ("⬇ Process All",      self._bulk_all,          PALETTE["green"]),
            ("📋 Manifest",         self._manifest_selected, None),
            ("🔧 Lua Config",       self._lua_selected,      None),
            ("📁 Open Output",      self._open_folder,       PALETTE["surface3"]),
        ]:
            self._btn(toolbar, txt, cmd, color=col).pack(side="left", padx=3)

        # count label
        self._game_count_lbl = self._lbl(toolbar, "", dim=True)
        self._game_count_lbl.pack(side="right", padx=10)

        # tree
        tree_frame = tk.Frame(f, bg=PALETTE["bg"])
        tree_frame.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        cols = ("name", "appid", "genre", "size", "status")
        self._tree = ttk.Treeview(tree_frame, columns=cols, show="headings",
                                   selectmode="extended")
        for col, w, label in [
            ("name",  380, "Game Name"),
            ("appid", 100, "AppID"),
            ("genre", 130, "Genre"),
            ("size",   90, "Size"),
            ("status", 110, "Status"),
        ]:
            self._tree.heading(col, text=label,
                               command=lambda c=col: self._sort_tree(c))
            self._tree.column(col, width=w, minwidth=60)

        vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=self._tree.yview)
        hsb = ttk.Scrollbar(tree_frame, orient="horizontal", command=self._tree.xview)
        self._tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        self._tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        tree_frame.rowconfigure(0, weight=1)
        tree_frame.columnconfigure(0, weight=1)

        self._tree.tag_configure("ok",        foreground=PALETTE["text"])
        self._tree.tag_configure("done",      foreground=PALETTE["green"])
        self._tree.tag_configure("na",        foreground=PALETTE["text_dim"])
        self._tree.tag_configure("new",       foreground=PALETTE["yellow"])

        self._sort_col = None
        self._sort_rev = False

    def _sort_tree(self, col):
        self._sort_rev = not self._sort_rev if self._sort_col == col else False
        self._sort_col = col
        self._load_games()

    def _load_games(self):
        q = (self._search.get() if hasattr(self, "_search") else "").lower()
        genre_f = self._genre_var.get() if hasattr(self, "_genre_var") else "All"
        status_f = self._status_var.get() if hasattr(self, "_status_var") else "All"
        installed = set(self.cfg.get("installed_apps", []))

        rows = []
        for g in FAMOUS_GAMES:
            avail = g["appid"] not in ("unavailable",)
            done = g["appid"] in installed
            if q and q not in g["name"].lower() and q not in g["appid"].lower() \
                    and q not in g["genre"].lower():
                continue
            if genre_f != "All" and g["genre"] != genre_f:
                continue
            if status_f == "Available" and not avail:
                continue
            if status_f == "Processed" and not done:
                continue
            if status_f == "No AppID" and avail:
                continue
            tag = "done" if done else ("ok" if avail else "na")
            status = "✓ Processed" if done else ("Available" if avail else "No AppID")
            rows.append((g["name"], g["appid"], g["genre"], g["size"], status, tag))

        if self._sort_col:
            col_idx = ["name","appid","genre","size","status"].index(self._sort_col)
            rows.sort(key=lambda r: r[col_idx].lower(), reverse=self._sort_rev)

        for item in self._tree.get_children():
            self._tree.delete(item)
        for *vals, tag in rows:
            self._tree.insert("", "end", values=vals, tags=(tag,))

        if hasattr(self, "_game_count_lbl"):
            self._game_count_lbl.config(text=f"{len(rows)} games")

    # ─────────────────────────────────────────────────────────────────────────
    # MANIFEST EDITOR
    # ─────────────────────────────────────────────────────────────────────────

    def _page_manifest(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Manifest Editor", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)

        fields = tk.Frame(f, bg=PALETTE["bg"])
        fields.pack(fill="x", padx=14, pady=10)

        def field_pair(parent, label, width=14):
            r = tk.Frame(parent, bg=PALETTE["bg"])
            r.pack(side="left", padx=6)
            self._lbl(r, label, dim=True).pack(anchor="w")
            e = self._entry(r, width=width)
            e.pack()
            return e

        self._mf_appid  = field_pair(fields, "AppID", 14)
        self._mf_name   = field_pair(fields, "Game Name", 28)
        self._mf_depots = field_pair(fields, "Depot IDs (comma)", 24)
        self._mf_mids   = field_pair(fields, "Manifest IDs (comma)", 24)
        self._mf_buildid = field_pair(fields, "Build ID", 14)

        btns = tk.Frame(f, bg=PALETTE["bg"])
        btns.pack(fill="x", padx=14, pady=4)
        for txt, cmd, col in [
            ("Generate",       self._mf_generate, PALETTE["accent2"]),
            ("Save .acf",      self._mf_save,     None),
            ("Load .acf",      self._mf_load,     None),
            ("Copy to Clipboard", self._mf_copy,  None),
            ("Clear",          lambda: self._mf_text.delete("1.0","end"), PALETTE["surface3"]),
        ]:
            self._btn(btns, txt, cmd, color=col).pack(side="left", padx=4)

        self._mf_text = scrolledtext.ScrolledText(
            f, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 10),
            relief="flat")
        self._mf_text.pack(fill="both", expand=True, padx=14, pady=(4, 14))

    def _mf_generate(self):
        appid = self._mf_appid.get().strip()
        if not appid:
            messagebox.showwarning("SteamKit", "Enter an AppID first")
            return
        name  = self._mf_name.get().strip()
        raw_d = self._mf_depots.get().strip()
        raw_m = self._mf_mids.get().strip()
        depots = {}
        if raw_d:
            dl = [x.strip() for x in raw_d.split(",")]
            ml = [x.strip() for x in raw_m.split(",")] if raw_m else []
            for i, d in enumerate(dl):
                depots[d] = ml[i] if i < len(ml) else "0"
        self._mf_text.delete("1.0", "end")
        self._mf_text.insert("1.0", generate_manifest_vdf(appid, name, depots or None))

    def _mf_save(self):
        content = self._mf_text.get("1.0", "end").strip()
        if not content:
            messagebox.showwarning("SteamKit", "Nothing to save")
            return
        appid = self._mf_appid.get().strip() or "app"
        path = os.path.join(self._out_dir(), "manifests", f"appmanifest_{appid}.acf")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(content)
        self._log(f"Saved manifest → {path}", "green")
        messagebox.showinfo("Saved", path)

    def _mf_load(self):
        p = filedialog.askopenfilename(filetypes=[("ACF","*.acf"),("All","*.*")])
        if p:
            with open(p) as fh:
                self._mf_text.delete("1.0","end")
                self._mf_text.insert("1.0", fh.read())

    def _mf_copy(self):
        self.clipboard_clear()
        self.clipboard_append(self._mf_text.get("1.0","end"))
        self._log("Manifest copied to clipboard", "blue")

    # ─────────────────────────────────────────────────────────────────────────
    # LUA CONFIG
    # ─────────────────────────────────────────────────────────────────────────

    def _page_lua(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Lua Config Editor", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)

        top = tk.Frame(f, bg=PALETTE["bg"])
        top.pack(fill="x", padx=14, pady=10)

        self._lbl(top, "AppID:").pack(side="left")
        self._lua_appid = self._entry(top, width=12)
        self._lua_appid.pack(side="left", padx=(4, 14))

        self._lbl(top, "Name:").pack(side="left")
        self._lua_name = self._entry(top, width=24)
        self._lua_name.pack(side="left", padx=(4, 14))

        self._lua_unlocked = tk.BooleanVar(value=True)
        tk.Checkbutton(top, text="Unlocked", variable=self._lua_unlocked,
                       bg=PALETTE["bg"], fg=PALETTE["text"],
                       selectcolor=PALETTE["surface2"],
                       activebackground=PALETTE["bg"],
                       font=("Segoe UI", 9)).pack(side="left", padx=8)

        # depots section
        dep_sec = self._section(f, "Depot Entries")
        dep_sec.pack(fill="x", padx=14, pady=4)
        dep_row = tk.Frame(dep_sec, bg=PALETTE["bg"])
        dep_row.pack(fill="x", padx=8, pady=6)
        self._lbl(dep_row, "Depot ID:").pack(side="left")
        self._lua_did = self._entry(dep_row, width=12)
        self._lua_did.pack(side="left", padx=4)
        self._lbl(dep_row, "Branch:").pack(side="left", padx=(10,0))
        self._lua_branch = self._entry(dep_row, width=16)
        self._lua_branch.insert(0, "public")
        self._lua_branch.pack(side="left", padx=4)
        self._btn(dep_row, "+ Add", self._lua_add_depot,
                  color=PALETTE["surface3"]).pack(side="left", padx=8)
        self._btn(dep_row, "Clear Depots", self._lua_clear_depots,
                  color=PALETTE["surface3"]).pack(side="left", padx=4)
        self._lua_depots: dict = {}
        self._lua_depots_lbl = self._lbl(dep_row, "No depots", dim=True)
        self._lua_depots_lbl.pack(side="left", padx=10)

        btns = tk.Frame(f, bg=PALETTE["bg"])
        btns.pack(fill="x", padx=14, pady=4)
        for txt, cmd, col in [
            ("Generate",    self._lua_generate, PALETTE["accent2"]),
            ("Save .lua",   self._lua_save,     None),
            ("Load .lua",   self._lua_load,     None),
            ("Copy",        self._lua_copy,     None),
            ("Clear",       lambda: self._lua_text.delete("1.0","end"), PALETTE["surface3"]),
        ]:
            self._btn(btns, txt, cmd, color=col).pack(side="left", padx=4)

        self._lua_text = scrolledtext.ScrolledText(
            f, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 10), relief="flat")
        self._lua_text.pack(fill="both", expand=True, padx=14, pady=(0, 14))

    def _lua_add_depot(self):
        did = self._lua_did.get().strip()
        br  = self._lua_branch.get().strip() or "public"
        if did:
            self._lua_depots[did] = br
            self._lua_depots_lbl.config(text=f"{len(self._lua_depots)} depot(s)")
            self._log(f"Added depot {did} → {br}")

    def _lua_clear_depots(self):
        self._lua_depots.clear()
        self._lua_depots_lbl.config(text="No depots")

    def _lua_generate(self):
        appid = self._lua_appid.get().strip()
        if not appid:
            messagebox.showwarning("SteamKit", "Enter an AppID")
            return
        lua = generate_lua_config(appid, self._lua_name.get().strip(),
                                  self._lua_depots or None,
                                  self._lua_unlocked.get())
        self._lua_text.delete("1.0","end")
        self._lua_text.insert("1.0", lua)

    def _lua_save(self):
        content = self._lua_text.get("1.0","end").strip()
        if not content:
            messagebox.showwarning("SteamKit","Nothing to save")
            return
        appid = self._lua_appid.get().strip() or "app"
        path = os.path.join(self._out_dir(), "lua", f"{appid}.lua")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path,"w") as fh: fh.write(content)
        self._log(f"Saved Lua → {path}", "green")
        messagebox.showinfo("Saved", path)

    def _lua_load(self):
        p = filedialog.askopenfilename(filetypes=[("Lua","*.lua"),("All","*.*")])
        if p:
            with open(p) as fh:
                self._lua_text.delete("1.0","end")
                self._lua_text.insert("1.0",fh.read())

    def _lua_copy(self):
        self.clipboard_clear()
        self.clipboard_append(self._lua_text.get("1.0","end"))
        self._log("Lua config copied to clipboard", "blue")

    # ─────────────────────────────────────────────────────────────────────────
    # DEPOT MANAGER
    # ─────────────────────────────────────────────────────────────────────────

    def _page_depot(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Depot Manager", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)

        body = tk.Frame(f, bg=PALETTE["bg"])
        body.pack(fill="both", expand=True, padx=14, pady=10)

        # left: table
        left = tk.Frame(body, bg=PALETTE["bg"])
        left.pack(side="left", fill="both", expand=True, padx=(0,8))
        self._lbl(left, "Pinned Depots", size=10, color=PALETTE["accent"]).pack(anchor="w", pady=(0,6))

        cols = ("depot", "branch", "manifest", "appid", "os")
        self._depot_tree = ttk.Treeview(left, columns=cols, show="headings", height=18)
        for c, w, l in [("depot",90,"Depot ID"),("branch",90,"Branch"),
                         ("manifest",120,"Manifest ID"),("appid",90,"AppID"),("os",80,"OS")]:
            self._depot_tree.heading(c, text=l)
            self._depot_tree.column(c, width=w, minwidth=60)
        vsb = ttk.Scrollbar(left, orient="vertical", command=self._depot_tree.yview)
        self._depot_tree.configure(yscrollcommand=vsb.set)
        self._depot_tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        self._reload_depot_table()

        # right: form
        right = tk.Frame(body, bg=PALETTE["bg"], width=280)
        right.pack(side="right", fill="y")
        right.pack_propagate(False)

        edit = self._section(right, "Add / Edit Pin")
        edit.pack(fill="x")

        def ef(parent, label, default=""):
            r = tk.Frame(parent, bg=PALETTE["bg"])
            r.pack(fill="x", padx=8, pady=4)
            self._lbl(r, label, dim=True).pack(anchor="w")
            e = self._entry(r)
            e.pack(fill="x")
            if default: e.insert(0, default)
            return e

        self._dep_id   = ef(edit, "Depot ID")
        self._dep_br   = ef(edit, "Branch", "public")
        self._dep_mid  = ef(edit, "Manifest ID (optional)")
        self._dep_aid  = ef(edit, "AppID")
        self._dep_os   = tk.StringVar(value="any")

        r_os = tk.Frame(edit, bg=PALETTE["bg"])
        r_os.pack(fill="x", padx=8, pady=4)
        self._lbl(r_os, "OS Override:", dim=True).pack(anchor="w")
        ttk.Combobox(r_os, textvariable=self._dep_os,
                     values=["any","windows","linux","macos"],
                     state="readonly").pack(fill="x")

        br = tk.Frame(edit, bg=PALETTE["bg"])
        br.pack(fill="x", padx=8, pady=8)
        self._btn(br, "Save Pin",  self._dep_save, color=PALETTE["accent2"]).pack(side="left",padx=3)
        self._btn(br, "Remove",    self._dep_remove, color=PALETTE["red"]).pack(side="left",padx=3)

        exp = self._section(right, "Export")
        exp.pack(fill="x", pady=10)
        er = tk.Frame(exp, bg=PALETTE["bg"])
        er.pack(fill="x", padx=8, pady=8)
        self._btn(er, "Export depot_config.lua", self._dep_export, color=PALETTE["surface3"]).pack(fill="x")
        self._btn(er, "Export as JSON",          self._dep_export_json, color=PALETTE["surface3"]).pack(fill="x", pady=4)

    def _reload_depot_table(self):
        for i in self._depot_tree.get_children():
            self._depot_tree.delete(i)
        for did, info in self.cfg.get("depot_pins", {}).items():
            self._depot_tree.insert("", "end", values=(
                did, info.get("branch","public"),
                info.get("manifest",""), info.get("appid",""), info.get("os","any")))

    def _dep_save(self):
        did = self._dep_id.get().strip()
        if not did:
            messagebox.showwarning("SteamKit","Enter a Depot ID")
            return
        self.cfg.setdefault("depot_pins", {})[did] = {
            "branch":   self._dep_br.get().strip() or "public",
            "manifest": self._dep_mid.get().strip(),
            "appid":    self._dep_aid.get().strip(),
            "os":       self._dep_os.get(),
        }
        save_config(self.cfg)
        self._reload_depot_table()
        self._log(f"Saved depot pin: {did}", "green")

    def _dep_remove(self):
        for item in self._depot_tree.selection():
            did = self._depot_tree.item(item,"values")[0]
            self.cfg.get("depot_pins",{}).pop(did, None)
        save_config(self.cfg)
        self._reload_depot_table()

    def _dep_export(self):
        pins = self.cfg.get("depot_pins",{})
        if not pins:
            messagebox.showinfo("SteamKit","No depot pins to export")
            return
        lines = ["-- SteamKit Manager - depot_config.lua\nreturn {\n  depots = {"]
        for did, i in pins.items():
            lines.append(f'    ["{did}"] = {{ branch="{i["branch"]}", manifest="{i["manifest"]}", appid="{i["appid"]}", os="{i["os"]}" }},')
        lines.append("  },\n}")
        path = os.path.join(self._out_dir(), "depot_config.lua")
        with open(path,"w") as fh: fh.write("\n".join(lines))
        self._log(f"Exported depot config → {path}", "green")
        messagebox.showinfo("Exported", path)

    def _dep_export_json(self):
        pins = self.cfg.get("depot_pins",{})
        path = os.path.join(self._out_dir(), "depot_config.json")
        with open(path,"w") as fh: json.dump(pins, fh, indent=2)
        self._log(f"Exported depot JSON → {path}", "green")
        messagebox.showinfo("Exported", path)

    # ─────────────────────────────────────────────────────────────────────────
    # BATCH TOOLS
    # ─────────────────────────────────────────────────────────────────────────

    def _page_batch(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Batch Tools", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)

        body = tk.Frame(f, bg=PALETTE["bg"])
        body.pack(fill="both", expand=True, padx=14, pady=10)

        # options
        opt = self._section(body, "Batch Options")
        opt.pack(fill="x", pady=(0,10))
        opt_row = tk.Frame(opt, bg=PALETTE["bg"])
        opt_row.pack(fill="x", padx=10, pady=8)

        self._batch_manifest = tk.BooleanVar(value=True)
        self._batch_lua      = tk.BooleanVar(value=True)
        self._batch_unlocked = tk.BooleanVar(value=True)
        self._batch_copy_steam = tk.BooleanVar(value=False)

        for var, label in [
            (self._batch_manifest,    "Generate Manifests (.acf)"),
            (self._batch_lua,         "Generate Lua Configs"),
            (self._batch_unlocked,    "Mark as Unlocked in Lua"),
            (self._batch_copy_steam,  "Auto-copy Manifests to Steam folder"),
        ]:
            tk.Checkbutton(opt_row, text=label, variable=var,
                           bg=PALETTE["bg"], fg=PALETTE["text"],
                           selectcolor=PALETTE["surface2"],
                           activebackground=PALETTE["bg"],
                           font=("Segoe UI", 9)).pack(anchor="w", pady=2)

        # genre filter for batch
        gf_row = tk.Frame(opt, bg=PALETTE["bg"])
        gf_row.pack(fill="x", padx=10, pady=(0,8))
        self._lbl(gf_row, "Genre filter for batch:").pack(side="left")
        self._batch_genre = tk.StringVar(value="All")
        ttk.Combobox(gf_row, textvariable=self._batch_genre,
                     values=["All"] + GENRES, state="readonly", width=20).pack(
            side="left", padx=8)

        # actions
        act = self._section(body, "Run Batch")
        act.pack(fill="x", pady=(0,10))
        act_row = tk.Frame(act, bg=PALETTE["bg"])
        act_row.pack(fill="x", padx=10, pady=10)
        self._btn(act_row, "▶  Run Batch (All Games)",
                  self._bulk_all, color=PALETTE["accent2"], size=11).pack(
            side="left", padx=5, ipady=5, ipadx=10)
        self._btn(act_row, "▶  Run on Selected",
                  self._process_selected, color=PALETTE["green"]).pack(side="left", padx=5)
        self._btn(act_row, "🗑  Clear Output Folder",
                  self._clear_output, color=PALETTE["red"]).pack(side="left", padx=5)
        self._btn(act_row, "📁  Open Output",
                  self._open_folder, color=PALETTE["surface3"]).pack(side="left", padx=5)
        self._btn(act_row, "🚀  Copy Manifests → Steam",
                  self._copy_to_steam, color=PALETTE["surface3"]).pack(side="left", padx=5)

        # batch log
        log_sec = self._section(body, "Batch Log")
        log_sec.pack(fill="both", expand=True)
        self._batch_log_widget = scrolledtext.ScrolledText(
            log_sec, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 9),
            relief="flat", state="disabled")
        self._batch_log_widget.pack(fill="both", expand=True, padx=6, pady=6)

    def _clear_output(self):
        out = self._out_dir()
        if messagebox.askyesno("Clear", f"Delete everything in:\n{out}?"):
            shutil.rmtree(out, ignore_errors=True)
            os.makedirs(out)
            self._log("Output folder cleared", "yellow")

    def _copy_to_steam(self):
        steam = self.cfg.get("steam_path","")
        if not steam or not os.path.isdir(steam):
            messagebox.showwarning("SteamKit",
                "Set a valid Steam path in Settings first.\n"
                "Usually: C:\\Program Files (x86)\\Steam")
            return
        sa_dir = os.path.join(steam, "steamapps")
        if not os.path.isdir(sa_dir):
            messagebox.showwarning("SteamKit", f"steamapps folder not found:\n{sa_dir}")
            return
        m_dir = os.path.join(self._out_dir(), "manifests")
        if not os.path.isdir(m_dir):
            messagebox.showwarning("SteamKit", "No manifests folder found. Generate manifests first.")
            return
        copied = 0
        for fn in os.listdir(m_dir):
            if fn.endswith(".acf"):
                shutil.copy2(os.path.join(m_dir, fn), os.path.join(sa_dir, fn))
                copied += 1
        self._log(f"Copied {copied} .acf files → {sa_dir}", "green")
        messagebox.showinfo("Done", f"Copied {copied} manifests to:\n{sa_dir}")

    # ─────────────────────────────────────────────────────────────────────────
    # SETTINGS
    # ─────────────────────────────────────────────────────────────────────────

    def _page_settings(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Settings", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)

        body = tk.Frame(f, bg=PALETTE["bg"])
        body.pack(fill="both", expand=True, padx=14, pady=10)

        paths_sec = self._section(body, "Paths")
        paths_sec.pack(fill="x", pady=(0, 10))

        self._cfg_vars = {}

        def path_row(parent, key, label, is_dir=True):
            r = tk.Frame(parent, bg=PALETTE["bg"])
            r.pack(fill="x", padx=10, pady=6)
            self._lbl(r, label, dim=True).pack(anchor="w")
            row2 = tk.Frame(r, bg=PALETTE["bg"])
            row2.pack(fill="x")
            var = tk.StringVar(value=self.cfg.get(key, ""))
            self._cfg_vars[key] = var
            self._entry(row2, textvariable=var).pack(
                side="left", fill="x", expand=True, padx=(0, 6))
            cmd = (lambda v=var: v.set(filedialog.askdirectory() or v.get())) if is_dir else None
            if cmd:
                self._btn(row2, "Browse", cmd, color=PALETTE["surface3"]).pack(side="right")

        path_row(paths_sec, "steam_path",     "Steam Installation Path")
        path_row(paths_sec, "millennium_path","Millennium Client Path")
        path_row(paths_sec, "manifest_dir",   "Manifest Output Directory")
        path_row(paths_sec, "lua_config_dir", "Lua Config Output Directory")

        save_btn = self._btn(body, "💾  Save Settings", self._save_settings,
                             color=PALETTE["accent2"], size=10)
        save_btn.pack(anchor="w", pady=10, ipady=5, ipadx=16)

        info = self._section(body, "About")
        info.pack(fill="x", pady=10)
        lines = [
            f"SteamKit Manager  v{VERSION}",
            "Manages Steam manifests, AppIDs, depot configs and Lua scripts.",
            "Compatible with Millennium client and stplug-in Lua framework.",
            f"Config stored at: {CONFIG_FILE}",
        ]
        for ln in lines:
            self._lbl(info, ln, dim=True).pack(anchor="w", padx=10, pady=2)

    def _save_settings(self):
        for key, var in self._cfg_vars.items():
            self.cfg[key] = var.get()
        save_config(self.cfg)
        self._log("Settings saved", "green")
        messagebox.showinfo("Saved", "Settings saved!")

    # ─────────────────────────────────────────────────────────────────────────
    # LOG PAGE
    # ─────────────────────────────────────────────────────────────────────────

    def _page_log(self, f):
        hdr = tk.Frame(f, bg=PALETTE["surface2"])
        hdr.pack(fill="x")
        tk.Label(hdr, text="Activity Log", bg=PALETTE["surface2"], fg=PALETTE["accent"],
                 font=("Segoe UI", 14, "bold")).pack(side="left", padx=20, pady=14)

        btns = tk.Frame(f, bg=PALETTE["bg"])
        btns.pack(fill="x", padx=12, pady=8)
        self._btn(btns, "Clear", self._clear_log, color=PALETTE["surface3"]).pack(side="left")
        self._btn(btns, "Save Log", self._save_log).pack(side="left", padx=6)

        self._main_log = scrolledtext.ScrolledText(
            f, bg=PALETTE["surface"], fg=PALETTE["text"],
            insertbackground=PALETTE["text"], font=("Consolas", 9),
            relief="flat")
        self._main_log.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        self._main_log.config(state="disabled")
        for tag, col in [("green", "green"), ("red", "red"),
                          ("yellow", "yellow"), ("blue", "accent"),
                          ("purple", "purple")]:
            self._main_log.tag_configure(tag, foreground=PALETTE[col])

    def _clear_log(self):
        for w in (self._main_log, self._dash_log):
            w.config(state="normal")
            w.delete("1.0","end")
            w.config(state="disabled")

    def _save_log(self):
        p = filedialog.asksaveasfilename(defaultextension=".txt",
                                          filetypes=[("Text","*.txt"),("All","*.*")])
        if p:
            with open(p,"w") as fh:
                fh.write(self._main_log.get("1.0","end"))

    # ─────────────────────────────────────────────────────────────────────────
    # GENERATION & BATCH LOGIC
    # ─────────────────────────────────────────────────────────────────────────

    def _gen_for(self, appid, name):
        out  = self._out_dir()
        m_dir = os.path.join(out, "manifests")
        l_dir = os.path.join(out, "lua")
        os.makedirs(m_dir, exist_ok=True)
        os.makedirs(l_dir, exist_ok=True)
        if not hasattr(self, "_batch_manifest") or self._batch_manifest.get():
            vdf = generate_manifest_vdf(appid, name)
            with open(os.path.join(m_dir, f"appmanifest_{appid}.acf"), "w") as fh:
                fh.write(vdf)
        if not hasattr(self, "_batch_lua") or self._batch_lua.get():
            unlocked = self._batch_unlocked.get() if hasattr(self,"_batch_unlocked") else True
            lua = generate_lua_config(appid, name, unlocked=unlocked)
            with open(os.path.join(l_dir, f"{appid}.lua"), "w") as fh:
                fh.write(lua)
        if appid not in self.cfg.setdefault("installed_apps", []):
            self.cfg["installed_apps"].append(appid)

    def _run_batch(self, games):
        self._status("Working…", "yellow")
        total = len(games)
        done  = 0
        for name, appid in games:
            try:
                self._gen_for(appid, name)
                done += 1
                pct = (done / total) * 100
                self._prog_var.set(pct)
                self._prog_lbl.config(text=f"{done}/{total}  —  {name}")
                self._log(f"✓  {name}  ({appid})", "green")
            except Exception as e:
                self._log(f"✗  {name}  —  {e}", "red")

        save_config(self.cfg)
        self._load_games()

        if hasattr(self,"_batch_copy_steam") and self._batch_copy_steam.get():
            self._copy_to_steam()

        self._prog_lbl.config(text=f"Done!  {done}/{total} processed")
        self._status("Done", "green")
        self._log(f"\n✓  Batch complete:  {done}/{total}  →  {self._out_dir()}", "blue")

    def _bulk_all(self):
        genre_f = self._batch_genre.get() if hasattr(self,"_batch_genre") else "All"
        games = [(g["name"], g["appid"]) for g in FAMOUS_GAMES
                 if g["appid"] not in ("unavailable",)
                 and (genre_f == "All" or g["genre"] == genre_f)]
        n = len(games)
        if not messagebox.askyesno("SteamKit",
                f"Process {n} games?\n\nThis will generate manifests + Lua configs\n"
                f"in:\n{self._out_dir()}\n\nContinue?"):
            return
        threading.Thread(target=self._run_batch, args=(games,), daemon=True).start()

    def _process_selected(self):
        sel = self._tree.selection() if hasattr(self,"_tree") else []
        if not sel:
            messagebox.showwarning("SteamKit","Select games in the Games Library first")
            return
        games = []
        for item in sel:
            v = self._tree.item(item,"values")
            if v[1] not in ("unavailable",):
                games.append((v[0], v[1]))
        if games:
            threading.Thread(target=self._run_batch, args=(games,), daemon=True).start()

    def _manifest_selected(self):
        sel = self._tree.selection() if hasattr(self,"_tree") else []
        out = self._out_dir()
        m_dir = os.path.join(out, "manifests")
        os.makedirs(m_dir, exist_ok=True)
        count = 0
        for item in sel:
            v = self._tree.item(item,"values")
            if v[1] not in ("unavailable",):
                vdf = generate_manifest_vdf(v[1], v[0])
                with open(os.path.join(m_dir, f"appmanifest_{v[1]}.acf"),"w") as fh:
                    fh.write(vdf)
                count += 1
        self._log(f"Generated {count} manifests", "green")

    def _lua_selected(self):
        sel = self._tree.selection() if hasattr(self,"_tree") else []
        out = self._out_dir()
        l_dir = os.path.join(out, "lua")
        os.makedirs(l_dir, exist_ok=True)
        count = 0
        for item in sel:
            v = self._tree.item(item,"values")
            if v[1] not in ("unavailable",):
                lua = generate_lua_config(v[1], v[0])
                with open(os.path.join(l_dir, f"{v[1]}.lua"),"w") as fh:
                    fh.write(lua)
                count += 1
        self._log(f"Generated {count} Lua configs", "green")

    def _gen_all_manifests(self):
        out = self._out_dir()
        m_dir = os.path.join(out, "manifests")
        os.makedirs(m_dir, exist_ok=True)
        count = 0
        for g in FAMOUS_GAMES:
            if g["appid"] in ("unavailable",): continue
            with open(os.path.join(m_dir, f"appmanifest_{g['appid']}.acf"),"w") as fh:
                fh.write(generate_manifest_vdf(g["appid"], g["name"]))
            count += 1
        self._log(f"Generated {count} manifests → {m_dir}", "green")
        messagebox.showinfo("Done", f"{count} manifests in:\n{m_dir}")

    def _gen_all_lua(self):
        out = self._out_dir()
        l_dir = os.path.join(out, "lua")
        os.makedirs(l_dir, exist_ok=True)
        count = 0
        for g in FAMOUS_GAMES:
            if g["appid"] in ("unavailable",): continue
            with open(os.path.join(l_dir, f"{g['appid']}.lua"),"w") as fh:
                fh.write(generate_lua_config(g["appid"], g["name"]))
            count += 1
        self._log(f"Generated {count} Lua configs → {l_dir}", "green")
        messagebox.showinfo("Done", f"{count} Lua configs in:\n{l_dir}")


if __name__ == "__main__":
    app = App()
    app.mainloop()
