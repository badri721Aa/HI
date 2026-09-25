using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

namespace SteamInjector;

public class GameViewModel : System.ComponentModel.INotifyPropertyChanged
{
    public int AppId { get; set; }
    public string Name { get; set; } = "";
    public string Genre { get; set; } = "";
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
    public string SteamPath { get; set; } = "";
    public string DefaultLuaDir { get; set; } = "";
}

public partial class MainWindow : Window
{
    private static readonly string SettingsFile =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "SteamInjector", "settings.json");

    private AppSettings _settings = new();
    private List<SteamLibrary> _libraries = [];
    private ObservableCollection<GameViewModel> _allGames = [];
    private ObservableCollection<GameViewModel> _filteredGames = [];
    private ObservableCollection<GameViewModel> _batchGames = [];
    private readonly DispatcherTimer _statusTimer = new();
    private string _activeNavTag = "Dashboard";

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

        ChkGenerateLua.Checked += (_, _) => PanelLuaOutput.Visibility = Visibility.Visible;
        ChkGenerateLua.Unchecked += (_, _) => PanelLuaOutput.Visibility = Visibility.Collapsed;

        TxtVersion.Text = "v1.0.0 — " + SteamService.GetBuiltInGames().Count + " games";
    }

    private void LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsFile))
            {
                var json = File.ReadAllText(SettingsFile);
                _settings = JsonSerializer.Deserialize<AppSettings>(json) ?? new();
            }
        }
        catch { _settings = new(); }

        if (string.IsNullOrEmpty(_settings.SteamPath))
            _settings.SteamPath = SteamService.DetectSteamPath() ?? "";

        if (string.IsNullOrEmpty(_settings.DefaultLuaDir))
            _settings.DefaultLuaDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                "SteamInjector", "lua");

        TxtSteamPath.Text = _settings.SteamPath;
        TxtDefaultLuaDir.Text = _settings.DefaultLuaDir;
        TxtLuaDir.Text = _settings.DefaultLuaDir;
        TxtLuaOutDir.Text = _settings.DefaultLuaDir;
    }

    private void SaveSettings()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile)!);
            _settings.SteamPath = TxtSteamPath.Text.Trim();
            _settings.DefaultLuaDir = TxtDefaultLuaDir.Text.Trim();
            var json = JsonSerializer.Serialize(_settings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFile, json);
        }
        catch (Exception ex) { Log($"[ERROR] Save settings: {ex.Message}"); }
    }

    private void BuildGameLists()
    {
        var raw = SteamService.GetBuiltInGames();
        var seen = new HashSet<int>();
        _allGames.Clear();
        foreach (var g in raw)
        {
            if (g.AppId == 0) continue;
            if (!seen.Add(g.AppId)) continue;
            _allGames.Add(new GameViewModel
            {
                AppId = g.AppId,
                Name = g.Name,
                Genre = g.Genre,
                Developer = g.Developer
            });
        }
        _filteredGames = new ObservableCollection<GameViewModel>(_allGames);
        _batchGames = new ObservableCollection<GameViewModel>(_allGames);
        StatGames.Text = _allGames.Count.ToString();
    }

    private void PopulateGenreFilter()
    {
        var genres = _allGames.Select(g => g.Genre).Distinct().OrderBy(x => x).ToList();
        CmbGenre.Items.Clear();
        CmbGenre.Items.Add(new ComboBoxItem { Content = "All Genres", IsSelected = true });
        foreach (var g in genres)
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
        var search = TxtSearch.Text.Trim().ToLowerInvariant();
        var genre = (CmbGenre.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "All Genres";
        var selectedOnly = ChkSelectedOnly.IsChecked == true;

        var filtered = _allGames.Where(g =>
        {
            var matchSearch = string.IsNullOrEmpty(search) ||
                g.Name.ToLowerInvariant().Contains(search) ||
                g.AppId.ToString().Contains(search) ||
                g.Developer.ToLowerInvariant().Contains(search);
            var matchGenre = genre == "All Genres" || g.Genre == genre;
            var matchSelected = !selectedOnly || g.IsSelected;
            return matchSearch && matchGenre && matchSelected;
        }).ToList();

        _filteredGames.Clear();
        foreach (var g in filtered) _filteredGames.Add(g);
        TxtGameCount.Text = $"{_filteredGames.Count} games";
        UpdateSelectedCount();
    }

    private void UpdateSelectedCount()
    {
        var n = _allGames.Count(g => g.IsSelected);
        TxtSelected.Text = $"{n} selected";
    }

    private void RefreshStatus()
    {
        _settings.SteamPath = TxtSteamPath.Text.Trim();
        if (string.IsNullOrEmpty(_settings.SteamPath))
            _settings.SteamPath = SteamService.DetectSteamPath() ?? "";

        _libraries = SteamService.GetAllLibraryFolders(_settings.SteamPath);

        ListLibs.Items.Clear();
        foreach (var lib in _libraries)
            ListLibs.Items.Add(lib.Label);

        foreach (var combo in new[] { CmbInjectLibrary, CmbDepotLibrary, CmbBatchLibrary })
        {
            combo.Items.Clear();
            foreach (var lib in _libraries)
                combo.Items.Add(lib.Path);
            if (combo.Items.Count > 0) combo.SelectedIndex = 0;
        }

        TxtSteamPathDash.Text = $"Steam Path: {(string.IsNullOrEmpty(_settings.SteamPath) ? "(not detected)" : _settings.SteamPath)}";
        StatLibs.Text = _libraries.Count.ToString();

        var injected = _libraries.Sum(lib =>
        {
            try { return Directory.GetFiles(lib.Path, "appmanifest_*.acf").Length; }
            catch { return 0; }
        });
        StatInjected.Text = injected.ToString();

        foreach (var g in _allGames)
            g.IsInjected = _libraries.Any(lib => SteamService.AcfExists(lib.Path, g.AppId));

        UpdateSteamRunningBadge();
    }

    private void UpdateSteamRunningBadge()
    {
        Dispatcher.Invoke(() =>
        {
            var running = SteamService.IsSteamRunning();
            SteamDot.Fill = new SolidColorBrush(running ? Color.FromRgb(0x00, 0xB8, 0x94) : Color.FromRgb(0xFF, 0x47, 0x57));
            TxtSteamStatus.Text = running ? "Running" : "Not Running";
            StatStatus.Text = running ? "ONLINE" : "OFFLINE";
            StatStatus.Foreground = new SolidColorBrush(running ? Color.FromRgb(0x00, 0xB8, 0x94) : Color.FromRgb(0xFF, 0x47, 0x57));
        });
    }

    private void Log(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
        Dispatcher.Invoke(() =>
        {
            TxtLog.AppendText(line + "\n");
            LogScroller.ScrollToBottom();
        });
    }

    private void Nav_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn) return;
        ShowPage(btn.Tag?.ToString() ?? "Dashboard");
    }

    private void ShowPage(string tag)
    {
        _activeNavTag = tag;
        PageDashboard.Visibility = PageGames.Visibility = PageInject.Visibility = Visibility.Collapsed;
        PageLua.Visibility = PageDepot.Visibility = PageBatch.Visibility = Visibility.Collapsed;
        PageLog.Visibility = PageSettings.Visibility = Visibility.Collapsed;

        foreach (var b in new[] { BtnNavDash, BtnNavGames, BtnNavInject, BtnNavLua, BtnNavDepot, BtnNavBatch, BtnNavLog, BtnNavSettings })
            b.Style = (Style)FindResource("NavBtn");

        switch (tag)
        {
            case "Dashboard": PageDashboard.Visibility = Visibility.Visible; BtnNavDash.Style = (Style)FindResource("NavBtnActive"); RefreshStatus(); break;
            case "Games": PageGames.Visibility = Visibility.Visible; BtnNavGames.Style = (Style)FindResource("NavBtnActive"); break;
            case "Inject": PageInject.Visibility = Visibility.Visible; BtnNavInject.Style = (Style)FindResource("NavBtnActive"); break;
            case "Lua": PageLua.Visibility = Visibility.Visible; BtnNavLua.Style = (Style)FindResource("NavBtnActive"); break;
            case "Depot": PageDepot.Visibility = Visibility.Visible; BtnNavDepot.Style = (Style)FindResource("NavBtnActive"); break;
            case "Batch": PageBatch.Visibility = Visibility.Visible; BtnNavBatch.Style = (Style)FindResource("NavBtnActive"); SyncBatchList(); break;
            case "Log": PageLog.Visibility = Visibility.Visible; BtnNavLog.Style = (Style)FindResource("NavBtnActive"); break;
            case "Settings": PageSettings.Visibility = Visibility.Visible; BtnNavSettings.Style = (Style)FindResource("NavBtnActive"); break;
        }
    }

    private void SyncBatchList() { _batchGames.Clear(); foreach (var g in _allGames) _batchGames.Add(g); }

    private void BtnRefresh_Click(object sender, RoutedEventArgs e) => RefreshStatus();

    private void BtnStartSteam_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_settings.SteamPath)) { MessageBox.Show("Steam path not set.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        Log("Starting Steam...");
        SteamService.StartSteam(_settings.SteamPath);
        Task.Delay(2000).ContinueWith(_ => UpdateSteamRunningBadge());
    }

    private void BtnKillSteam_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Kill Steam process?", "Confirm", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        Log("Killing Steam..."); SteamService.KillSteam();
        Task.Delay(2000).ContinueWith(_ => UpdateSteamRunningBadge());
    }

    private void BtnRestartSteam_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_settings.SteamPath)) { MessageBox.Show("Steam path not set.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        if (MessageBox.Show("Restart Steam?", "Confirm", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        Log("Restarting Steam...");
        Task.Run(() => { SteamService.RestartSteam(_settings.SteamPath); Dispatcher.Invoke(() => UpdateSteamRunningBadge()); });
    }

    private void TxtSearch_TextChanged(object sender, TextChangedEventArgs e) => ApplyFilter();
    private void CmbGenre_SelectionChanged(object sender, SelectionChangedEventArgs e) => ApplyFilter();
    private void ChkSelectedOnly_Changed(object sender, RoutedEventArgs e) => ApplyFilter();
    private void BtnSelectAll_Click(object sender, RoutedEventArgs e) { foreach (var g in _filteredGames) g.IsSelected = true; UpdateSelectedCount(); }
    private void BtnClearAll_Click(object sender, RoutedEventArgs e) { foreach (var g in _allGames) g.IsSelected = false; UpdateSelectedCount(); }

    private void BtnInjectSelected_Click(object sender, RoutedEventArgs e)
    {
        var selected = _allGames.Where(g => g.IsSelected).ToList();
        if (!selected.Any()) { MessageBox.Show("No games selected.", "Info", MessageBoxButton.OK, MessageBoxImage.Information); return; }
        var lib = GetDefaultLibrary();
        if (lib == null) { MessageBox.Show("No Steam library found. Check Settings.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        int ok = 0, fail = 0;
        foreach (var g in selected)
        {
            var (success, msg) = SteamService.InjectManifest(lib.Path, g.AppId, g.Name);
            if (success) { ok++; g.IsInjected = true; } else fail++;
            Log(msg);
        }
        RefreshStatus();
        MessageBox.Show($"Done! Injected: {ok}  Failed: {fail}\n\nRestart Steam to see them in your library.", "Inject Complete", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void BtnRemoveSelected_Click(object sender, RoutedEventArgs e)
    {
        var selected = _allGames.Where(g => g.IsSelected).ToList();
        if (!selected.Any()) return;
        var lib = GetDefaultLibrary(); if (lib == null) return;
        if (MessageBox.Show($"Remove {selected.Count} manifests from {lib.Path}?", "Confirm Remove", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        foreach (var g in selected) { var removed = SteamService.RemoveManifest(lib.Path, g.AppId); Log($"[{(removed ? "REMOVED" : "NOT FOUND")}] appmanifest_{g.AppId}.acf"); if (removed) g.IsInjected = false; }
        RefreshStatus();
    }

    private void BtnBrowseLuaDir_Click(object sender, RoutedEventArgs e) { var d = PickFolder(); if (d != null) TxtLuaOutDir.Text = d; }

    private void BtnInjectNow_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(TxtInjectAppId.Text.Trim(), out var appId) || appId <= 0) { TxtInjectResult.Text = "[ERROR] Invalid AppID."; return; }
        var name = TxtInjectName.Text.Trim(); if (string.IsNullOrEmpty(name)) { TxtInjectResult.Text = "[ERROR] Game name required."; return; }
        var lib = CmbInjectLibrary.SelectedItem?.ToString(); if (string.IsNullOrEmpty(lib)) { TxtInjectResult.Text = "[ERROR] No library folder selected."; return; }
        var flagStr = (CmbStateFlags.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "4";
        var stateFlags = int.Parse(flagStr.Split(' ')[0]);
        var (ok, msg) = SteamService.InjectManifest(lib, appId, name, ChkGenerateLua.IsChecked == true, TxtLuaOutDir.Text.Trim(), stateFlags);
        TxtInjectResult.Text = msg; Log(msg); if (ok) RefreshStatus();
    }

    private void BtnBrowseLuaDir2_Click(object sender, RoutedEventArgs e) { var d = PickFolder(); if (d != null) TxtLuaDir.Text = d; }

    private void BtnGenLua_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(TxtLuaAppId.Text.Trim(), out var appId) || appId <= 0) { TxtLuaPreview.Text = "[ERROR] Invalid AppID."; return; }
        var name = TxtLuaName.Text.Trim(); if (string.IsNullOrEmpty(name)) { TxtLuaPreview.Text = "[ERROR] Game name required."; return; }
        List<int>? depots = null;
        if (!string.IsNullOrWhiteSpace(TxtLuaDepots.Text))
            depots = TxtLuaDepots.Text.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).Where(s => int.TryParse(s, out _)).Select(int.Parse).ToList();
        var lua = SteamService.GenerateLua(appId, name, depots);
        TxtLuaPreview.Text = lua;
        var dir = TxtLuaDir.Text.Trim();
        if (!string.IsNullOrEmpty(dir))
        {
            try { Directory.CreateDirectory(dir); File.WriteAllText(Path.Combine(dir, $"{appId}.lua"), lua); Log($"[LUA] Written: {Path.Combine(dir, appId + ".lua")}"); }
            catch (Exception ex) { Log($"[ERROR] Lua write: {ex.Message}"); }
        }
    }

    private void BtnInjectDepot_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(TxtDepotAppId.Text.Trim(), out var appId) || appId <= 0) { TxtDepotResult.Text = "[ERROR] Invalid AppID."; return; }
        var name = TxtDepotName.Text.Trim(); if (string.IsNullOrEmpty(name)) { TxtDepotResult.Text = "[ERROR] Game name required."; return; }
        var lib = CmbDepotLibrary.SelectedItem?.ToString(); if (string.IsNullOrEmpty(lib)) { TxtDepotResult.Text = "[ERROR] No library folder."; return; }
        var depots = new List<(int, string)>();
        foreach (var line in TxtDepots.Text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.Trim().Split('=');
            if (parts.Length == 2 && int.TryParse(parts[0].Trim(), out var did)) depots.Add((did, parts[1].Trim()));
        }
        var buildId = string.IsNullOrEmpty(TxtBuildId.Text.Trim()) ? "0" : TxtBuildId.Text.Trim();
        var (ok, msg) = SteamService.InjectManifest(lib, appId, name, stateFlags: 4, buildId: buildId, depots: depots.Count > 0 ? depots : null);
        TxtDepotResult.Text = msg; Log(msg); if (ok) RefreshStatus();
    }

    private void BtnBatchInject_Click(object sender, RoutedEventArgs e)
    {
        var selected = _allGames.Where(g => g.IsSelected).ToList();
        if (!selected.Any())
        {
            if (MessageBox.Show($"No games selected. Inject ALL {_allGames.Count} games?", "Confirm", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            selected = _allGames.ToList();
        }
        var lib = CmbBatchLibrary.SelectedItem?.ToString();
        if (string.IsNullOrEmpty(lib)) { MessageBox.Show("No library folder selected.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        var genLua = ChkBatchLua.IsChecked == true;
        var luaDir = _settings.DefaultLuaDir;
        BtnBatchInject.IsEnabled = false; BatchProgress.Value = 0;
        Task.Run(() =>
        {
            int ok = 0, fail = 0, total = selected.Count;
            for (int i = 0; i < total; i++)
            {
                var g = selected[i];
                var (success, msg) = SteamService.InjectManifest(lib, g.AppId, g.Name, genLua, luaDir);
                if (success) { ok++; Dispatcher.Invoke(() => g.IsInjected = true); } else fail++;
                Dispatcher.Invoke(() => { Log(msg); BatchProgress.Value = (double)(i + 1) / total * 100; });
            }
            Dispatcher.Invoke(() =>
            {
                BtnBatchInject.IsEnabled = true; RefreshStatus();
                MessageBox.Show($"Batch done!\nInjected: {ok}  Failed: {fail}\n\nRestart Steam to see them.", "Batch Inject Complete", MessageBoxButton.OK, MessageBoxImage.Information);
            });
        });
    }

    private void BtnClearLog_Click(object sender, RoutedEventArgs e) => TxtLog.Clear();

    private void BtnBrowseSteam_Click(object sender, RoutedEventArgs e) { var d = PickFolder(); if (d != null) TxtSteamPath.Text = d; }

    private void BtnAutoDetect_Click(object sender, RoutedEventArgs e)
    {
        var path = SteamService.DetectSteamPath();
        if (!string.IsNullOrEmpty(path))
        {
            TxtSteamPath.Text = path;
            TxtSteamPathStatus.Text = $"✓ Detected: {path}";
            TxtSteamPathStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00, 0xB8, 0x94));
            Log($"[AUTO-DETECT] Steam found at: {path}");
        }
        else
        {
            TxtSteamPathStatus.Text = "✗ Could not auto-detect. Set path manually.";
            TxtSteamPathStatus.Foreground = new SolidColorBrush(Color.FromRgb(0xFF, 0x47, 0x57));
        }
    }

    private void BtnBrowseDefaultLua_Click(object sender, RoutedEventArgs e) { var d = PickFolder(); if (d != null) TxtDefaultLuaDir.Text = d; }

    private void BtnSaveSettings_Click(object sender, RoutedEventArgs e)
    {
        SaveSettings(); _settings.SteamPath = TxtSteamPath.Text.Trim();
        TxtSettingsStatus.Text = "✓ Settings saved.";
        TxtSettingsStatus.Foreground = new SolidColorBrush(Color.FromRgb(0x00, 0xB8, 0x94));
        Log("[SETTINGS] Saved."); RefreshStatus();
    }

    private SteamLibrary? GetDefaultLibrary() => _libraries.Count == 0 ? null : _libraries[0];

    private static string? PickFolder()
    {
        using var dlg = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "Select folder",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = true,
        };
        return dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK ? dlg.SelectedPath : null;
    }
}
