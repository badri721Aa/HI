using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LuaToolsGui;
using LuaToolsGui.Models;

namespace LuaToolsGui.ViewModels;

public partial class FamousGamesViewModel : ObservableObject
{
    private readonly DownloadViewModel _download;
    private readonly List<SteamSearchResult> _all = FamousGames.All.ToList();

    [ObservableProperty]
    private string _searchText = "";

    public ObservableCollection<SteamSearchResult> FilteredGames { get; } = new();

    public FamousGamesViewModel(DownloadViewModel download)
    {
        _download = download;
        Refresh();
    }

    partial void OnSearchTextChanged(string value) => Refresh();

    private void Refresh()
    {
        FilteredGames.Clear();
        var q = SearchText.Trim();
        foreach (var g in _all)
            if (string.IsNullOrEmpty(q) || g.Name.Contains(q, StringComparison.OrdinalIgnoreCase))
                FilteredGames.Add(g);
    }

    [RelayCommand]
    private Task InstallAsync(SteamSearchResult game) => _download.ProtocolInstall(game.AppId);
}
