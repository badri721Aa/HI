namespace LuaToolsGui;

public static class AppConfig
{
    public const string SupabaseUrl = "https://db.lua.tools";
    public const string SupabaseAnonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYwMzkzNzYsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6ImFub24iLCJpc3MiOiJzdXBhYmFzZSJ9.f_-K38u3odjltP-g_67FVmG32Vg-_-k-lNBvIaVUVBM";
    public const string ApiBaseUrl = "https://lua.tools";
    public const string BotAccountEmailDomain = "@bot.lua.tools";
    public const string HubcapBaseUrl = "https://hubcapmanifest.com";
    public const int OAuthCallbackPort = 53789;
    public const string OAuthCallbackUrl = "http://localhost:53789/callback";
    // Nosignal made by ATVR — download cap removed, unlimited installs.
    public const int DailyDownloadLimit = int.MaxValue;
    public const string SteamStoreSearchUrl = "https://store.steampowered.com/api/storesearch/";
    public const string SteamFeaturedUrl = "https://store.steampowered.com/api/featuredcategories";
    public const string HardwareAppIdListUrl =
        "https://raw.githubusercontent.com/jsnli/steamappidlist/master/data/hardware_appid.json";
    public const string SteamlessRepo = "atom0s/Steamless";
    public const string CloudRedirectRepo = "Selectively11/CloudRedirect";
    public const string SteamAutoCrackRepo = "SteamAutoCracks/Steam-auto-crack";
    public const string DepotDownloaderRepo = "mendy-tools/DepotDownloaderMod";
    public const string ManifestBackendUrl = "http://167.235.229.108";
    public const string ManifestBackendUserAgent = "secretgoonpoon";
    public const string DonateKeysUserAgent = "discord(dot)gg/luatools";
    public const string UmamiHost = "https://analytics.lua.tools";
    public const string UmamiWebsiteId = "820d782c-a434-424f-9f90-dee83dc6032e";
    public const string UmamiHostname = "desktop.lua.tools";
    public static readonly string[] GithubReleasesRepos =
    [
        "https://github.com/madoiscool/LuaTools",
        "https://github.com/mendy-tools/LuaTools",
    ];
    public static string GithubReleasesRepo => GithubReleasesRepos[0];
    public const string PluginReleasesOwner = "madoiscool";
    public const string PluginReleasesRepo = "LTSP";
    public static readonly string[] GithubApiMirrors =
    [
        "https://lua.tools/api/gh/",
    ];
    public static readonly string[] GithubDownloadMirrors =
    [
        "https://ghproxy.net/",
        "https://ghfast.top/",
        "https://gh.ddlc.top/",
    ];
}
