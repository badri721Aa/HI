using System.IO;
using System.Text.Json;

namespace SteamInjector;

public static class AppListService
{
    private static Dictionary<int, string> _apps = [];
    public static bool   IsLoaded => _apps.Count > 0;
    public static int    Count    => _apps.Count;
    public static string LoadedFrom { get; private set; } = "";

    // ── Load ──────────────────────────────────────────────────────────────────

    public static async Task<bool> LoadAsync(string? extraPath = null)
    {
        var paths = new List<string>();
        if (!string.IsNullOrEmpty(extraPath) && File.Exists(extraPath))
            paths.Add(extraPath);

        // LuaToolsGui appdata (original tool location)
        paths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "LuaToolsGui", "steam-applist.json"));

        // Our own config dir (if user copied it)
        paths.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "SteamInjector", "steam-applist.json"));

        // Same dir as the exe
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? "";
        if (!string.IsNullOrEmpty(exeDir))
            paths.Add(Path.Combine(exeDir, "steam-applist.json"));

        foreach (var path in paths)
        {
            if (!File.Exists(path)) continue;
            try
            {
                var dict = await ParseJsonAsync(path);
                if (dict.Count > 1000)
                {
                    _apps = dict;
                    LoadedFrom = path;
                    return true;
                }
            }
            catch { }
        }
        return false;
    }

    private static async Task<Dictionary<int, string>> ParseJsonAsync(string path)
    {
        var dict = new Dictionary<int, string>(capacity: 200_000);
        var json = await File.ReadAllTextAsync(path);
        var doc  = JsonDocument.Parse(json, new JsonDocumentOptions { AllowTrailingCommas = true });

        if (doc.RootElement.ValueKind == JsonValueKind.Object)
            foreach (var prop in doc.RootElement.EnumerateObject())
                if (int.TryParse(prop.Name, out var id))
                    dict[id] = prop.Value.ValueKind == JsonValueKind.String
                        ? (prop.Value.GetString() ?? "")
                        : prop.Value.ToString();

        return dict;
    }

    // ── Search ────────────────────────────────────────────────────────────────

    public static List<(int AppId, string Name)> Search(string query, int max = 80)
    {
        query = query.Trim();
        if (string.IsNullOrEmpty(query) || _apps.Count == 0) return [];

        // Exact AppID
        if (int.TryParse(query, out var exactId) && _apps.TryGetValue(exactId, out var exactName))
            return [(exactId, exactName)];

        var lq = query.ToLowerInvariant();

        var startsWith = new List<(int, string)>();
        var contains   = new List<(int, string)>();

        foreach (var kv in _apps)
        {
            if (string.IsNullOrEmpty(kv.Value)) continue;
            var low = kv.Value.ToLowerInvariant();
            if (low.StartsWith(lq))        startsWith.Add((kv.Key, kv.Value));
            else if (low.Contains(lq))     contains.Add((kv.Key, kv.Value));
            if (startsWith.Count + contains.Count >= max * 3) break;
        }

        return startsWith
            .OrderBy(x => x.Item2.Length)
            .Take(max / 2 + 10)
            .Concat(contains.OrderBy(x => x.Item2.Length).Take(max / 2))
            .Take(max)
            .ToList();
    }

    public static string? GetName(int appId) =>
        _apps.TryGetValue(appId, out var n) ? n : null;
}
