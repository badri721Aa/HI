using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

// Explicit aliases — kills every WinForms vs WPF ambiguity at the root
using MessageBox = System.Windows.MessageBox;
using Color = System.Windows.Media.Color;
using Button = System.Windows.Controls.Button;

namespace SteamInjector;

public class GameViewModel : System.ComponentModel.INotifyPropertyChanged
{
    public int    AppId     { get; set; }
    public string Name      { get; set; } = "";
    public string Genre     { get; set; } = "";
    public string Developer { get; set; } = "";

    private bool _isSelected;
    public bool IsSelected
    {
        get => _isSelected;
        set { _isSelected = value; OnPropertyChanged(nameof(IsSelected)); }
    }

    private bool _isInjected;
    public bool IsInjected
    {
        get => _isInjected;
        set { _isInjected = value; OnPropertyChanged(nameof(IsInjected)); }
    }

    public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged(string name) =>
        PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(name));
}

public class AppSettings
{
    public string SteamPath      { get; set; } = "";
    public string DefaultLuaDir  { get; set; } = "";
    public string LuaToolsDir    { get; set; } = "";
}

public partial class MainWindow : Window
{
    private static readonly string SettingsFile =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "SteamInjector", "settings.json");

    private AppSettings _settings = new();
    private List<SteamLibrary> _libraries = [];
    private ObservableCollection<GameViewModel> _allGames      = [];
    private ObservableCollection<GameViewModel> _filteredGames = [];
    private ObservableCollection<GameViewModel> _batchGames    = [];
    private readonly DispatcherTimer _statusTimer = new();

    public MainWindow()
    {
        InitializeComponent();
        LoadSettings();
        BuildGameLists();
        PopulateGenreFilter();
        RefreshStatus();
        BindLists();

        _statusTimer.Interval = TimeSpan.FromSeconds(5);
        _statusTimer.Tick += (_, _) => UpdateSteamRunningBadge();
        _statusTimer.Start();

        ChkGenerateLua.Checked   += (_, _) => PanelLuaOutput.Visibility = Visibility.Visible;
        ChkGenerateLua.Unchecked += (_, _) => PanelLuaOutput.Visibility = Visibility.Collapsed;

        TxtVersion.Text = $"v1.0.0 — {SteamService.GetBuiltInGames().Count} games";
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    private void LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsFile))
                _settings = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(SettingsFile)) ?? new();
        }
        catch { _settings = new(); }

        if (string.IsNullOrEmpty(_settings.SteamPath))
            _settings.SteamPath = SteamService.DetectSteamPath() ?? "";

        if (string.IsNullOrEmpty(_settings.DefaultLuaDir))
            _settings.DefaultLuaDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                "SteamInjector", "lua");

        // Auto-detect LuaTools / stplug-in scripts dir from Steam path
        if (string.IsNullOrEmpty(_settings.LuaToolsDir) && !string.IsNullOrEmpty(_settings.SteamPath))
            _settings.LuaToolsDir = Path.Combine(_settings.SteamPath, "config", "stplug-in");

        TxtSteamPath.Text     = _settings.SteamPath;
        TxtDefaultLuaDir.Text = _settings.DefaultLuaDir;
        TxtLuaToolsDir.Text   = _settings.LuaToolsDir;
        TxtLuaDir.Text        = _settings.DefaultLuaDir;
        TxtLuaOutDir.Text     = _settings.DefaultLuaDir;
    }

    private void SaveSettings()
    {
        try
        {
            _settings.SteamPath     = TxtSteamPath.Text.Trim();
            _settings.DefaultLuaDir = TxtDefaultLuaDir.Text.Trim();
            _settings.LuaToolsDir   = TxtLuaToolsDir.Text.Trim();
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile)!);
            File.WriteAllText(SettingsFile,
                JsonSerializer.Serialize(_settings, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) { Log($"[ERROR] Save settings: {ex.Message}"); }
    }

    // ── Game list ─────────────────────────────────────────────────────────────

    private void BuildGameLists()
    {
        var seen = new HashSet<int>();
        _allGames.Clear();
        foreach (var g in SteamService.GetBuiltInGames())
        {
            if (g.AppId == 0 || !seen.Add(g.AppId)) continue;
            _allGames.Add(new GameViewModel
            {
                AppId = g.AppId, Name = g.Name, Genre = g.Genre, Developer = g.Developer
            });
        }
        _filteredGames = new ObservableCollection<GameViewModel>(_allGames);
        _batchGames    = new ObservableCollection<GameViewModel>(_allGames);
        StatGames.Text = _allGames.Count.ToString();
    }

    private void PopulateGenreFilter()
    {
        CmbGenre.Items.Clear();
        CmbGenre.Items.Add(new ComboBoxItem { Content = "All Genres", IsSelected = true });
        foreach (var g in _allGames.Select(x => x.Genre).Distinct().OrderBy(x => x))
            CmbGenre.Items.Add(new ComboBoxItem { Content = g });
        CmbGenre.SelectedIndex = 0;
    }

    private void BindLists()
    {
        ListGames.ItemsSource = _filteredGames;
        ListBatch.ItemsSource = _batchGames;
        TxtGameCount.Text = $"{_filteredGames.Count} games";
    }

    private void ApplyFilter()
    {
        var search       = TxtSearch.Text.Trim().ToLowerInvariant();
        var genre        = (CmbGenre.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "All Genres";
        var selectedOnly = ChkSelectedOnly.IsChecked == true;

        _filteredGames.Clear();
        foreach (var g in _allGames.Where(g =>
            (string.IsNullOrEmpty(search) ||
             g.Name.ToLowerInvariant().Contains(search) ||
             g.AppId.ToString().Contains(search) ||
             g.Developer.ToLowerInvariant().Contains(search)) &&
            (genre == "All Genres" || g.Genre == genre) &&
            (!selectedOnly || g.IsSelected)))
            _filteredGames.Add(g);

        TxtGameCount.Text = $"{_filteredGames.Count} games";
        UpdateSelectedCount();
    }

    private void UpdateSelectedCount() =>
        TxtSelected.Text = $"{_allGames.Count(g => g.IsSelected)} selected";

    // ── Status / Steam ────────────────────────────────────────────────────────

    private void RefreshStatus()
    {
        try
        {
            _settings.SteamPath = TxtSteamPath.Text.Trim();
            if (string.IsNullOrEmpty(_settings.SteamPath))
                _settings.SteamPath = SteamService.DetectSteamPath() ?? "";

            _libraries = SteamService.GetAllLibraryFolders(_settings.SteamPath);

            ListLibs.Items.Clear();
            foreach (var lib in _libraries) ListLibs.Items.Add(lib.Label);

            foreach (var combo in new[] { CmbInjectLibrary, CmbDepotLibrary, CmbBatchLibrary })
            {
                combo.Items.Clear();
                foreach (var lib in _libraries) combo.Items.Add(lib.Path);
                if (combo.Items.Count > 0) combo.SelectedIndex = 0;
            }

            TxtSteamPathDash.Text = $"Steam Path: {(_settings.SteamPath.Length == 0 ? "(not detected — go to Settings)" : _settings.SteamPath)}";
            StatLibs.Text = _libraries.Count.ToString();

            StatInjected.Text = _libraries
                .Sum(lib =>
                {
                    try { return Directory.GetFiles(lib.Path, "appmanifest_*.acf").Length; }
                    catch { return 0; }
                }).ToString();

            foreach (var g in _allGames)
                g.IsInjected = _libraries.Any(lib => SteamService.AcfExists(lib.Path, g.AppId));
        }
        catch (Exception ex) { Log($"[ERROR] RefreshStatus: {ex.Message}"); }

        UpdateSteamRunningBadge();
    }

    private void UpdateSteamRunningBadge()
    {
        Dispatcher.Invoke(() =>
        {
            var running = SteamService.IsSteamRunning();
            SteamDot.Fill         = new SolidColorBrush(running ? Color.FromRgb(0x00,0xB8,0x94) : Color.FromRgb(0xFF,0x47,0x57));
            TxtSteamStatus.Text   = running ? "Running" : "Not Running";
            StatStatus.Text       = running ? "ONLINE" : "OFFLINE";
            StatStatus.Foreground = new SolidColorBrush(running ? Color.FromRgb(0x00,0xB8,0x94) : Color.FromRgb(0xFF,0x47,0x57));
        });
    }

    private void Log(string message)
    {
        Dispatcher.Invoke(() =>
        {
            TxtLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}\n");
            LogScroller.ScrollToBottom();
        });
    }

    // ── Nav ───────────────────────────────────────────────────────────────────

    private void Nav_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn) ShowPage(btn.Tag?.ToString() ?? "Dashboard");
    }

    private void ShowPage(string tag)
    {
        foreach (var p in new FrameworkElement[] { PageDashboard, PageGames, PageInject, PageLua, PageDepot, PageBatch, PageLog, PageSettings })
            p.Visibility = Visibility.Collapsed;
        foreach (var b in new[] { BtnNavDash, BtnNavGames, BtnNavInject, BtnNavLua, BtnNavDepot, BtnNavBatch, BtnNavLog, BtnNavSettings })
            b.Style = (Style)FindResource("NavBtn");

        var (page, btn, extra) = tag switch
        {
            "Dashboard" => ((FrameworkElement)PageDashboard, BtnNavDash,     (Action)RefreshStatus),
            "Games"     => (PageGames,    BtnNavGames,    null!),
            "Inject"    => (PageInject,   BtnNavInject,   null!),
            "Lua"       => (PageLua,      BtnNavLua,      null!),
            "Depot"     => (PageDepot,    BtnNavDepot,    null!),
            "Batch"     => (PageBatch,    BtnNavBatch,    (Action)SyncBatchList),
            "Log"       => (PageLog,      BtnNavLog,      null!),
            "Settings"  => (PageSettings, BtnNavSettings, null!),
            _           => (PageDashboard,BtnNavDash,     (Action)RefreshStatus),
        };
        page.Visibility = Visibility.Visible;
        btn.Style = (Style)FindResource("NavBtnActive");
        extra?.Invoke();
    }

    private void SyncBatchList()
    {
        _batchGames.Clear();
        foreach (var g in _allGames) _batchGames.Add(g);
    }

    // ── Dashboard buttons ─────────────────────────────────────────────────────

    private void BtnRefresh_Click(object sender, RoutedEventArgs e) => RefreshStatus();

    private void BtnStartSteam_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (string.IsNullOrEmpty(_settings.SteamPath))
            { MessageBox.Show("Steam path not set. Go to Settings → Auto-Detect.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
            Log("Starting Steam...");
            SteamService.StartSteam(_settings.SteamPath);
            Task.Delay(2500).ContinueWith(_ => UpdateSteamRunningBadge());
        }
        catch (Exception ex) { Log($"[ERROR] Start Steam: {ex.Message}"); }
    }

    private void BtnKillSteam_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (MessageBox.Show("Kill Steam process?", "Confirm", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            Log("Killing Steam...");
            SteamService.KillSteam();
            Task.Delay(2500).ContinueWith(_ => UpdateSteamRunningBadge());
        }
        catch (Exception ex) { Log($"[ERROR] Kill Steam: {ex.Message}"); }
    }

    private void BtnRestartSteam_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (string.IsNullOrEmpty(_settings.SteamPath))
            { MessageBox.Show("Steam path not set.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
            if (MessageBox.Show("Restart Steam?", "Confirm", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            Log("Restarting Steam...");
            Task.Run(() => { SteamService.RestartSteam(_settings.SteamPath); Dispatcher.Invoke(UpdateSteamRunningBadge); });
        }
        catch (Exception ex) { Log($"[ERROR] Restart Steam: {ex.Message}"); }
    }

    // ── Game browser ──────────────────────────────────────────────────────────

    private void TxtSearch_TextChanged(object sender, TextChangedEventArgs e) => ApplyFilter();
    private void CmbGenre_SelectionChanged(object sender, SelectionChangedEventArgs e) => ApplyFilter();
    private void ChkSelectedOnly_Changed(object sender, RoutedEventArgs e) => ApplyFilter();
    private void BtnSelectAll_Click(object sender, RoutedEventArgs e) { foreach (var g in _filteredGames) g.IsSelected = true; UpdateSelectedCount(); }
    private void BtnClearAll_Click(object sender, RoutedEventArgs e)  { foreach (var g in _allGames) g.IsSelected = false; UpdateSelectedCount(); }

    private void BtnInjectSelected_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var selected = _allGames.Where(g => g.IsSelected).ToList();
            if (!selected.Any()) { MessageBox.Show("No games selected.", "Info", MessageBoxButton.OK, MessageBoxImage.Information); return; }
            var lib = GetDefaultLibrary();
            if (lib == null) { MessageBox.Show("No Steam library found. Check Settings → Auto-Detect.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }

            if (SteamService.IsSteamRunning() &&
                MessageBox.Show("Steam is running. Manifests won't appear until Steam restarts.\n\nContinue anyway?",
                    "Steam Running", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

            int ok = 0, fail = 0;
            foreach (var g in selected)
            {
                var (success, msg) = SteamService.InjectManifest(lib.Path, g.AppId, g.Name);
                if (success) { ok++; g.IsInjected = true; } else fail++;
                Log(msg);
            }
            RefreshStatus();
            MessageBox.Show($"Done!\nInjected: {ok}   Failed: {fail}\n\nRestart Steam to see them in your library.",
                "Inject Complete", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex) { Log($"[ERROR] InjectSelected: {ex.Message}"); }
    }

    private void BtnAddLuaTools_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var selected = _allGames.Where(g => g.IsSelected).ToList();
            if (!selected.Any())
            { MessageBox.Show("Select at least one game first.", "Nothing selected", MessageBoxButton.OK, MessageBoxImage.Information); return; }

            var luaDir    = ResolveLuaToolsDir();
            var steamPath = _settings.SteamPath;
            if (luaDir == null) return;
            if (string.IsNullOrEmpty(steamPath))
            { MessageBox.Show("Steam path not set.\nGo to Settings → Auto-Detect first.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }

            if (SteamService.IsSteamRunning())
            {
                if (MessageBox.Show(
                    "Steam must be CLOSED before injecting.\n\nKill Steam now and continue?",
                    "Kill Steam Required", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
                SteamService.KillSteam();
                System.Threading.Thread.Sleep(2000);
            }

            int ok = 0, fail = 0;
            foreach (var g in selected)
            {
                var (success, msg) = SteamService.InjectViaLuaTools(steamPath, g.AppId, g.Name, luaDir);
                if (success) { ok++; g.IsInjected = false; } else fail++;
                foreach (var line in msg.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                    Log(line);
            }
            RefreshStatus();
            MessageBox.Show(
                $"Done! Processed: {ok}   Failed: {fail}\n\n" +
                "Old manifests removed. Lua files written to stplug-in folder.\n\n" +
                "Now START STEAM — Millennium will load the lua files\nand games will show 'Install' instead of 'Purchase'.",
                "Add via LuaTools — Complete", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex) { Log($"[ERROR] AddLuaTools: {ex.Message}"); }
    }

    private void BtnCleanManifests_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var steamPath = _settings.SteamPath;
            if (string.IsNullOrEmpty(steamPath))
            { MessageBox.Show("Steam path not set. Go to Settings → Auto-Detect.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }

            // Find all injected games that are causing PURCHASE
            var targets = _allGames.Where(g => g.IsInjected).ToList();
            if (!targets.Any())
            { MessageBox.Show("No injected manifests found to clean.", "Nothing to clean", MessageBoxButton.OK, MessageBoxImage.Information); return; }

            if (MessageBox.Show(
                $"This will DELETE all {targets.Count} injected appmanifest ACF files.\n" +
                "Games showing 'PURCHASE' will disappear from your library.\n\n" +
                "You should then use 'Add via LuaTools' to re-add them properly.\n\nContinue?",
                "Clean All Manifests", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

            if (SteamService.IsSteamRunning())
            {
                if (MessageBox.Show("Kill Steam first?", "Steam Running", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
                    SteamService.KillSteam();
            }

            int total = 0;
            foreach (var g in targets)
            {
                int r = SteamService.RemoveAllAcf(steamPath, g.AppId);
                if (r > 0) { g.IsInjected = false; total += r; }
                Log($"[CLEAN] {g.Name} ({g.AppId}) — removed {r} file(s)");
            }
            RefreshStatus();
            MessageBox.Show(
                $"Cleaned {total} manifest file(s).\n\nNow use 'Add via LuaTools' to re-add selected games — they'll show 'Install' after Steam restarts.",
                "Clean Complete", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex) { Log($"[ERROR] CleanManifests: {ex.Message}"); }
    }

    private void BtnRemoveSelected_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var selected = _allGames.Where(g => g.IsSelected).ToList();
            if (!selected.Any()) return;
            var steamPath = _settings.SteamPath;
            if (string.IsNullOrEmpty(steamPath)) { MessageBox.Show("Steam path not set.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
            if (MessageBox.Show($"Remove {selected.Count} manifest(s)?", "Confirm Remove",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            foreach (var g in selected)
            {
                int r = SteamService.RemoveAllAcf(steamPath, g.AppId);
                Log($"[{(r > 0 ? "REMOVED" : "NOT FOUND")}] appmanifest_{g.AppId}.acf");
                if (r > 0) g.IsInjected = false;
            }
            RefreshStatus();
        }
        catch (Exception ex) { Log($"[ERROR] RemoveSelected: {ex.Message}"); }
    }

    // ── Inject page ───────────────────────────────────────────────────────────

    private void BtnBrowseLuaDir_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtLuaOutDir.Text = d; }

    private void BtnInjectNow_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (!int.TryParse(TxtInjectAppId.Text.Trim(), out var appId) || appId <= 0)
            { TxtInjectResult.Text = "[ERROR] Invalid AppID."; return; }
            var name = TxtInjectName.Text.Trim();
            if (string.IsNullOrEmpty(name)) { TxtInjectResult.Text = "[ERROR] Game name required."; return; }
            var lib = CmbInjectLibrary.SelectedItem?.ToString();
            if (string.IsNullOrEmpty(lib)) { TxtInjectResult.Text = "[ERROR] No library folder selected. Refresh or set Steam path in Settings."; return; }

            if (SteamService.IsSteamRunning() &&
                MessageBox.Show("Steam is running — manifest changes won't apply until Steam restarts.\n\nContinue?",
                    "Steam Running", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

            var sf = ParseStateFlags();
            var (ok, msg) = SteamService.InjectManifest(lib, appId, name,
                ChkGenerateLua.IsChecked == true, TxtLuaOutDir.Text.Trim(), sf);
            TxtInjectResult.Text = msg;
            Log(msg);
            if (ok) RefreshStatus();
        }
        catch (Exception ex)
        {
            TxtInjectResult.Text = $"[ERROR] {ex.Message}";
            Log($"[ERROR] InjectNow: {ex.Message}");
        }
    }

    private void BtnInjectLuaToolsSingle_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (!int.TryParse(TxtInjectAppId.Text.Trim(), out var appId) || appId <= 0)
            { TxtInjectResult.Text = "[ERROR] Invalid AppID."; return; }
            var name = TxtInjectName.Text.Trim();
            if (string.IsNullOrEmpty(name)) { TxtInjectResult.Text = "[ERROR] Game name required."; return; }

            var luaDir    = ResolveLuaToolsDir();
            var steamPath = _settings.SteamPath;
            if (luaDir == null) return;
            if (string.IsNullOrEmpty(steamPath))
            { TxtInjectResult.Text = "[ERROR] Steam path not set. Go to Settings → Auto-Detect."; return; }

            if (SteamService.IsSteamRunning() &&
                MessageBox.Show("Steam is running. Changes apply after restart.\n\nContinue?",
                    "Steam Running", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

            var (ok, msg) = SteamService.InjectViaLuaTools(steamPath, appId, name, luaDir);
            TxtInjectResult.Text = msg;
            foreach (var line in msg.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                Log(line);
            if (ok) RefreshStatus();
        }
        catch (Exception ex)
        {
            TxtInjectResult.Text = $"[ERROR] {ex.Message}";
            Log($"[ERROR] LuaToolsSingle: {ex.Message}");
        }
    }

    // ── Lua page ──────────────────────────────────────────────────────────────

    private void BtnBrowseLuaDir2_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtLuaDir.Text = d; }

    private void BtnGenLua_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (!int.TryParse(TxtLuaAppId.Text.Trim(), out var appId) || appId <= 0)
            { TxtLuaPreview.Text = "[ERROR] Invalid AppID."; return; }
            var name = TxtLuaName.Text.Trim();
            if (string.IsNullOrEmpty(name)) { TxtLuaPreview.Text = "[ERROR] Game name required."; return; }

            List<int>? depots = null;
            if (!string.IsNullOrWhiteSpace(TxtLuaDepots.Text))
                depots = TxtLuaDepots.Text.Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(s => s.Trim()).Where(s => int.TryParse(s, out _)).Select(int.Parse).ToList();

            var lua = SteamService.GenerateLua(appId, name, depots);
            TxtLuaPreview.Text = lua;

            var dir = TxtLuaDir.Text.Trim();
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
                var path = Path.Combine(dir, $"{appId}.lua");
                File.WriteAllText(path, lua);
                Log($"[LUA] Written: {path}");
            }
        }
        catch (Exception ex) { TxtLuaPreview.Text = $"[ERROR] {ex.Message}"; Log($"[ERROR] GenLua: {ex.Message}"); }
    }

    // ── Depot page ────────────────────────────────────────────────────────────

    private void BtnInjectDepot_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (!int.TryParse(TxtDepotAppId.Text.Trim(), out var appId) || appId <= 0)
            { TxtDepotResult.Text = "[ERROR] Invalid AppID."; return; }
            var name = TxtDepotName.Text.Trim();
            if (string.IsNullOrEmpty(name)) { TxtDepotResult.Text = "[ERROR] Game name required."; return; }
            var lib = CmbDepotLibrary.SelectedItem?.ToString();
            if (string.IsNullOrEmpty(lib)) { TxtDepotResult.Text = "[ERROR] No library folder. Refresh or set Steam path."; return; }

            var depots = new List<(int, string)>();
            foreach (var line in TxtDepots.Text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Trim().Split('=');
                if (parts.Length == 2 && int.TryParse(parts[0].Trim(), out var did))
                    depots.Add((did, parts[1].Trim()));
            }

            var buildId = string.IsNullOrWhiteSpace(TxtBuildId.Text) ? "0" : TxtBuildId.Text.Trim();

            if (SteamService.IsSteamRunning() &&
                MessageBox.Show("Steam is running — manifest changes won't apply until Steam restarts.\n\nContinue?",
                    "Steam Running", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

            var (ok, msg) = SteamService.InjectManifest(lib, appId, name,
                stateFlags: 4, buildId: buildId, depots: depots.Count > 0 ? depots : null);
            TxtDepotResult.Text = msg;
            Log(msg);
            if (ok) RefreshStatus();
        }
        catch (Exception ex)
        {
            TxtDepotResult.Text = $"[ERROR] {ex.Message}";
            Log($"[ERROR] InjectDepot: {ex.Message}");
        }
    }

    // ── Batch page ────────────────────────────────────────────────────────────

    private void BtnBatchInject_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var selected = _allGames.Where(g => g.IsSelected).ToList();
            if (!selected.Any())
            {
                if (MessageBox.Show($"No games selected. Inject ALL {_allGames.Count} games?", "Confirm",
                    MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                selected = _allGames.ToList();
            }
            var lib = CmbBatchLibrary.SelectedItem?.ToString();
            if (string.IsNullOrEmpty(lib))
            { MessageBox.Show("No library folder selected.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }

            if (SteamService.IsSteamRunning() &&
                MessageBox.Show("Steam is running — injected manifests won't appear until Steam restarts.\n\nContinue?",
                    "Steam Running", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

            var genLua = ChkBatchLua.IsChecked == true;
            var luaDir = _settings.DefaultLuaDir;
            BtnBatchInject.IsEnabled = false;
            BatchProgress.Value = 0;

            Task.Run(() =>
            {
                int ok = 0, fail = 0, total = selected.Count;
                for (int i = 0; i < total; i++)
                {
                    var g = selected[i];
                    try
                    {
                        var (success, msg) = SteamService.InjectManifest(lib, g.AppId, g.Name, genLua, luaDir);
                        if (success) { ok++; Dispatcher.Invoke(() => g.IsInjected = true); } else fail++;
                        Dispatcher.Invoke(() => { Log(msg); BatchProgress.Value = (double)(i + 1) / total * 100; });
                    }
                    catch (Exception ex)
                    {
                        fail++;
                        Dispatcher.Invoke(() => Log($"[ERROR] {g.Name}: {ex.Message}"));
                    }
                }
                Dispatcher.Invoke(() =>
                {
                    BtnBatchInject.IsEnabled = true;
                    RefreshStatus();
                    MessageBox.Show($"Batch done!\nInjected: {ok}   Failed: {fail}\n\nRestart Steam to see them.",
                        "Batch Complete", MessageBoxButton.OK, MessageBoxImage.Information);
                });
            });
        }
        catch (Exception ex) { Log($"[ERROR] BatchInject: {ex.Message}"); BtnBatchInject.IsEnabled = true; }
    }

    // ── Log page ──────────────────────────────────────────────────────────────

    private void BtnClearLog_Click(object sender, RoutedEventArgs e) => TxtLog.Clear();

    // ── Settings page ─────────────────────────────────────────────────────────

    private void BtnBrowseSteam_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtSteamPath.Text = d; }

    private void BtnBrowseDefaultLua_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtDefaultLuaDir.Text = d; }

    private void BtnBrowseLuaToolsDir_Click(object sender, RoutedEventArgs e)
    { var d = PickFolder(); if (d != null) TxtLuaToolsDir.Text = d; }

    private void BtnAutoDetect_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = SteamService.DetectSteamPath();
            if (!string.IsNullOrEmpty(path))
            {
                TxtSteamPath.Text = path;
                TxtSteamPathStatus.Text = $"✓ Detected: {path}";
                TxtSteamPathStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00,0xB8,0x94));

                // Auto-fill LuaTools dir
                var luaToolsCandidate = Path.Combine(path, "config", "stplug-in");
                if (string.IsNullOrEmpty(TxtLuaToolsDir.Text))
                    TxtLuaToolsDir.Text = luaToolsCandidate;

                Log($"[AUTO-DETECT] Steam found at: {path}");
            }
            else
            {
                TxtSteamPathStatus.Text = "✗ Could not auto-detect. Set path manually.";
                TxtSteamPathStatus.Foreground = new SolidColorBrush(Color.FromRgb(0xFF,0x47,0x57));
            }
        }
        catch (Exception ex) { Log($"[ERROR] AutoDetect: {ex.Message}"); }
    }

    private void BtnSaveSettings_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            SaveSettings();
            TxtSettingsStatus.Text = "✓ Settings saved.";
            TxtSettingsStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00,0xB8,0x94));
            Log("[SETTINGS] Saved.");
            RefreshStatus();
        }
        catch (Exception ex) { Log($"[ERROR] SaveSettings: {ex.Message}"); }
    }

    // ── LuaTools helpers ──────────────────────────────────────────────────────

    private string? ResolveLuaToolsDir()
    {
        var dir = TxtLuaToolsDir?.Text.Trim();

        // fallback: derive from Steam path
        if (string.IsNullOrEmpty(dir) && !string.IsNullOrEmpty(_settings.SteamPath))
            dir = Path.Combine(_settings.SteamPath, "config", "stplug-in");

        if (string.IsNullOrEmpty(dir))
        {
            MessageBox.Show(
                "LuaTools/Millennium scripts folder not set.\n\nGo to Settings and set or browse to your stplug-in folder\n(usually: Steam\\config\\stplug-in).",
                "LuaTools Folder Missing", MessageBoxButton.OK, MessageBoxImage.Warning);
            return null;
        }

        try { Directory.CreateDirectory(dir); }
        catch (Exception ex)
        {
            MessageBox.Show($"Cannot create LuaTools directory:\n{dir}\n\n{ex.Message}",
                "Directory Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return null;
        }
        return dir;
    }

    // ── Generic helpers ───────────────────────────────────────────────────────

    private SteamLibrary? GetDefaultLibrary() =>
        _libraries.Count == 0 ? null : _libraries[0];

    private int ParseStateFlags()
    {
        var text = (CmbStateFlags.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "4";
        return int.TryParse(text.Split(' ')[0], out var sf) ? sf : 4;
    }

    private static string? PickFolder()
    {
        using var dlg = new System.Windows.Forms.FolderBrowserDialog
        {
            Description         = "Select folder",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = true,
        };
        return dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK ? dlg.SelectedPath : null;
    }
}
