using System.Windows;

namespace SteamInjector;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (s, ex) =>
        {
            MessageBox.Show($"Unhandled error:\n{ex.Exception.Message}", "SteamInjector Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
            ex.Handled = true;
        };
    }
}
