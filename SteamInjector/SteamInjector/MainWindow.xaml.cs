using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

using MessageBox = System.Windows.MessageBox;
using Color      = System.Windows.Media.Color;
using Button     = System.Windows.Controls.Button;

namespace SteamInjector;

// ── View model for a search result / add-queue item ───────────────────────────

public class GameItem : INotifyPropertyChanged
{
    public int    AppId { get; set; }
    public string Name  { get; set; } = "";

    private bool _isSelected;
    public bool IsSelected
    {
        get => _isSelected;
        set { _isSelected = value; OnProp(nameof(IsSelected)); }
    }

    // idle | pending | checking | downloading | success | failed | limit | unavailable | cancelled
    private string _status = "idle";
    public string Status
    {
        get => _status;
        set
        {
            _status = value;
            OnProp(nameof(Status));
            OnProp(nameof(StatusText));
            OnProp(nameof(StatusColor));
            OnProp(nameof(BtnLabel));
            OnProp(nameof(BtnColor));
            OnProp(nameof(BtnEnabled));
        }
    }

    private string _detail = "";
    public string Detail
    {
        get => _detail;
        set { _detail = value; OnProp(nameof(StatusText)); }
    }

    public string StatusText => Status switch
    {
        "idle"        => "",
        "pending"     => "⏳ Queued…",
        "checking"    => "🔍 Checking sources…",
        "downloading" => $"⬇ Downloading via {Detail}…",
        "success"     => $"✅ {(string.IsNullOrEmpty(Detail) ? "Added!" : Detail)}",
        "failed"      => $"❌ {Detail}",
        "limit"       => "🚫 Daily limit reached (25/day). Upgrade to Supporter.",
        "unavailable" => "⚠ Not available on any source",
        "cancelled"   => "Cancelled",
        _             => Detail,
    };

    public SolidColorBrush StatusColor => Status switch
    {
        "success"     => new SolidColorBrush(Color.FromRgb(0x00, 0xB8, 0x94)),
        "failed"      => new SolidColorBrush(Color.FromRgb(0xFF, 0x6B, 0x81)),
        "limit"       => new SolidColorBrush(Color.FromRgb(0xFD, 0xCB, 0x6E)),
        "unavailable" => new SolidColorBrush(Color.FromRgb(0xFD, 0xCB, 0x6E)),
        "checking"    => new SolidColorBrush(Color.FromRgb(0x74, 0xB9, 0xFF)),
        "downloading" => new SolidColorBrush(Color.FromRgb(0xA2, 0x9B, 0xFE)),
        _             => new SolidColorBrush(Color.FromRgb(0x88, 0x88, 0x99)),
    };

    public string BtnLabel => Status is "pending" or "checking" or "downloading" ? "✕" : "+ Add";
    public SolidColorBrush BtnColor => Status is "pending" or "checking" or "downloading"
        ? new SolidColorBrush(Color.FromRgb(0xD6, 0x30, 0x31))
        : new SolidColorBrush(Color.FromRgb(0x6C, 0x5C, 0xE7));
    public bool   BtnEnabled => true;

    public CancellationTokenSource? Cts { get; set; }

    public event PropertyChangedEventHandler? PropertyChanged;
    void OnProp(string n) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(n));
}

// ── App settings ──────────────────────────────────────────────────────────────

public class AppSettings
{
    public string SteamPath    { get; set; } = "";
    public string StplugDir    { get; set; } = "";
    public string BackendPath  { get; set; } = "";
    public int    BackendPort  { get; set; } = 3000;
    public string AppListPath  { get; set; } = "";
    public string Mode         { get; set; } = "Bst";
    public bool   FastFetch    { get; set; } = true;
}

// ── MainWindow ────────────────────────────────────────────────────────────────

