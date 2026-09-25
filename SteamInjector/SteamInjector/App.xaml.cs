using System.Windows;

// Explicit aliases so WinForms implicit globals never shadow WPF types
using MessageBox = System.Windows.MessageBox;
using Application = System.Windows.Application;

namespace SteamInjector;

public partial class App : Application
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
