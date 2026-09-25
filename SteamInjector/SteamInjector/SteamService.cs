using Microsoft.Win32;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace SteamInjector;

public class SteamLibrary
{
    public string Path { get; set; } = "";
    public string Label { get; set; } = "";
}

public class GameEntry
{
    public int AppId { get; set; }
    public string Name { get; set; } = "";
    public string Genre { get; set; } = "";
    public string Developer { get; set; } = "";
}

public static class SteamService
{
    // ── Registry / Path detection ────────────────────────────────────────────

    public static string? DetectSteamPath()
    {
        // Try HKCU first (most common)
        foreach (var (hive, subKey) in new[]
        {
            (Registry.CurrentUser, @"Software\Valve\Steam"),
            (Registry.LocalMachine, @"SOFTWARE\Valve\Steam"),
            (Registry.LocalMachine, @"SOFTWARE\WOW6432Node\Valve\Steam"),
        })
        {
            try
            {
                using var key = hive.OpenSubKey(subKey);
                var val = key?.GetValue("SteamPath") as string
                       ?? key?.GetValue("InstallPath") as string;
                if (!string.IsNullOrEmpty(val) && Directory.Exists(val))
                    return val;
            }
            catch { }
        }

        // Fallback common paths
        string[] fallbacks =
        [
            @"C:\Program Files (x86)\Steam",
            @"C:\Program Files\Steam",
            System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Steam"),
        ];
        return fallbacks.FirstOrDefault(Directory.Exists);
    }

    public static List<SteamLibrary> GetAllLibraryFolders(string steamPath)
    {
        var libs = new List<SteamLibrary>();
        var defaultApps = System.IO.Path.Combine(steamPath, "steamapps");
        if (Directory.Exists(defaultApps))
            libs.Add(new SteamLibrary { Path = defaultApps, Label = $"Default  ({steamPath})" });

        var vdfPath = System.IO.Path.Combine(steamPath, "config", "libraryfolders.vdf");
        if (!File.Exists(vdfPath)) return libs;

        try
        {
            var text = File.ReadAllText(vdfPath);
            // Match "path" entries in VDF
            var pathMatches = Regex.Matches(text, @"""""path""""\s+""""([^""""]+)""""");
            foreach (Match m in pathMatches)
            {
                var p = m.Groups[1].Value.Replace(@"\\\\", @"\\");
                var appsDir = System.IO.Path.Combine(p, "steamapps");
                if (Directory.Exists(appsDir) && !libs.Any(l => l.Path.Equals(appsDir, StringComparison.OrdinalIgnoreCase)))
                    libs.Add(new SteamLibrary { Path = appsDir, Label = $"{System.IO.Path.GetPathRoot(p)} → {appsDir}" });
            }
            // Also try numeric keys (older VDF format)
            var numMatches = Regex.Matches(text, @"""""[0-9]+""""\s+""""([a-zA-Z]:[^""""]+)""""");
            foreach (Match m in numMatches)
            {
                var p = m.Groups[1].Value.Replace(@"\\\\", @"\\");
                var appsDir = System.IO.Path.Combine(p, "steamapps");
                if (Directory.Exists(appsDir) && !libs.Any(l => l.Path.Equals(appsDir, StringComparison.OrdinalIgnoreCase)))
                    libs.Add(new SteamLibrary { Path = appsDir, Label = $"{System.IO.Path.GetPathRoot(p)} → {appsDir}" });
            }
        }
        catch { }

        return libs;
    }

    // ── Process control ──────────────────────────────────────────────────────

    public static bool IsSteamRunning()
        => Process.GetProcessesByName("steam").Length > 0;

    public static void KillSteam()
    {
        var procs = Process.GetProcessesByName("steam");
        foreach (var p in procs)
        {
            try { p.CloseMainWindow(); } catch { }
        }
        System.Threading.Thread.Sleep(2000);

        procs = Process.GetProcessesByName("steam");
        foreach (var p in procs)
        {
            try { p.Kill(); } catch { }
        }
    }

