# SteamInjector — Build Instructions

## Requirements
- Windows 10/11
- .NET 8 SDK: https://dotnet.microsoft.com/en-us/download/dotnet/8.0

## Build single .exe

```cmd
cd SteamInjector
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

Output: `SteamInjector\bin\Release\net8.0-windows\win-x64\publish\SteamInjector.exe`

## OR — just run without building

```cmd
cd SteamInjector
dotnet run
```

## Notes
- No Python, no batch files, no external dependencies at runtime
- The .exe includes the .NET runtime — works on any Windows machine
- Run as Administrator if Steam is in Program Files (needed for manifest write)
