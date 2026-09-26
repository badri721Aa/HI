using System.Windows;
using WpfApp       = System.Windows.Application;
using MessageBox   = System.Windows.MessageBox;

namespace SteamInjector;

public partial class App : WpfApp
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, ex) =>
        {
            MessageBox.Show(
                $"Unhandled error:\n{ex.Exception.Message}",
                "SteamInjector Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            ex.Handled = true;
        };
    }
}