    public static void StartSteam(string steamPath)
    {
        var exe = System.IO.Path.Combine(steamPath, "steam.exe");
        if (File.Exists(exe))
            Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true });
    }

    public static void RestartSteam(string steamPath)
    {
        KillSteam();
        System.Threading.Thread.Sleep(1500);
        StartSteam(steamPath);
    }

    // ── Manifest generation ──────────────────────────────────────────────────

    public static string GenerateAcf(int appId, string name, int stateFlags = 4,
        string installDir = "", string buildId = "0", List<(int depotId, string manifestId)>? depots = null)
    {
        if (string.IsNullOrWhiteSpace(installDir))
            installDir = Sanitize(name);

        var sb = new StringBuilder();
        sb.AppendLine("\"AppState\"");
        sb.AppendLine("{");
        sb.AppendLine($"\t\"appid\"\t\t\"{appId}\"");
        sb.AppendLine($"\t\"Universe\"\t\t\"1\"");
        sb.AppendLine($"\t\"name\"\t\t\"{name}\"");
        sb.AppendLine($"\t\"StateFlags\"\t\t\"{stateFlags}\"");
        sb.AppendLine($"\t\"installdir\"\t\t\"{installDir}\"");
        sb.AppendLine($"\t\"LastUpdated\"\t\t\"{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}\"");
        sb.AppendLine($"\t\"UpdateResult\"\t\t\"0\"");
        sb.AppendLine($"\t\"SizeOnDisk\"\t\t\"0\"");
        sb.AppendLine($"\t\"buildid\"\t\t\"{buildId}\"");
        sb.AppendLine($"\t\"LastOwner\"\t\t\"0\"");
        sb.AppendLine($"\t\"BytesToDownload\"\t\t\"0\"");
        sb.AppendLine($"\t\"BytesDownloaded\"\t\t\"0\"");
        sb.AppendLine($"\t\"BytesToStage\"\t\t\"0\"");
        sb.AppendLine($"\t\"BytesStaged\"\t\t\"0\"");
        sb.AppendLine($"\t\"AutoUpdateBehavior\"\t\t\"0\"");
        sb.AppendLine($"\t\"AllowOtherDownloadsWhileRunning\"\t\t\"0\"");
        sb.AppendLine($"\t\"ScheduledAutoUpdate\"\t\t\"0\"");

        if (depots != null && depots.Count > 0)
        {
            sb.AppendLine("\t\"InstalledDepots\"");
            sb.AppendLine("\t{");
            foreach (var (did, mid) in depots)
            {
                sb.AppendLine($"\t\t\"{did}\"");
                sb.AppendLine("\t\t{");
                sb.AppendLine($"\t\t\t\"manifest\"\t\t\"{mid}\"");
                sb.AppendLine($"\t\t\t\"size\"\t\t\"0\"");
                sb.AppendLine("\t\t}");
            }
            sb.AppendLine("\t}");
        }

        sb.AppendLine("}");
        return sb.ToString();
    }

    public static string GenerateLua(int appId, string name, List<int>? depotIds = null)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"-- SteamInjector Lua Config — AppID {appId}");
        sb.AppendLine($"-- Game: {name}");
        sb.AppendLine($"-- Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");
        sb.AppendLine();
        sb.AppendLine($"local app = require(\"app\")");
        sb.AppendLine();
        sb.AppendLine($"app.add_app({appId}, {{");
        sb.AppendLine($"  name = \"{name.Replace("\"", "\\\"")}\",");
        if (depotIds != null && depotIds.Count > 0)
        {
            sb.AppendLine($"  depots = {{ {string.Join(", ", depotIds)} }},");
        }
        sb.AppendLine("})");
        return sb.ToString();
    }

    public static (bool ok, string msg) InjectManifest(
        string steamAppsPath, int appId, string name,
        bool generateLua = false, string? luaOutputDir = null,
        int stateFlags = 4, List<(int, string)>? depots = null)
    {
        try
        {
            if (!Directory.Exists(steamAppsPath))
                return (false, $"steamapps path not found: {steamAppsPath}");

            var acfContent = GenerateAcf(appId, name, stateFlags, depots: depots);
            var acfPath = System.IO.Path.Combine(steamAppsPath, $"appmanifest_{appId}.acf");
            File.WriteAllText(acfPath, acfContent, Encoding.UTF8);

            if (generateLua && !string.IsNullOrEmpty(luaOutputDir))
            {
                Directory.CreateDirectory(luaOutputDir);
                var luaContent = GenerateLua(appId, name);
                var luaPath = System.IO.Path.Combine(luaOutputDir, $"{appId}.lua");
                File.WriteAllText(luaPath, luaContent, Encoding.UTF8);
            }

            return (true, $"Injected: {acfPath}");
        }
        catch (UnauthorizedAccessException)
        {
            return (false, $"Access denied for {steamAppsPath} — try running as Administrator.");
        }
        catch (Exception ex)
        {
            return (false, $"Error: {ex.Message}");
        }
    }

    public static bool AcfExists(string steamAppsPath, int appId)
        => File.Exists(System.IO.Path.Combine(steamAppsPath, $"appmanifest_{appId}.acf"));

    public static bool RemoveManifest(string steamAppsPath, int appId)
    {
        try
        {
            var p = System.IO.Path.Combine(steamAppsPath, $"appmanifest_{appId}.acf");
            if (File.Exists(p)) { File.Delete(p); return true; }
            return false;
        }
        catch { return false; }
    }

    private static string Sanitize(string name)
        => Regex.Replace(name, @"[^\w\s\-]", "").Trim().Replace(" ", "_");

    // ── Built-in game database ───────────────────────────────────────────────

    public static List<GameEntry> GetBuiltInGames() =>
    [
        new() { AppId=730,    Name="Counter-Strike 2",              Genre="FPS",        Developer="Valve" },
        new() { AppId=570,    Name="Dota 2",                        Genre="MOBA",       Developer="Valve" },
        new() { AppId=440,    Name="Team Fortress 2",               Genre="FPS",        Developer="Valve" },
        new() { AppId=271590, Name="Grand Theft Auto V",            Genre="Action",     Developer="Rockstar" },
        new() { AppId=1091500,Name="Cyberpunk 2077",                Genre="RPG",        Developer="CD Projekt Red" },
        new() { AppId=1245620,Name="Elden Ring",                    Genre="RPG",        Developer="FromSoftware" },
        new() { AppId=1172470,Name="Apex Legends",                  Genre="Battle Royale",Developer="Respawn" },
        new() { AppId=578080, Name="PUBG: Battlegrounds",           Genre="Battle Royale",Developer="PUBG Corp" },
        new() { AppId=1085660,Name="Destiny 2",                     Genre="FPS",        Developer="Bungie" },
        new() { AppId=252490, Name="Rust",                          Genre="Survival",   Developer="Facepunch" },
        new() { AppId=304930, Name="Unturned",                      Genre="Survival",   Developer="Smartly Dressed Games" },
        new() { AppId=108600, Name="Project Zomboid",               Genre="Survival",   Developer="The Indie Stone" },
        new() { AppId=413150, Name="Stardew Valley",                Genre="Farming Sim",Developer="ConcernedApe" },
        new() { AppId=292030, Name="The Witcher 3: Wild Hunt",      Genre="RPG",        Developer="CD Projekt Red" },
        new() { AppId=1593500,Name="God of War",                    Genre="Action-RPG", Developer="Santa Monica" },
        new() { AppId=1454400,Name="Persona 4 Golden",              Genre="JRPG",       Developer="Atlus" },
        new() { AppId=1888160,Name="The Last of Us Part I",         Genre="Action",     Developer="Naughty Dog" },
        new() { AppId=1877540,Name="Hogwarts Legacy",               Genre="Action-RPG", Developer="Avalanche" },
        new() { AppId=2050650,Name="Resident Evil 4 (2023)",        Genre="Survival Horror",Developer="Capcom" },
        new() { AppId=1716740,Name="STAR WARS Jedi: Survivor",      Genre="Action-RPG", Developer="Respawn" },
        new() { AppId=2012840,Name="Starfield",                     Genre="RPG",        Developer="Bethesda" },
        new() { AppId=1888930,Name="Atomic Heart",                  Genre="FPS-RPG",    Developer="Mundfish" },
        new() { AppId=1668670,Name="Sons of the Forest",            Genre="Survival",   Developer="Endnight" },
        new() { AppId=211820, Name="Starbound",                     Genre="Sandbox",    Developer="Chucklefish" },
        new() { AppId=105600, Name="Terraria",                      Genre="Sandbox",    Developer="Re-Logic" },
        new() { AppId=4000,   Name="Garry's Mod",                   Genre="Sandbox",    Developer="Valve" },
        new() { AppId=346110, Name="ARK: Survival Evolved",         Genre="Survival",   Developer="Studio Wildcard" },
        new() { AppId=239140, Name="Dying Light",                   Genre="Survival",   Developer="Techland" },
        new() { AppId=552520, Name="Dying Light 2",                 Genre="Survival",   Developer="Techland" },
        new() { AppId=976730, Name="Hades",                         Genre="Roguelike",  Developer="Supergiant" },
        new() { AppId=1145360,Name="Hades II",                      Genre="Roguelike",  Developer="Supergiant" },
        new() { AppId=1248890,Name="It Takes Two",                  Genre="Co-op",      Developer="Hazelight" },
        new() { AppId=945360, Name="Among Us",                      Genre="Party",      Developer="Innersloth" },
        new() { AppId=1097150,Name="Fall Guys",                     Genre="Battle Royale",Developer="Mediatonic" },
        new() { AppId=1222730,Name="Lethal Company",                Genre="Horror",     Developer="Zeekerss" },
        new() { AppId=553850, Name="Helldivers 2",                  Genre="Co-op Shooter",Developer="Arrowhead" },
        new() { AppId=2379780,Name="Black Myth: Wukong",            Genre="Action-RPG", Developer="Game Science" },
        new() { AppId=1938090,Name="Call of Duty: MW3 (2023)",      Genre="FPS",        Developer="Activision" },
        new() { AppId=1517290,Name="NBA 2K24",                      Genre="Sports",     Developer="2K" },
        new() { AppId=2195250,Name="EA Sports FC 24",               Genre="Sports",     Developer="EA" },
        new() { AppId=365670, Name="Stranded Deep",                 Genre="Survival",   Developer="Beam Team" },
        new() { AppId=1551360,Name="Forza Horizon 5",               Genre="Racing",     Developer="Playground" },
        new() { AppId=1144200,Name="Ready or Not",                  Genre="Tactical FPS",Developer="VOID Interactive" },
        new() { AppId=359550, Name="Tom Clancy's Rainbow Six Siege",Genre="Tactical FPS",Developer="Ubisoft" },
        new() { AppId=218620, Name="PAYDAY 2",                      Genre="Heist",      Developer="Overkill" },
        new() { AppId=1174180,Name="Red Dead Redemption 2",         Genre="Action-RPG", Developer="Rockstar" },
        new() { AppId=1649080,Name="Baldur's Gate 3",               Genre="RPG",        Developer="Larian" },
        new() { AppId=489830, Name="The Elder Scrolls V: Skyrim SE",Genre="RPG",        Developer="Bethesda" },
        new() { AppId=22380,  Name="Fallout 3",                     Genre="RPG",        Developer="Bethesda" },
        new() { AppId=377160, Name="Fallout 4",                     Genre="RPG",        Developer="Bethesda" },
        new() { AppId=1151340,Name="Fallout 76",                    Genre="RPG",        Developer="Bethesda" },
        new() { AppId=22370,  Name="Fallout: New Vegas",            Genre="RPG",        Developer="Obsidian" },
        new() { AppId=526870, Name="Satisfactory",                  Genre="Factory",    Developer="Coffee Stain" },
        new() { AppId=294100, Name="RimWorld",                      Genre="Colony Sim", Developer="Ludeon" },
        new() { AppId=403640, Name="Darkest Dungeon",               Genre="Roguelike",  Developer="Red Hook" },
        new() { AppId=1940340,Name="Darkest Dungeon 2",             Genre="Roguelike",  Developer="Red Hook" },
        new() { AppId=667970, Name="Hollow Knight",                 Genre="Metroidvania",Developer="Team Cherry" },
        new() { AppId=881020, Name="Ori and the Will of the Wisps", Genre="Platformer", Developer="Moon Studios" },
        new() { AppId=504230, Name="Celeste",                       Genre="Platformer", Developer="Matt Makes Games" },
        new() { AppId=723090, Name="Disco Elysium - Final Cut",     Genre="RPG",        Developer="ZA/UM" },
        new() { AppId=391540, Name="Undertale",                     Genre="RPG",        Developer="Toby Fox" },
        new() { AppId=601150, Name="Devil May Cry 5",               Genre="Action",     Developer="Capcom" },
        new() { AppId=883710, Name="Dragon Ball FighterZ",          Genre="Fighting",   Developer="Arc System Works" },
        new() { AppId=1372780,Name="Guilty Gear: Strive",           Genre="Fighting",   Developer="Arc System Works" },
        new() { AppId=1506830,Name="Street Fighter 6",              Genre="Fighting",   Developer="Capcom" },
        new() { AppId=2131600,Name="Tekken 8",                      Genre="Fighting",   Developer="Bandai Namco" },
        new() { AppId=774171, Name="Mortal Kombat 11",              Genre="Fighting",   Developer="NetherRealm" },
        new() { AppId=2971760,Name="Mortal Kombat 1",               Genre="Fighting",   Developer="NetherRealm" },
        new() { AppId=860510, Name="Borderlands 3",                 Genre="Looter Shooter",Developer="Gearbox" },
        new() { AppId=322170, Name="Geometry Dash",                 Genre="Platformer", Developer="RobTop" },
        new() { AppId=435790, Name="Wallpaper Engine",              Genre="Utility",    Developer="Kristjan" },
        new() { AppId=1240440,Name="Halo: The Master Chief Collection",Genre="FPS",     Developer="343i" },
        new() { AppId=1449580,Name="Halo Infinite",                 Genre="FPS",        Developer="343i" },
        new() { AppId=500,    Name="Left 4 Dead",                   Genre="Co-op FPS",  Developer="Valve" },
        new() { AppId=550,    Name="Left 4 Dead 2",                 Genre="Co-op FPS",  Developer="Valve" },
        new() { AppId=620,    Name="Portal 2",                      Genre="Puzzle",     Developer="Valve" },
        new() { AppId=400,    Name="Portal",                        Genre="Puzzle",     Developer="Valve" },
        new() { AppId=70,     Name="Half-Life",                     Genre="FPS",        Developer="Valve" },
        new() { AppId=220,    Name="Half-Life 2",                   Genre="FPS",        Developer="Valve" },
        new() { AppId=546560, Name="Half-Life: Alyx",               Genre="VR FPS",     Developer="Valve" },
        new() { AppId=8930,   Name="Sid Meier's Civilization V",    Genre="Strategy",   Developer="2K" },
        new() { AppId=289070, Name="Sid Meier's Civilization VI",   Genre="Strategy",   Developer="2K" },
        new() { AppId=1336490,Name="Sid Meier's Civilization VII",  Genre="Strategy",   Developer="2K" },
        new() { AppId=1569040,Name="Football Manager 2022",         Genre="Sports",     Developer="SEGA" },
        new() { AppId=2180900,Name="Football Manager 2024",         Genre="Sports",     Developer="SEGA" },
        new() { AppId=812140, Name="Assassin's Creed Origins",      Genre="Action-RPG", Developer="Ubisoft" },
        new() { AppId=869340, Name="Assassin's Creed Odyssey",      Genre="Action-RPG", Developer="Ubisoft" },
        new() { AppId=2208920,Name="Assassin's Creed Mirage",       Genre="Action",     Developer="Ubisoft" },
        new() { AppId=1945360,Name="Assassin's Creed Valhalla",     Genre="Action-RPG", Developer="Ubisoft" },
        new() { AppId=221100, Name="DayZ",                          Genre="Survival",   Developer="Bohemia" },
        new() { AppId=107410, Name="Arma 3",                        Genre="Military Sim",Developer="Bohemia" },
        new() { AppId=1826290,Name="Battlefield 2042",              Genre="FPS",        Developer="DICE" },
        new() { AppId=2106320,Name="Ghost of Tsushima",             Genre="Action",     Developer="Sucker Punch" },
        new() { AppId=1446780,Name="Monster Hunter Rise",           Genre="Action-RPG", Developer="Capcom" },
        new() { AppId=582010, Name="Monster Hunter: World",         Genre="Action-RPG", Developer="Capcom" },
        new() { AppId=814380, Name="Sekiro: Shadows Die Twice",     Genre="Action-RPG", Developer="FromSoftware" },
        new() { AppId=374320, Name="Dark Souls III",                Genre="Action-RPG", Developer="FromSoftware" },
        new() { AppId=570940, Name="Dark Souls: Remastered",        Genre="Action-RPG", Developer="FromSoftware" },
        new() { AppId=870780, Name="Control",                       Genre="Action",     Developer="Remedy" },
        new() { AppId=1874440,Name="Alan Wake 2",                   Genre="Horror",     Developer="Remedy" },
        new() { AppId=1623730,Name="Palworld",                      Genre="Survival",   Developer="Pocketpair" },
        new() { AppId=1817070,Name="Lies of P",                     Genre="Action-RPG", Developer="Neowiz" },
        new() { AppId=2174600,Name="Like a Dragon: Infinite Wealth",Genre="JRPG",       Developer="SEGA" },
        new() { AppId=460790, Name="Yakuza 0",                      Genre="Action-RPG", Developer="SEGA" },
        new() { AppId=2027340,Name="Wo Long: Fallen Dynasty",       Genre="Action-RPG", Developer="Team Ninja" },
        new() { AppId=485510, Name="Nioh: Complete Edition",        Genre="Action-RPG", Developer="Team Ninja" },
        new() { AppId=1568590,Name="Deep Rock Galactic: Survivor",  Genre="Roguelike",  Developer="Ghost Ship" },
        new() { AppId=548430, Name="Deep Rock Galactic",            Genre="Co-op FPS",  Developer="Ghost Ship" },
        new() { AppId=1195900,Name="Valheim",                       Genre="Survival",   Developer="Iron Gate" },
        new() { AppId=1282400,Name="No Man's Sky",                  Genre="Space Survival",Developer="Hello Games" },
        new() { AppId=281990, Name="Stellaris",                     Genre="Grand Strategy",Developer="Paradox" },
        new() { AppId=394360, Name="Hearts of Iron IV",             Genre="Grand Strategy",Developer="Paradox" },
        new() { AppId=236850, Name="Europa Universalis IV",         Genre="Grand Strategy",Developer="Paradox" },
        new() { AppId=203770, Name="Crusader Kings II",             Genre="Grand Strategy",Developer="Paradox" },
        new() { AppId=1158310,Name="Crusader Kings III",            Genre="Grand Strategy",Developer="Paradox" },
        new() { AppId=1361210,Name="Warhammer 40K: Darktide",       Genre="Co-op FPS",  Developer="Fatshark" },
        new() { AppId=1418630,Name="Back 4 Blood",                  Genre="Co-op FPS",  Developer="Turtle Rock" },
        new() { AppId=1599340,Name="Lost Ark",                      Genre="MMORPG",     Developer="Smilegate" },
        new() { AppId=2077560,Name="Gotham Knights",                Genre="Action-RPG", Developer="WB Games" },
        new() { AppId=208650, Name="Batman: Arkham Origins",        Genre="Action",     Developer="WB Games" },
        new() { AppId=200260, Name="Batman: Arkham City GOTY",      Genre="Action",     Developer="Rocksteady" },
        new() { AppId=35140,  Name="Batman: Arkham Asylum",         Genre="Action",     Developer="Rocksteady" },
        new() { AppId=1532040,Name="F1 2021",                       Genre="Racing",     Developer="Codemasters" },
        new() { AppId=2108330,Name="F1 22",                         Genre="Racing",     Developer="Codemasters" },
        new() { AppId=1305240,Name="Car Mechanic Simulator 2021",   Genre="Simulation", Developer="Red Dot" },
        new() { AppId=1250410,Name="Microsoft Flight Simulator 2020",Genre="Simulation",Developer="Asobo" },
        new() { AppId=227300, Name="Euro Truck Simulator 2",        Genre="Simulation", Developer="SCS" },
        new() { AppId=270880, Name="American Truck Simulator",      Genre="Simulation", Developer="SCS" },
        new() { AppId=477160, Name="Human: Fall Flat",              Genre="Puzzle",     Developer="No Brakes" },
        new() { AppId=736220, Name="TABS",                          Genre="Simulation", Developer="Landfall" },
        new() { AppId=1868140,Name="Dredge",                        Genre="Fishing",    Developer="Black Salt" },
        new() { AppId=1966900,Name="Slime Rancher 2",               Genre="Simulation", Developer="Monomi Park" },
        new() { AppId=1942280,Name="Vampire Survivors",             Genre="Roguelike",  Developer="poncle" },
        new() { AppId=1294830,Name="Inscryption",                   Genre="Roguelike",  Developer="Daniel Mullins" },
        new() { AppId=753640, Name="Outer Wilds",                   Genre="Exploration",Developer="Mobius Digital" },
        new() { AppId=952060, Name="Resident Evil Village",         Genre="Survival Horror",Developer="Capcom" },
        new() { AppId=883710, Name="Resident Evil 2 Remake",        Genre="Survival Horror",Developer="Capcom" },
        new() { AppId=2194070,Name="Resident Evil 3 Remake",        Genre="Survival Horror",Developer="Capcom" },
        new() { AppId=361210, Name="Just Cause 3",                  Genre="Action",     Developer="Avalanche" },
        new() { AppId=517630, Name="Just Cause 4",                  Genre="Action",     Developer="Avalanche" },
        new() { AppId=391220, Name="Rise of the Tomb Raider",       Genre="Action-Adventure",Developer="Crystal Dynamics" },
        new() { AppId=203160, Name="Tomb Raider (2013)",            Genre="Action-Adventure",Developer="Crystal Dynamics" },
        new() { AppId=595570, Name="Shadow of the Tomb Raider",     Genre="Action-Adventure",Developer="Crystal Dynamics" },
        new() { AppId=1260480,Name="Ghostrunner",                   Genre="FPS",        Developer="One More Level" },
        new() { AppId=1621470,Name="Ghostrunner 2",                 Genre="FPS",        Developer="One More Level" },
        new() { AppId=385110, Name="Prey",                          Genre="FPS",        Developer="Arkane" },
        new() { AppId=205790, Name="Dishonored",                    Genre="Action",     Developer="Arkane" },
        new() { AppId=1551890,Name="Deathloop",                     Genre="FPS",        Developer="Arkane" },
        new() { AppId=1418140,Name="A Plague Tale: Requiem",        Genre="Action",     Developer="Asobo" },
        new() { AppId=1552700,Name="Horizon Zero Dawn Complete",    Genre="Action-RPG", Developer="Guerrilla" },
        new() { AppId=2420110,Name="Horizon Forbidden West",        Genre="Action-RPG", Developer="Guerrilla" },
        new() { AppId=2215430,Name="Marvel's Spider-Man Remastered",Genre="Action",     Developer="Insomniac" },
        new() { AppId=2300490,Name="Marvel's Spider-Man: Miles Morales",Genre="Action", Developer="Insomniac" },
        new() { AppId=739630, Name="Phasmophobia",                  Genre="Horror",     Developer="Kinetic Games" },
        new() { AppId=1172620,Name="Sea of Thieves",                Genre="Adventure",  Developer="Rare" },
        new() { AppId=1693980,Name="Forza Motorsport",              Genre="Racing",     Developer="Turn 10" },
        new() { AppId=1182480,Name="Forza Horizon 4",               Genre="Racing",     Developer="Playground" },
        new() { AppId=1150690,Name="Age of Empires IV",             Genre="RTS",        Developer="Relic" },
        new() { AppId=813780, Name="Age of Empires II: DE",         Genre="RTS",        Developer="Forgotten Empires" },
        new() { AppId=387990, Name="Ori and the Blind Forest: DE",  Genre="Platformer", Developer="Moon Studios" },
        new() { AppId=648800, Name="Raft",                          Genre="Survival",   Developer="Redbeet" },
        new() { AppId=1158770,Name="Subnautica: Below Zero",        Genre="Survival",   Developer="Unknown Worlds" },
        new() { AppId=264710, Name="Subnautica",                    Genre="Survival",   Developer="Unknown Worlds" },
        new() { AppId=1781830,Name="S.T.A.L.K.E.R. 2",             Genre="FPS-RPG",    Developer="GSC Game World" },
        new() { AppId=782330, Name="Doom Eternal",                  Genre="FPS",        Developer="id Software" },
        new() { AppId=2180830,Name="The Callisto Protocol",         Genre="Survival Horror",Developer="Striking Distance" },
        new() { AppId=220200, Name="Kerbal Space Program",          Genre="Simulation", Developer="Squad" },
        new() { AppId=1426580,Name="Sifu",                          Genre="Action",     Developer="Sloclap" },
        new() { AppId=1422760,Name="Chivalry 2",                    Genre="Action",     Developer="Torn Banner" },
        new() { AppId=1085600,Name="Mordhau",                       Genre="Action",     Developer="Triternion" },
        new() { AppId=2330580,Name="Warhammer 40K: Space Marine 2", Genre="Action",     Developer="Saber Interactive" },
        new() { AppId=1717750,Name="Farming Simulator 22",          Genre="Simulation", Developer="GIANTS" },
        new() { AppId=2299240,Name="Farming Simulator 25",          Genre="Simulation", Developer="GIANTS" },
        new() { AppId=1046930,Name="Oxygen Not Included",           Genre="Colony Sim", Developer="Klei" },
        new() { AppId=322330, Name="Don't Starve Together",         Genre="Survival",   Developer="Klei" },
        new() { AppId=219740, Name="Don't Starve",                  Genre="Survival",   Developer="Klei" },
        new() { AppId=1190540,Name="Death Stranding",               Genre="Action",     Developer="Kojima" },
        new() { AppId=436120, Name="Cuphead",                       Genre="Platformer", Developer="Studio MDHR" },
        new() { AppId=1637320,Name="Cuphead: The Delicious Last Course",Genre="Platformer",Developer="Studio MDHR" },
        new() { AppId=1672250,Name="Unpacking",                     Genre="Puzzle",     Developer="Witch Beam" },
        new() { AppId=1738830,Name="Teardown",                      Genre="Sandbox",    Developer="Tuxedo Labs" },
        new() { AppId=1454080,Name="Final Fantasy VII Remake Intergrade",Genre="JRPG",  Developer="Square Enix" },
        new() { AppId=2440510,Name="Final Fantasy XVI",             Genre="Action-JRPG",Developer="Square Enix" },
        new() { AppId=39210,  Name="Final Fantasy XIV Online",      Genre="MMORPG",     Developer="Square Enix" },
        new() { AppId=524220, Name="NieR: Automata",                Genre="Action-RPG", Developer="PlatinumGames" },
        new() { AppId=2461490,Name="Armored Core VI",               Genre="Action",     Developer="FromSoftware" },
        new() { AppId=329070, Name="Wolfenstein II: The New Colossus",Genre="FPS",      Developer="MachineGames" },
        new() { AppId=612880, Name="Wolfenstein: The New Order",    Genre="FPS",        Developer="MachineGames" },
        new() { AppId=1447400,Name="Judgment",                      Genre="Action-RPG", Developer="SEGA" },
        new() { AppId=2058820,Name="Lost Judgment",                 Genre="Action-RPG", Developer="SEGA" },
        new() { AppId=1070510,Name="Yakuza: Like a Dragon",         Genre="JRPG",       Developer="SEGA" },
        new() { AppId=834910, Name="Yakuza Kiwami 2",               Genre="Action-RPG", Developer="SEGA" },
        new() { AppId=577620, Name="Yakuza Kiwami",                 Genre="Action-RPG", Developer="SEGA" },
        new() { AppId=311210, Name="Call of Duty: Black Ops III",   Genre="FPS",        Developer="Treyarch" },
        new() { AppId=1533420,Name="Townscaper",                    Genre="Sandbox",    Developer="Oskar" },
        new() { AppId=1465360,Name="Loop Hero",                     Genre="Roguelike",  Developer="Four Quarters" },
        new() { AppId=1419470,Name="Haiku, the Robot",              Genre="Metroidvania",Developer="Mister Morris" },
        new() { AppId=1141040,Name="Tunic",                         Genre="Action-RPG", Developer="Andrew Shouldice" },
        new() { AppId=1690910,Name="Neon White",                    Genre="FPS",        Developer="Angel Matrix" },
        new() { AppId=1609550,Name="Ultrakill",                     Genre="FPS",        Developer="Arsi Patala" },
        new() { AppId=1811260,Name="Bomb Rush Cyberfunk",           Genre="Platformer", Developer="Team Reptile" },
        new() { AppId=2282120,Name="Frostpunk 2",                   Genre="City Builder",Developer="11 bit" },
        new() { AppId=323190, Name="Frostpunk",                     Genre="City Builder",Developer="11 bit" },
        new() { AppId=594570, Name="This War of Mine",              Genre="Survival",   Developer="11 bit" },
        new() { AppId=1544030,Name="The Forgotten City",            Genre="RPG",        Developer="Modern Storyteller" },
        new() { AppId=745940, Name="Five Nights at Freddy's: Security Breach",Genre="Horror",Developer="Steel Wool" },
        new() { AppId=1721470,Name="Poppy Playtime",                Genre="Horror",     Developer="MOB Games" },
        new() { AppId=1332010,Name="Twelve Minutes",                Genre="Puzzle",     Developer="Luis Antonio" },
        new() { AppId=2140330,Name="High on Life",                  Genre="FPS",        Developer="Squanch" },
        new() { AppId=1748370,Name="Need for Speed Unbound",        Genre="Racing",     Developer="Criterion" },
        new() { AppId=1868870,Name="The Finals",                    Genre="FPS",        Developer="Embark" },
        new() { AppId=1677020,Name="Marvel's Midnight Suns",        Genre="Tactical-RPG",Developer="Firaxis" },
        new() { AppId=2076760,Name="The Last of Us Part II Remastered",Genre="Action",  Developer="Naughty Dog" },
        new() { AppId=2413750,Name="Senua's Saga: Hellblade II",    Genre="Action",     Developer="Ninja Theory" },
        new() { AppId=2530290,Name="Prince of Persia: The Lost Crown",Genre="Metroidvania",Developer="Ubisoft" },
        new() { AppId=2775740,Name="Indiana Jones and the Great Circle",Genre="Action-Adventure",Developer="MachineGames" },
        new() { AppId=1544340,Name="Kena: Bridge of Spirits",       Genre="Action-RPG", Developer="Ember Lab" },
        new() { AppId=2617050,Name="Path of Exile 2",               Genre="ARPG",       Developer="GGG" },
        new() { AppId=238960, Name="Path of Exile",                 Genre="ARPG",       Developer="GGG" },
        new() { AppId=632360, Name="Risk of Rain 2",                Genre="Roguelike",  Developer="Hopoo Games" },
        new() { AppId=1097930,Name="Noita",                         Genre="Roguelike",  Developer="Nolla Games" },
        new() { AppId=1812810,Name="Hardspace: Shipbreaker",        Genre="Simulation", Developer="Blackbird" },
        new() { AppId=1260610,Name="Barotrauma",                    Genre="Survival",   Developer="Undertow Games" },
        new() { AppId=1113560,Name="Return of the Obra Dinn",       Genre="Puzzle",     Developer="Lucas Pope" },
        new() { AppId=2528650,Name="Robocop: Rogue City",           Genre="FPS",        Developer="Teyon" },
        new() { AppId=2531310,Name="Lords of the Fallen",           Genre="Action-RPG", Developer="CI Games" },
        new() { AppId=2209850,Name="Soul Hackers 2",                Genre="JRPG",       Developer="Atlus" },
        new() { AppId=2094310,Name="Persona 3 Portable",            Genre="JRPG",       Developer="Atlus" },
        new() { AppId=1687950,Name="Persona 5 Strikers",            Genre="Action-RPG", Developer="Atlus" },
        new() { AppId=1687960,Name="Persona 5 Royal",               Genre="JRPG",       Developer="Atlus" },
        new() { AppId=2053620,Name="Persona 3 Reload",              Genre="JRPG",       Developer="Atlus" },
        new() { AppId=760230, Name="Total War: Three Kingdoms",     Genre="Strategy",   Developer="Creative Assembly" },
        new() { AppId=1827450,Name="Total War: Warhammer III",      Genre="Strategy",   Developer="Creative Assembly" },
    ];
}
