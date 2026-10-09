using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Web;
using LuaToolsGui.Models;

namespace LuaToolsGui.Services;

public class AuthService
{
    private static readonly string AuthFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "LuaToolsGui", "auth.dat");

    private readonly HttpClient _http = AppHttp.Create(TimeSpan.FromSeconds(30));
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private string? _accessToken;
    private string? _refreshToken;
    private DateTimeOffset _expiresAt;

    public string? DisplayName { get; private set; }
    public string? Email { get; private set; }
    public string? AvatarUrl { get; private set; }

    public bool IsSignedIn => _refreshToken is not null;
    public bool IsGuest => !IsSignedIn;
    public bool IsBotProvisioned =>
        IsSignedIn && Email?.EndsWith(AppConfig.BotAccountEmailDomain, StringComparison.OrdinalIgnoreCase) == true;

    public event Action? AuthStateChanged;

    public async Task<bool> InitializeAsync()
    {
        StoredAuth? stored = LoadStored();
        if (stored is null || string.IsNullOrEmpty(stored.RefreshToken)) return false;

        _accessToken = stored.AccessToken;
        _refreshToken = stored.RefreshToken;
        _expiresAt = stored.ExpiresAt;
        DisplayName = stored.DisplayName;
        Email = stored.Email;
        AvatarUrl = stored.AvatarUrl;

        if (_expiresAt > DateTimeOffset.UtcNow.AddMinutes(2))
        {
            AuthStateChanged?.Invoke();
            return true;
        }
        try
        {
            await RefreshAsync();
            AuthStateChanged?.Invoke();
            return true;
        }
        catch
        {
            ClearSession();
            AuthStateChanged?.Invoke();
            return false;
        }
    }

    public async Task SignInAsync(CancellationToken ct = default)
    {
        string verifier = CreateCodeVerifier();
        string challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

        string authorizeUrl =
            $"{AppConfig.SupabaseUrl}/auth/v1/authorize?provider=discord" +
            $"&redirect_to={Uri.EscapeDataString(AppConfig.OAuthCallbackUrl)}" +
            $"&code_challenge={challenge}&code_challenge_method=s256";

        using var listener = new HttpListener();
        listener.Prefixes.Add($"http://localhost:{AppConfig.OAuthCallbackPort}/");
        listener.Start();

        Process.Start(new ProcessStartInfo(authorizeUrl) { UseShellExecute = true });

        string code;
        try
        {
            code = await WaitForCallbackAsync(listener, ct);
        }
        finally
        {
            listener.Stop();
        }

        var session = await ExchangeCodeAsync(code, verifier, ct);
        ApplySession(session);
        AuthStateChanged?.Invoke();
    }

    public async Task SignInWithCodeAsync(string code, CancellationToken ct = default)
    {
        var redeemReq = new HttpRequestMessage(HttpMethod.Post, $"{AppConfig.ApiBaseUrl}/api/auth/code/redeem")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { code = code.Trim().ToUpperInvariant() }),
                Encoding.UTF8, "application/json"),
        };

        var redeemRes = await _http.SendAsync(redeemReq, ct);
        string redeemBody = await redeemRes.Content.ReadAsStringAsync(ct);
        if (!redeemRes.IsSuccessStatusCode)
            throw new AuthException(redeemRes.StatusCode switch
            {
                HttpStatusCode.Gone => Resources.Strings.Settings_BotCode_Expired,
                HttpStatusCode.NotFound => Resources.Strings.Settings_BotCode_Invalid,
                HttpStatusCode.BadRequest => Resources.Strings.Settings_BotCode_Invalid,
                _ => Resources.Strings.Settings_BotCode_ServerError,
            });

        var redeem = JsonSerializer.Deserialize<CodeRedeemResponse>(redeemBody);
        if (redeem is null || string.IsNullOrEmpty(redeem.Token))
            throw new AuthException(Resources.Strings.Settings_BotCode_ServerError);

        var session = await VerifyMagicTokenAsync(redeem.Token, ct);
        ApplySession(session);
        AuthStateChanged?.Invoke();
    }

    private async Task<SupabaseSession> VerifyMagicTokenAsync(string tokenHash, CancellationToken ct)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{AppConfig.SupabaseUrl}/auth/v1/verify")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { type = "magiclink", token_hash = tokenHash }),
                Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("apikey", AppConfig.SupabaseAnonKey);

        var res = await _http.SendAsync(req, ct);
        string body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new AuthException(Resources.Strings.Settings_BotCode_ServerError);

        return JsonSerializer.Deserialize<SupabaseSession>(body)
               ?? throw new AuthException(Resources.Strings.Settings_BotCode_ServerError);
    }

    private static async Task<string> WaitForCallbackAsync(HttpListener listener, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromMinutes(5));

        while (true)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = await listener.GetContextAsync().WaitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                throw new AuthException(Resources.Strings.Auth_Err_Timeout);
            }

            string? code = HttpUtility.ParseQueryString(ctx.Request.Url?.Query ?? "").Get("code");
            string? error = HttpUtility.ParseQueryString(ctx.Request.Url?.Query ?? "").Get("error_description");

            if (code is null && error is null)
            {
                ctx.Response.StatusCode = 404;
                ctx.Response.Close();
                continue;
            }

            bool ok = code is not null;
            byte[] page = Encoding.UTF8.GetBytes(ResultPage(ok, error));
            ctx.Response.ContentType = "text/html; charset=utf-8";
            ctx.Response.ContentLength64 = page.Length;
            await ctx.Response.OutputStream.WriteAsync(page, timeout.Token);
            ctx.Response.Close();

            if (!ok) throw new AuthException(error ?? "Sign-in was denied.");
            return code!;
        }
    }

    private async Task<SupabaseSession> ExchangeCodeAsync(string code, string verifier, CancellationToken ct)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{AppConfig.SupabaseUrl}/auth/v1/token?grant_type=pkce")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { auth_code = code, code_verifier = verifier }),
                Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("apikey", AppConfig.SupabaseAnonKey);

        var res = await _http.SendAsync(req, ct);
        string body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new AuthException(string.Format(Resources.Strings.Auth_Err_TokenExchangeFailed, (int)res.StatusCode, body));

        return JsonSerializer.Deserialize<SupabaseSession>(body)
               ?? throw new AuthException(Resources.Strings.Auth_Err_TokenExchangeEmpty);
    }

    public async Task<string> GetValidAccessTokenAsync()
    {
        if (_refreshToken is null) throw new AuthException(Resources.Strings.Auth_Err_NotSignedIn);

        if (_expiresAt <= DateTimeOffset.UtcNow.AddMinutes(2))
        {
            await _refreshLock.WaitAsync();
            try
            {
                if (_expiresAt <= DateTimeOffset.UtcNow.AddMinutes(2))
                    await RefreshAsync();
            }
            finally
            {
                _refreshLock.Release();
            }
        }
        return _accessToken!;
    }

    private async Task RefreshAsync()
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{AppConfig.SupabaseUrl}/auth/v1/token?grant_type=refresh_token")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { refresh_token = _refreshToken }),
                Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("apikey", AppConfig.SupabaseAnonKey);

        var res = await _http.SendAsync(req);
        string body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new AuthException(string.Format(Resources.Strings.Auth_Err_RefreshFailed, (int)res.StatusCode));

        var session = JsonSerializer.Deserialize<SupabaseSession>(body)
                      ?? throw new AuthException(Resources.Strings.Auth_Err_RefreshEmpty);
        ApplySession(session);
    }

    public void SignOut()
    {
        ClearSession();
        AuthStateChanged?.Invoke();
    }

    private void ApplySession(SupabaseSession session)
    {
        _accessToken = session.AccessToken;
        _refreshToken = session.RefreshToken;
        _expiresAt = DateTimeOffset.UtcNow.AddSeconds(session.ExpiresIn);

        if (session.User is not null)
        {
            var meta = session.User.Metadata;
            DisplayName = meta?.CustomClaims?.GlobalName ?? meta?.FullName ?? meta?.Name ?? session.User.Email;
            Email = session.User.Email;
            AvatarUrl = meta?.AvatarUrl;
        }

        SaveStored(new StoredAuth
        {
            RefreshToken = _refreshToken,
            AccessToken = _accessToken,
            ExpiresAt = _expiresAt,
            DisplayName = DisplayName,
            Email = Email,
            AvatarUrl = AvatarUrl,
        });
    }

    private void ClearSession()
    {
        _accessToken = null;
        _refreshToken = null;
        _expiresAt = default;
        DisplayName = Email = AvatarUrl = null;
        try { File.Delete(AuthFile); } catch { /* best effort */ }
    }

    private static StoredAuth? LoadStored()
    {
        try
        {
            if (!File.Exists(AuthFile)) return null;
            byte[] plain = ProtectedData.Unprotect(File.ReadAllBytes(AuthFile), null, DataProtectionScope.CurrentUser);
            return JsonSerializer.Deserialize<StoredAuth>(plain);
        }
        catch
        {
            return null;
        }
    }

    private static void SaveStored(StoredAuth auth)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(AuthFile)!);
        byte[] enc = ProtectedData.Protect(
            JsonSerializer.SerializeToUtf8Bytes(auth), null, DataProtectionScope.CurrentUser);

        for (int attempt = 0; ; attempt++)
        {
            try
            {
                File.WriteAllBytes(AuthFile, enc);
                return;
            }
            catch (IOException) when (attempt < 3)
            {
                Thread.Sleep(150);
            }
            catch
            {
                return;
            }
        }
    }

    private static string CreateCodeVerifier()
    {
        byte[] bytes = RandomNumberGenerator.GetBytes(48);
        return Base64Url(bytes);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string ResultPage(bool ok, string? error) => $$"""
        <!doctype html>
        <html><head><meta charset="utf-8"><title>Nosignal made by ATVR</title>
        <style>
          body { background:#000000; color:#ffffff; font-family:'Segoe UI',sans-serif;
                 display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
          .card { text-align:center; padding:2.5rem 3rem; background:#141414;
                  border:1px solid rgba(255,255,255,.15); border-radius:14px; }
          h1 { font-size:1.3rem; margin:0 0 .5rem; color:{{(ok ? "#ffffff" : "#bbbbbb")}}; }
          p { color:#888888; font-size:.95rem; margin:0; }
          .brand { font-size:.7rem; color:#444444; margin-top:1rem; }
        </style></head>
        <body><div class="card">
          <h1>{{(ok ? "Signed in!" : "Sign-in failed")}}</h1>
          <p>{{(ok ? "You can close this tab and return to Nosignal." : WebUtility.HtmlEncode(error ?? "Please try again from the app."))}}</p>
          <p class="brand">Nosignal made by ATVR</p>
        </div></body></html>
        """;
}

public class AuthException(string message) : Exception(message);
