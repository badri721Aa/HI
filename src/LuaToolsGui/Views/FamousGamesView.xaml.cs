using System.Windows.Controls;
using LuaToolsGui.ViewModels;

namespace LuaToolsGui.Views;

public partial class FamousGamesView : Page
{
    public FamousGamesView(FamousGamesViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
    }
}