public partial class MainWindow : Window
{
    private static readonly string SettingsFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "SteamInjector", "settings.json");

    private AppSettings _cfg = new();
    private List<SteamLibrary> _libs = [];

    private readonly ObservableCollection<GameItem> _results = [];
    private readonly DispatcherTimer _statusTimer = new();
    private readonly SemaphoreSlim   _addSem      = new(1, 1);

    public MainWindow()
    {
        InitializeComponent();
        LoadSettings();
        ListResults.ItemsSource = _results;

        _statusTimer.Interval = TimeSpan.FromSeconds(6);
        _statusTimer.Tick    += (_, _) => Dispatcher.Invoke(UpdateStatusBadges);
        _statusTimer.Start();

        _ = InitAsync();
    }

    private async Task InitAsync()
    {
        await Task.WhenAll(
            LoadGameDbAsync(),
            DetectBackendAsync(),
            Task.Run(RefreshLibraries)
        );
        Dispatcher.Invoke(() =>
        {
            UpdateStatusBadges();
            FillLibCombos();
            UpdateLibStats();
            TxtVersion.Text = $"v2.0 · {AppListService.Count:N0} games";
            TxtDbInfo.Text  = AppListService.IsLoaded
                ? $"{AppListService.Count:N0} games"
                : "No DB loaded";
        });
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    private void LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsFile))
                _cfg = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(SettingsFile)) ?? new();
        }
        catch { _cfg = new(); }

        if (string.IsNullOrEmpty(_cfg.SteamPath))
            _cfg.SteamPath = SteamService.DetectSteamPath() ?? "";

        if (string.IsNullOrEmpty(_cfg.StplugDir) && !string.IsNullOrEmpty(_cfg.SteamPath))
            _cfg.StplugDir = Path.Combine(_cfg.SteamPath, "config", "stplug-in");

        SteamAutoBackend.Port = _cfg.BackendPort;

        // Bind to UI
        TxtSteamPath.Text    = _cfg.SteamPath;
        TxtStplugDir.Text    = _cfg.StplugDir;
        TxtBackendPath.Text  = _cfg.BackendPath;
        TxtBackendPort.Text  = _cfg.BackendPort.ToString();
        TxtAppListPath.Text  = _cfg.AppListPath;
        TxtLuaDir.Text       = _cfg.StplugDir;

        CmbMode.SelectedIndex = _cfg.Mode == "Custom" ? 1 : 0;
        ChkFastFetch.IsChecked = _cfg.FastFetch;
    }

    private void SaveSettings()
    {
        _cfg.SteamPath   = TxtSteamPath.Text.Trim();
        _cfg.StplugDir   = TxtStplugDir.Text.Trim();
        _cfg.BackendPath = TxtBackendPath.Text.Trim();
        _cfg.AppListPath = TxtAppListPath.Text.Trim();
        _cfg.Mode        = (CmbMode.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Bst";
        _cfg.FastFetch   = ChkFastFetch.IsChecked == true;

        if (int.TryParse(TxtBackendPort.Text.Trim(), out var port))
        {
            _cfg.BackendPort       = port;
            SteamAutoBackend.Port  = port;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile)!);
            File.WriteAllText(SettingsFile,
                JsonSerializer.Serialize(_cfg, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) { Log($"[ERROR] Save: {ex.Message}"); }
    }

    // ── Game DB ───────────────────────────────────────────────────────────────

    private async Task LoadGameDbAsync()
    {
        var loaded = await AppListService.LoadAsync(
            string.IsNullOrWhiteSpace(_cfg.AppListPath) ? null : _cfg.AppListPath);

        Dispatcher.Invoke(() =>
        {
            if (loaded)
            {
                TxtDbInfo.Text   = $"{AppListService.Count:N0} games";
                TxtDbStatus.Text = $"✓ Loaded from {AppListService.LoadedFrom}  ({AppListService.Count:N0} entries)";
                TxtDbStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00, 0xB8, 0x94));
            }
            else
            {
                TxtDbInfo.Text   = "No DB (using built-in)";
                TxtDbStatus.Text = "steam-applist.json not found. Using built-in list (~200 games).\nTip: copy steam-applist.json from LuaToolsGui\\AppData folder next to the exe.";
                TxtDbStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x66, 0x66, 0x88));
            }
            StatGames.Text = AppListService.IsLoaded ? $"{AppListService.Count:N0}" : "~200";
        });
    }

    // ── Backend detection ─────────────────────────────────────────────────────

    private async Task DetectBackendAsync()
    {
        var running = await SteamAutoBackend.IsRunningAsync();
        if (!running)
        {
            var found = await SteamAutoBackend.AutoDetectPortAsync();
            running   = found >= 0;
        }
        Dispatcher.Invoke(() => UpdateBackendBadge(running));
    }

    private void UpdateBackendBadge(bool running)
    {
        var col = running
            ? Color.FromRgb(0x00, 0xB8, 0x94)
            : Color.FromRgb(0xFF, 0x47, 0x57);
        var brush = new SolidColorBrush(col);

        BackendDot.Fill          = brush;
        TxtBackendStatus.Text    = running ? $"Online :{SteamAutoBackend.Port}" : "Offline";
        TxtBackendStatus.Foreground = brush;
        BackendBanner.Visibility = running ? Visibility.Collapsed : Visibility.Visible;

        if (running)
            TxtBannerMsg.Text = "SteamAutoCrack backend is offline. Set its path in Settings and launch it.";
    }

    // ── Status badges ─────────────────────────────────────────────────────────

    private void UpdateStatusBadges()
    {
        var steam = SteamService.IsSteamRunning();
        SteamDot.Fill          = new SolidColorBrush(steam ? Color.FromRgb(0x00,0xB8,0x94) : Color.FromRgb(0xFF,0x47,0x57));
        TxtSteamStatus.Text    = steam ? "Running" : "Not Running";
        TxtSteamStatus.Foreground = new SolidColorBrush(steam ? Color.FromRgb(0x00,0xB8,0x94) : Color.FromRgb(0x66,0x66,0x88));

        var steamPath  = _cfg.SteamPath;
        var hasMill    = SteamService.IsMillenniumInstalled(steamPath);
        var hasStplug  = SteamService.IsStplugInReady(steamPath);
        var luaCnt     = SteamService.CountStplugInFiles(steamPath);

        MillDot.Fill = new SolidColorBrush(hasMill ? Color.FromRgb(0x00,0xB8,0x94) : Color.FromRgb(0xFF,0x47,0x57));
        TxtMillStatus.Text = hasMill
            ? $"✓ stplug-in: {(hasStplug ? $"{luaCnt}" : "not found")}"
            : "Not detected";
        TxtMillStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x66,0x66,0x88));

        _ = Task.Run(async () =>
        {
            var on = await SteamAutoBackend.IsRunningAsync();
            Dispatcher.Invoke(() => UpdateBackendBadge(on));
        });
    }

    // ── Library helpers ───────────────────────────────────────────────────────

    private void RefreshLibraries()
    {
        _libs = SteamService.GetAllLibraryFolders(_cfg.SteamPath);
    }

    private void FillLibCombos()
    {
        foreach (var combo in new[] { CmbToolLib })
        {
            combo.Items.Clear();
            foreach (var lib in _libs) combo.Items.Add(lib.Path);
            if (combo.Items.Count > 0) combo.SelectedIndex = 0;
        }
    }

    private void UpdateLibStats()
    {
        StatLibs.Text = _libs.Count.ToString();
        var acfCount  = _libs.Sum(lib =>
        {
            try { return Directory.GetFiles(lib.Path, "appmanifest_*.acf").Length; } catch { return 0; }
        });
        StatAcf.Text = acfCount.ToString();

        var stplug  = string.IsNullOrEmpty(_cfg.StplugDir) ? "" : _cfg.StplugDir;
        StatLua.Text = SteamService.CountStplugInFiles(_cfg.SteamPath).ToString();

        ListLibs.Items.Clear();
        foreach (var lib in _libs) ListLibs.Items.Add(lib.Label);
    }

    // ── Search ────────────────────────────────────────────────────────────────

    private void TxtSearch_Changed(object sender, TextChangedEventArgs e)
    {
        var q = TxtSearch.Text.Trim();
        _results.Clear();

        if (q.Length < 2) return;

        List<(int, string)> hits;
        if (AppListService.IsLoaded)
        {
            hits = AppListService.Search(q, 60);
        }
        else
        {
            // Fall back to built-in list
            hits = SteamService.GetBuiltInGames()
                .Where(g => g.Name.Contains(q, StringComparison.OrdinalIgnoreCase)
                         || g.AppId.ToString() == q)
                .Select(g => (g.AppId, g.Name))
                .Take(60)
                .ToList();
        }

        foreach (var (id, name) in hits)
            _results.Add(new GameItem { AppId = id, Name = name });

        TxtSelCount.Text = $"{_results.Count} results";
    }

    // ── Add single item ───────────────────────────────────────────────────────

    private void BtnAddItem_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is not GameItem item) return;

        // If in-progress → cancel
        if (item.Status is "pending" or "checking" or "downloading")
        {
            item.Cts?.Cancel();
            item.Status = "cancelled";
            Log($"[CANCEL] {item.Name} ({item.AppId})");
            return;
        }

        _ = AddItemAsync(item);
    }

    private async Task AddItemAsync(GameItem item)
    {
        await _addSem.WaitAsync();
        try
        {
            item.Cts    = new CancellationTokenSource();
            item.Status = "checking";
            Log($"[ADD] {item.Name} ({item.AppId}) — checking sources…");

            var result = await SteamAutoBackend.AddAppAsync(item.AppId, item.Cts.Token);

            if (result.DailyLimit)
            {
                item.Status = "limit";
                Log($"[LIMIT] Daily limit reached (25/day).");
                return;
            }
            if (result.NoSource)
            {
                item.Status = "unavailable";
                Log($"[UNAVAIL] {item.Name} ({item.AppId}) — no downloadable source.");
                return;
            }
            if (result.Success)
            {
                item.Detail = result.Message.Length > 0 ? result.Message : $"Added via {result.Source}";
                item.Status = "success";
                Log($"[OK] {item.Name} ({item.AppId}) — {item.Detail}");

                // Also write a local stplug-in lua as fallback
                var stplug = string.IsNullOrEmpty(_cfg.StplugDir)
                    ? Path.Combine(_cfg.SteamPath, "config", "stplug-in")
                    : _cfg.StplugDir;
                if (!string.IsNullOrEmpty(_cfg.SteamPath))
                    SteamService.InjectViaLuaTools(_cfg.SteamPath, item.AppId, item.Name, stplug);
            }
            else
            {
                // Backend offline or connection error — do local lua
                var msg = result.Message;
                if (msg.Contains("unreachable") || msg.Contains("offline") || msg.Contains("refused"))
                {
                    Log($"[WARN] Backend offline — writing local stplug-in lua for {item.Name}");
                    var stplug = string.IsNullOrEmpty(_cfg.StplugDir)
                        ? Path.Combine(_cfg.SteamPath, "config", "stplug-in")
                        : _cfg.StplugDir;
                    var (ok, m) = SteamService.InjectViaLuaTools(_cfg.SteamPath, item.AppId, item.Name, stplug);
                    item.Detail = ok ? "Lua written (offline)" : m;
                    item.Status = ok ? "success" : "failed";
                }
                else
                {
                    item.Detail = msg.Length > 0 ? msg : "Download failed.";
                    item.Status = "failed";
                    Log($"[FAIL] {item.Name} ({item.AppId}) — {item.Detail}");
                }
            }
        }
        finally
        {
            _addSem.Release();
        }
    }

    // ── Add selected ──────────────────────────────────────────────────────────

    private void BtnAddSelected_Click(object sender, RoutedEventArgs e)
    {
        var sel = _results.Where(g => g.IsSelected).ToList();
        if (!sel.Any())
        {
            MessageBox.Show("Select at least one game first.", "Nothing Selected",
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        _ = Task.Run(async () =>
        {
            foreach (var item in sel)
            {
                Task addTask = null!;
                await Dispatcher.InvokeAsync(() => { addTask = AddItemAsync(item); });
                if (addTask != null) await addTask;
            }
        });
    }

    private void BtnSelAll_Click(object sender, RoutedEventArgs e)
    {
        foreach (var g in _results) g.IsSelected = true;
        TxtSelCount.Text = $"{_results.Count(g => g.IsSelected)} selected";
    }
    private void BtnSelNone_Click(object sender, RoutedEventArgs e)
    {
        foreach (var g in _results) g.IsSelected = false;
        TxtSelCount.Text = "";
    }

    // ── Backend controls ──────────────────────────────────────────────────────

    private void BtnLaunchBackend_Click(object sender, RoutedEventArgs e)
    {
        var path = _cfg.BackendPath;
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            MessageBox.Show(
                "SteamAutoCrack path not set or file not found.\n\nGo to Settings → set the path to SteamAutoCrack.exe.",
                "Path Not Set", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        try
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            Log($"[BACKEND] Launched: {path}");
            Task.Delay(3000).ContinueWith(_ =>
                Dispatcher.Invoke(() => _ = DetectBackendAsync()));
        }
        catch (Exception ex) { Log($"[ERROR] Launch backend: {ex.Message}"); }
    }

    private void BtnCheckBackend_Click(object sender, RoutedEventArgs e) => _ = DetectBackendAsync();

    // ── Steam controls ────────────────────────────────────────────────────────

    private void BtnStartSteam_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_cfg.SteamPath))
        { MessageBox.Show("Steam path not set. Go to Settings → Auto-Detect.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        try { SteamService.StartSteam(_cfg.SteamPath); Log("Starting Steam…"); }
        catch (Exception ex) { Log($"[ERROR] {ex.Message}"); }
    }

    private void BtnKillSteam_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Kill Steam?", "Confirm", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        SteamService.KillSteam();
        Log("Killed Steam.");
    }

    private void BtnRestartSteam_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_cfg.SteamPath)) { MessageBox.Show("Steam path not set.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        if (MessageBox.Show("Restart Steam?", "Confirm", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        Task.Run(() => { SteamService.RestartSteam(_cfg.SteamPath); Dispatcher.Invoke(UpdateStatusBadges); });
        Log("Restarting Steam…");
    }

    private void BtnRefreshSteam_Click(object sender, RoutedEventArgs e)
    {
        Task.Run(() => { RefreshLibraries(); Dispatcher.Invoke(() => { FillLibCombos(); UpdateLibStats(); UpdateStatusBadges(); }); });
    }

    // ── Library page ──────────────────────────────────────────────────────────

    private void BtnRefreshLib_Click(object sender, RoutedEventArgs e) => BtnRefreshSteam_Click(sender, e);

    private void BtnCleanAcf_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_cfg.SteamPath))
        { MessageBox.Show("Steam path not set.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        int total = 0;
        foreach (var lib in _libs)
        {
            try
            {
                foreach (var f in Directory.GetFiles(lib.Path, "appmanifest_*.acf"))
                {
                    File.Delete(f);
                    total++;
                    Log($"[CLEAN] Deleted: {Path.GetFileName(f)}");
                }
            }
            catch (Exception ex) { Log($"[WARN] {ex.Message}"); }
        }
        UpdateLibStats();
        MessageBox.Show($"Removed {total} ACF manifest(s).\n\nRestart Steam and use Add Games to re-add properly.",
            "Clean Complete", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void BtnDiagnose_Click(object sender, RoutedEventArgs e)
    {
        var sp    = _cfg.SteamPath;
        var steamOk = !string.IsNullOrEmpty(sp) && Directory.Exists(sp);
        var millOk  = steamOk && SteamService.IsMillenniumInstalled(sp);
        var plugOk  = steamOk && SteamService.IsStplugInReady(sp);
        var luaCnt  = steamOk ? SteamService.CountStplugInFiles(sp) : 0;

        string T(bool v) => v ? "✅" : "❌";
        var msg =
            $"{T(steamOk)} Steam path:   {(steamOk ? sp : "(not found)")}\n" +
            $"{T(millOk)} Millennium:   {(millOk ? "Installed" : "NOT FOUND")}\n" +
            $"{T(plugOk)} stplug-in:    {(plugOk ? $"Found ({luaCnt} scripts)" : "NOT FOUND")}\n\n";

        if (!steamOk)  msg += "👉 Settings → Auto-Detect Steam\n";
        if (!millOk)   msg += "👉 Install Millennium: https://millennium.web.app/\n";
        if (millOk && !plugOk) msg += "👉 Install stplug-in inside Millennium\n";
        if (plugOk && luaCnt == 0) msg += "👉 Use Add Games to add scripts\n";
        if (plugOk && luaCnt > 0) msg += "✅ Everything looks good!";

        Log($"[DIAGNOSE] Steam={steamOk} Mil={millOk} stplug={plugOk} lua={luaCnt}");
        MessageBox.Show(msg, "Diagnose", MessageBoxButton.OK,
            (steamOk && millOk && plugOk) ? MessageBoxImage.Information : MessageBoxImage.Warning);
    }

    // ── Manual tools page ─────────────────────────────────────────────────────

    private void BtnInjectAcf_Click(object sender, RoutedEventArgs e)
    {
        if (!TryGetToolParams(out var appId, out var name)) return;
        var lib = CmbToolLib.SelectedItem?.ToString();
        if (string.IsNullOrEmpty(lib)) { TxtToolResult.Text = "[ERROR] No library selected."; return; }
        var (ok, msg) = SteamService.InjectManifest(lib, appId, name);
        TxtToolResult.Text = msg;
        Log(msg);
    }

    private void BtnWriteLua_Click(object sender, RoutedEventArgs e)
    {
        if (!TryGetToolParams(out var appId, out var name)) return;
        var dir = string.IsNullOrEmpty(_cfg.StplugDir)
            ? Path.Combine(_cfg.SteamPath, "config", "stplug-in")
            : _cfg.StplugDir;
        var (ok, msg) = SteamService.InjectViaLuaTools(_cfg.SteamPath, appId, name, dir);
        TxtToolResult.Text = msg;
        Log(msg);
    }

    private void BtnRemoveAcf_Click(object sender, RoutedEventArgs e)
    {
        if (!TryGetToolParams(out var appId, out var name)) return;
        var removed = SteamService.RemoveAllAcf(_cfg.SteamPath, appId);
        TxtToolResult.Text = removed > 0 ? $"[OK] Removed {removed} ACF file(s) for {appId}" : "[INFO] No ACF files found.";
        Log(TxtToolResult.Text);
    }

    private bool TryGetToolParams(out int appId, out string name)
    {
        appId = 0; name = TxtToolName.Text.Trim();
        if (!int.TryParse(TxtToolAppId.Text.Trim(), out appId) || appId <= 0)
        { TxtToolResult.Text = "[ERROR] Invalid AppID."; return false; }
        if (string.IsNullOrEmpty(name))
        { TxtToolResult.Text = "[ERROR] Name required."; return false; }
        return true;
    }

    // ── Lua generator page ────────────────────────────────────────────────────

    private void BtnBrowseLua_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtLuaDir.Text = d; }

    private void BtnGenLua_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(TxtLuaAppId.Text.Trim(), out var appId) || appId <= 0)
        { TxtLuaPreview.Text = "[ERROR] Invalid AppID."; return; }
        var name = TxtLuaName.Text.Trim();
        if (string.IsNullOrEmpty(name)) { TxtLuaPreview.Text = "[ERROR] Name required."; return; }

        List<int>? depots = null;
        if (!string.IsNullOrWhiteSpace(TxtLuaDepots.Text))
            depots = TxtLuaDepots.Text.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Where(s => int.TryParse(s.Trim(), out _)).Select(s => int.Parse(s.Trim())).ToList();

        var lua = SteamService.GenerateLua(appId, name, depots);
        TxtLuaPreview.Text = lua;

        var dir = TxtLuaDir.Text.Trim();
        if (!string.IsNullOrEmpty(dir))
        {
            try
            {
                Directory.CreateDirectory(dir);
                var path = Path.Combine(dir, $"{appId}.lua");
                File.WriteAllText(path, lua);
                Log($"[LUA] Written → {path}");
            }
            catch (Exception ex) { Log($"[ERROR] Lua write: {ex.Message}"); }
        }
    }

    // ── Settings page ─────────────────────────────────────────────────────────

    private void BtnBrowseSteam_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtSteamPath.Text = d; }

    private void BtnBrowseStplug_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtStplugDir.Text = d; }

    private void BtnBrowseBackend_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        { Filter = "Executable|*.exe", Title = "Select SteamAutoCrack.exe" };
        if (dlg.ShowDialog() == true)
            TxtBackendPath.Text = dlg.FileName;
    }

    private void BtnBrowseAppList_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        { Filter = "JSON|*.json", Title = "Select steam-applist.json" };
        if (dlg.ShowDialog() == true)
            TxtAppListPath.Text = dlg.FileName;
    }

    private void BtnAutoDetect_Click(object sender, RoutedEventArgs e)
    {
        var path = SteamService.DetectSteamPath();
        if (!string.IsNullOrEmpty(path))
        {
            TxtSteamPath.Text = path;
            _cfg.SteamPath    = path;
            if (string.IsNullOrEmpty(TxtStplugDir.Text))
                TxtStplugDir.Text = Path.Combine(path, "config", "stplug-in");

            TxtSteamDetectStatus.Text       = $"✓ Detected: {path}";
            TxtSteamDetectStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00,0xB8,0x94));
            Log($"[AUTO] Steam: {path}  Millennium: {SteamService.IsMillenniumInstalled(path)}");
        }
        else
        {
            TxtSteamDetectStatus.Text       = "✗ Not found — set path manually.";
            TxtSteamDetectStatus.Foreground = new SolidColorBrush(Color.FromRgb(0xFF,0x47,0x57));
        }
    }

    private void BtnAutoFindBackend_Click(object sender, RoutedEventArgs e)
    {
        // Look in common locations for SteamAutoCrack.exe
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var profile   = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

        var candidates = new[]
        {
            Path.Combine(appData,   "LuaToolsGui",        "SteamAutoCrack.exe"),
            Path.Combine(localData, "LuaToolsGui",        "SteamAutoCrack.exe"),
            Path.Combine(profile,   "Downloads",          "SteamAutoCrack.exe"),
            Path.Combine("C:\\",   "SteamAutoCrack",     "SteamAutoCrack.exe"),
            Path.Combine(Path.GetDirectoryName(Environment.ProcessPath) ?? "", "SteamAutoCrack.exe"),
        };

        var found = candidates.FirstOrDefault(File.Exists);
        if (found != null)
        {
            TxtBackendPath.Text = found;
            Log($"[AUTO] Found backend: {found}");
        }
        else
        {
            MessageBox.Show("SteamAutoCrack.exe not found in common locations.\nBrowse to it manually.",
                "Not Found", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private void BtnScanPorts_Click(object sender, RoutedEventArgs e)
    {
        TxtPortStatus.Text       = "Scanning…";
        TxtPortStatus.Foreground = new SolidColorBrush(Color.FromRgb(0xA2,0x9B,0xFE));
        _ = Task.Run(async () =>
        {
            var port = await SteamAutoBackend.AutoDetectPortAsync();
            Dispatcher.Invoke(() =>
            {
                if (port >= 0)
                {
                    TxtBackendPort.Text      = port.ToString();
                    TxtPortStatus.Text       = $"✓ Backend found on port {port}";
                    TxtPortStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00,0xB8,0x94));
                    UpdateBackendBadge(true);
                }
                else
                {
                    TxtPortStatus.Text       = "✗ Backend not found on any port. Start SteamAutoCrack.exe first.";
                    TxtPortStatus.Foreground = new SolidColorBrush(Color.FromRgb(0xFF,0x47,0x57));
                }
            });
        });
    }

    private void BtnSaveSettings_Click(object sender, RoutedEventArgs e)
    {
        SaveSettings();
        TxtSaveStatus.Text       = "✓ Saved.";
        TxtSaveStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00,0xB8,0x94));
        Log("[SETTINGS] Saved.");
        Task.Run(() => { RefreshLibraries(); Dispatcher.Invoke(() => { FillLibCombos(); UpdateLibStats(); }); });
        _ = LoadGameDbAsync();
    }

    private void CmbMode_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _cfg.Mode = (CmbMode.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Bst";
    }

    // ── Nav ───────────────────────────────────────────────────────────────────

    private void Nav_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn) ShowPage(btn.Tag?.ToString() ?? "Add");
    }

    private void ShowPage(string tag)
    {
        foreach (var p in new FrameworkElement[] { PageAdd, PageLibrary, PageTools, PageLog, PageSettings })
            p.Visibility = Visibility.Collapsed;
        foreach (var b in new[] { BtnNavAdd, BtnNavLibrary, BtnNavTools, BtnNavLog, BtnNavSettings })
            b.Style = (Style)FindResource("NavBtn");

        var (page, btn, extra) = tag switch
        {
            "Add"      => ((FrameworkElement)PageAdd,      BtnNavAdd,      (Action?)null),
            "Library"  => (PageLibrary,  BtnNavLibrary,  (Action)(() => { Task.Run(() => { RefreshLibraries(); Dispatcher.Invoke(() => { FillLibCombos(); UpdateLibStats(); }); }); })),
            "Tools"    => (PageTools,    BtnNavTools,    null!),
            "Log"      => (PageLog,      BtnNavLog,      null!),
            "Settings" => (PageSettings, BtnNavSettings, null!),
            _          => (PageAdd,      BtnNavAdd,      null!),
        };
        page.Visibility = Visibility.Visible;
        btn.Style = (Style)FindResource("NavBtnActive");
        extra?.Invoke();
    }

    // ── Log ───────────────────────────────────────────────────────────────────

    private void Log(string msg)
    {
        Dispatcher.Invoke(() =>
        {
            TxtLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {msg}\n");
            LogScroller.ScrollToBottom();
        });
    }

    private void BtnClearLog_Click(object sender, RoutedEventArgs e) => TxtLog.Clear();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string? PickFolder()
    {
        var dlg = new Microsoft.Win32.OpenFolderDialog { Title = "Select folder" };
        return dlg.ShowDialog() == true ? dlg.FolderName : null;
    }
}
