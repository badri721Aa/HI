using System.Windows;

namespace SteamInjector;

public partial class App : System.Windows.Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (s, ex) =>
        {
            System.Windows.MessageBox.Show($"Unhandled error:\n{ex.Exception.Message}", "SteamInjector Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
            ex.Handled = true;
        };
    }
}
