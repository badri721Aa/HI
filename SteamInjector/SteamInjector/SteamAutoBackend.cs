using System.Net.Http;
using System.Text.Json;

namespace SteamInjector;

public enum SourceStatus { Unknown, Available, Unavailable, Locked }

public class GameSource
{
    public string Name   { get; set; } = "";
    public SourceStatus Status { get; set; } = SourceStatus.Unknown;
    public bool Locked   { get; set; }
}

public class AddResult
{
    public bool   Success    { get; set; }
    public string Message    { get; set; } = "";
    public string Source     { get; set; } = "";
    public bool   DailyLimit { get; set; }
    public bool   NoSource   { get; set; }
    public List<GameSource> Sources { get; set; } = [];
}

public static class SteamAutoBackend
{
    private static readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(15)
    };

    public static int    Port   { get; set; } = 3000;
    public static string ApiKey { get; set; } = "";

    private static string Base => $"http://127.0.0.1:{Port}";

    // ── Connectivity ──────────────────────────────────────────────────────────

    public static async Task<bool> IsRunningAsync()
    {
        try
        {
            using var cts = new CancellationTokenSource(3000);
            var r = await _http.GetAsync($"{Base}/loaded-apps", cts.Token);
            return r.IsSuccessStatusCode || (int)r.StatusCode is 400 or 401 or 403;
        }
        catch { return false; }
    }

    public static async Task<int> AutoDetectPortAsync()
    {
        int[] candidates = [3000, 5000, 8080, 8888, 9000, 12345, 3001, 4000, 1337];
        foreach (var port in candidates)
        {
            Port = port;
            if (await IsRunningAsync()) return port;
        }
        Port = 3000;
        return -1;
    }

    // ── Loaded apps ───────────────────────────────────────────────────────────

    public static async Task<List<int>> GetLoadedAppsAsync()
    {
        try
        {
            var r    = await _http.GetAsync($"{Base}/loaded-apps");
            var body = await r.Content.ReadAsStringAsync();
            var list = new List<int>();

            // Try JSON array
            try
            {
                var doc = JsonDocument.Parse(body);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    foreach (var el in doc.RootElement.EnumerateArray())
                        if (el.TryGetInt32(out var id)) list.Add(id);
                return list;
            }
            catch { }

            // Try comma-separated numbers
            foreach (var part in body.Split(',', '\n'))
                if (int.TryParse(part.Trim(), out var id)) list.Add(id);
            return list;
        }
        catch { return []; }
    }

    // ── Add ───────────────────────────────────────────────────────────────────

    public static async Task<AddResult> AddAppAsync(int appId, CancellationToken ct = default)
    {
        try
        {
            var content = string.IsNullOrEmpty(ApiKey)
                ? (HttpContent?)null
                : new StringContent(ApiKey);

            var r    = await _http.PostAsync($"{Base}/add/{appId}", content, ct);
            var body = await r.Content.ReadAsStringAsync(ct);
            return ParseAddResponse(body, (int)r.StatusCode);
        }
        catch (OperationCanceledException)
        {
            return new AddResult { Message = "Cancelled." };
        }
        catch (HttpRequestException ex)
        {
            return new AddResult { Message = $"Backend unreachable: {ex.Message}" };
        }
        catch (Exception ex)
        {
            return new AddResult { Message = $"Error: {ex.Message}" };
        }
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    public static async Task<bool> CancelAsync(int appId)
    {
        try
        {
            await _http.PostAsync($"{Base}/cancel/{appId}", null);
            return true;
        }
        catch { return false; }
    }

    // ── Open fix / settings ───────────────────────────────────────────────────

    public static async Task OpenFixAsync(int appId)
    {
        try { await _http.PostAsync($"{Base}/open/fix/{appId}", null); } catch { }
    }

    public static async Task OpenSettingsAsync()
    {
        try { await _http.PostAsync($"{Base}/open/settings", null); } catch { }
    }

    // ── Response parser ───────────────────────────────────────────────────────

    private static AddResult ParseAddResponse(string body, int status)
    {
        var result = new AddResult();

        // Try JSON
        try
        {
            var doc  = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (root.TryGetProperty("success",    out var s)) result.Success    = s.GetBoolean();
            if (root.TryGetProperty("ok",         out var o)) result.Success    = o.GetBoolean();
            if (root.TryGetProperty("message",    out var m)) result.Message    = m.GetString() ?? "";
            if (root.TryGetProperty("msg",        out var ms)) result.Message   = ms.GetString() ?? "";
            if (root.TryGetProperty("source",     out var sr)) result.Source    = sr.GetString() ?? "";
            if (root.TryGetProperty("dailyLimit", out var d)) result.DailyLimit = d.GetBoolean();
            if (root.TryGetProperty("noSource",   out var n)) result.NoSource   = n.GetBoolean();
            return result;
        }
        catch { }

        // Plain text parse — based on plugin-backend.log format
        result.Message = body.Trim();

        if (status >= 200 && status < 300)
        {
            // "Added [GameName]. Steam will fetch manifests. · via Luie"
            if (body.Contains("Added") && body.Contains("Steam will fetch"))
            {
                result.Success = true;
                var viaIdx = body.IndexOf("via ", StringComparison.OrdinalIgnoreCase);
                if (viaIdx >= 0)
                    result.Source = body[(viaIdx + 4)..].Trim().Split(' ')[0];
            }
            else if (body.StartsWith("OK", StringComparison.OrdinalIgnoreCase))
            {
                result.Success = true;
            }
        }

        if (body.Contains("Daily limit", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("25/day", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("Supporter", StringComparison.OrdinalIgnoreCase))
            result.DailyLimit = true;

        if (body.Contains("no downloadable source", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("FastFetch: no", StringComparison.OrdinalIgnoreCase))
            result.NoSource = true;

        return result;
    }
}
