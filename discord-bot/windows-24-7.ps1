# Runs the bot 24/7 on this Windows PC: hidden, starts when you log in, restarts after crashes.
# A switched-off PC can't run anything; for that you need a cloud server (see README).
#
# Run it from the discord-bot folder:   powershell -ExecutionPolicy Bypass -File .\windows-24-7.ps1
# or paste the whole file into PowerShell wrapped in  & { ... }
# Afterwards manage the bot with:       powershell -ExecutionPolicy Bypass -File .\bot-control.ps1 status|stop|start|uninstall
#
# Windows PowerShell 5.1 or PowerShell 7. No administrator rights needed. ASCII only on purpose.

$TaskName = 'MegaDiscordBot'
function Say($text, $color = 'Cyan') { Write-Host $text -ForegroundColor $color }

# ---- find the bot folder: this folder, a "discord-bot" subfolder, or the newest unzipped copy in Downloads
$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$candidates = @($here, (Join-Path $here 'discord-bot'))
$candidates += @(Get-ChildItem -LiteralPath (Join-Path $HOME 'Downloads') -Directory -Filter 'mega-discord-bot*' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | ForEach-Object { Join-Path $_.FullName 'discord-bot' })
$bot = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'src\index.js') } | Select-Object -First 1
if (-not $bot) { Say 'Could not find the bot. Open PowerShell in the unzipped "discord-bot" folder and run this again.' 'Red'; return }
Set-Location -LiteralPath $bot
$log = Join-Path $bot 'data\bot.log'
$utf8 = New-Object System.Text.UTF8Encoding($false)
Say "Bot folder: $bot"

# ---- 1. Node.js 22.12 or newer
function Get-NodeVersion {
    try { $out = & node -v 2>$null; [version](($out | Select-Object -First 1) -replace '^v', '') } catch { $null }
}
$nodeVersion = Get-NodeVersion
if (-not $nodeVersion -or $nodeVersion -lt [version]'22.12.0') {
    $found = if ($nodeVersion) { "$nodeVersion" } else { 'none' }
    Say "Node.js 22.12+ is needed (found: $found). Installing Node.js LTS with winget..." 'Yellow'
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Say 'winget is not available. Install Node.js LTS from https://nodejs.org and run this again.' 'Red'; return }
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $nodeVersion = Get-NodeVersion
    if (-not $nodeVersion -or $nodeVersion -lt [version]'22.12.0') { Say 'Node.js is still missing or too old. Close PowerShell, open a new window and run this again.' 'Red'; return }
}
$nodeDir = Split-Path -Parent (Get-Command node).Source
Say "Node.js $nodeVersion OK ($nodeDir)" 'Green'

# ---- 2. Bot token -> .env
$envFile = Join-Path $bot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { Copy-Item -LiteralPath (Join-Path $bot '.env.example') -Destination $envFile }
$lines = @([IO.File]::ReadAllLines($envFile))
$hasToken = [bool]($lines | Where-Object { $_ -match '^\s*DISCORD_TOKEN=\S+' })
$prompt = if ($hasToken) { 'Paste a NEW bot token, or just press Enter to keep the saved one' } else { 'Paste your bot token (Developer Portal > your app > Bot > Reset Token), then press Enter' }
$secure = Read-Host $prompt -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) + '').Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($token) {
    if ($token -notmatch '^[\w-]+\.[\w-]+\.[\w-]+$') { Say 'That does not look like a bot token (it normally has two dots). Saving it anyway.' 'Yellow' }
    $replaced = $false
    $lines = @(foreach ($l in $lines) {
            if ($l -match '^\s*DISCORD_TOKEN=') { if (-not $replaced) { $replaced = $true; "DISCORD_TOKEN=$token" } }
            else { $l }
        })
    if (-not $replaced) { $lines += "DISCORD_TOKEN=$token" }
    [IO.File]::WriteAllLines($envFile, [string[]]$lines, $utf8)
    Say 'Token saved in .env' 'Green'
}
elseif (-not $hasToken) { Say 'No token entered. Run this again and paste your token.' 'Red'; return }

# ---- 3. Dependencies (npm.cmd sidesteps PowerShell's "running scripts is disabled" block on npm.ps1)
Say 'Installing dependencies (about a minute)...'
& npm.cmd install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Say 'npm install failed (see above). Check your internet connection and run this again.' 'Red'; return }

# ---- 4. Helper scripts written next to the bot
# run-forever.ps1: restarts the bot whenever it stops (waits longer each time if it keeps crashing).
$runnerCode = @'
# Started hidden at logon. Restarts the bot whenever it stops. Created by windows-24-7.ps1.
$env:Path = '__NODE_DIR__;' + $env:Path
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'data') | Out-Null
$log = Join-Path $PSScriptRoot 'data\bot.log'
$wait = 5
while ($true) {
    if ((Test-Path -LiteralPath $log) -and ((Get-Item -LiteralPath $log).Length -gt 5MB)) { Move-Item -LiteralPath $log -Destination "$log.old" -Force }
    $started = Get-Date
    cmd.exe /c "node src\index.js >> data\bot.log 2>&1"
    if (((Get-Date) - $started).TotalMinutes -ge 5) { $wait = 5 } else { $wait = [Math]::Min($wait * 2, 300) }
    Add-Content -LiteralPath $log -Value "[runner] $(Get-Date -Format s) bot stopped, restarting in $wait seconds"
    Start-Sleep -Seconds $wait
}
'@
$runner = Join-Path $bot 'run-forever.ps1'
[IO.File]::WriteAllText($runner, $runnerCode.Replace('__NODE_DIR__', $nodeDir.Replace("'", "''")), $utf8)

# bot-control.ps1: status / stop / start / uninstall.
$controlCode = @'
# Manage the 24/7 bot. Created by windows-24-7.ps1.
#   powershell -ExecutionPolicy Bypass -File .\bot-control.ps1 status|stop|start|uninstall
param([ValidateSet('status', 'stop', 'start', 'uninstall')][string]$Action = 'status')
$TaskName = 'MegaDiscordBot'
$log = Join-Path $PSScriptRoot 'data\bot.log'
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'MegaDiscordBot.lnk'
function Stop-Bot {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { ($_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*run-forever.ps1*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*src\index.js*') } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
switch ($Action) {
    'status' {
        $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*src\index.js*' }
        if ($running) { Write-Host 'The bot is RUNNING.' -ForegroundColor Green } else { Write-Host 'The bot is NOT running.' -ForegroundColor Yellow }
        if (Test-Path -LiteralPath $log) { Write-Host "`nLast log lines:"; Get-Content -LiteralPath $log -Tail 15 -Encoding UTF8 }
    }
    'stop' { Stop-Bot; Write-Host 'Bot stopped. It starts again when you log in, or run: bot-control.ps1 start' }
    'start' {
        Stop-Bot
        if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName $TaskName }
        else { Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $PSScriptRoot -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"' + (Join-Path $PSScriptRoot 'run-forever.ps1') + '"') }
        Write-Host 'Bot started.' -ForegroundColor Green
    }
    'uninstall' {
        Stop-Bot
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $lnk -ErrorAction SilentlyContinue
        Write-Host 'The bot will no longer start with Windows. Your files and data were kept.'
    }
}
'@
$control = Join-Path $bot 'bot-control.ps1'
[IO.File]::WriteAllText($control, $controlCode, $utf8)

# ---- 5. Start with Windows: scheduled task at logon, or a Startup-folder shortcut if tasks aren't allowed
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $control stop | Out-Null
$psArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`""
$registered = $false
try {
    $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs -WorkingDirectory $bot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger -Settings $settings -Description 'Keeps the Discord bot running' -Force -ErrorAction Stop | Out-Null
    $registered = $true
    Say 'Auto-start: scheduled task "MegaDiscordBot" (runs when you log in).' 'Green'
}
catch {
    $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'MegaDiscordBot.lnk'
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $shortcut.TargetPath = 'powershell.exe'
    $shortcut.Arguments = $psArgs
    $shortcut.WorkingDirectory = $bot
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Say 'Auto-start: shortcut in your Startup folder (runs when you log in).' 'Green'
}

# Remember where the log ends now, so only this run's output is checked below.
$logStart = 0
if (Test-Path -LiteralPath $log) { $logStart = (Get-Item -LiteralPath $log).Length }
if ($registered) { Start-ScheduledTask -TaskName $TaskName }
else { Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $bot -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$runner`"" }

# ---- 6. Keep the PC awake while plugged in (a sleeping PC takes the bot offline)
powercfg /change standby-timeout-ac 0 2>$null
if ($LASTEXITCODE -eq 0) { Say 'Sleep while plugged in is now off (undo: powercfg /change standby-timeout-ac 30).' }

# ---- 7. Wait for the bot to log in and report
function Read-NewLog($from) {
    if (-not (Test-Path -LiteralPath $log)) { return '' }
    $fs = [IO.File]::Open($log, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
        if ($fs.Length -lt $from) { $from = 0 }
        [void]$fs.Seek($from, [IO.SeekOrigin]::Begin)
        (New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)).ReadToEnd()
    }
    finally { $fs.Dispose() }
}
Say 'Starting the bot (up to a minute)...'
$deadline = (Get-Date).AddSeconds(60)
$result = ''
$intents = $false
while ((Get-Date) -lt $deadline -and -not $result) {
    Start-Sleep -Seconds 3
    $text = Read-NewLog $logStart
    if ($text -match 'privileged intent') { $intents = $true }
    if ($text -match 'Logged in as (.+?) \S+ \d+ servers') { $result = "ONLINE as $($Matches[1])" }
    elseif ($text -match 'invalid token|TokenInvalid') { $result = 'BAD TOKEN' }
}
if ($result -eq 'BAD TOKEN') { Say "`nDiscord rejected the token. Reset it in the Developer Portal (Bot > Reset Token) and run this again." 'Red' }
elseif ($result) { Say "`nDONE - the bot is $result. Type !help in your server." 'Green' }
else { Say "`nNo login confirmation yet. Check in a minute with:  powershell -ExecutionPolicy Bypass -File `"$control`" status" 'Yellow' }
if ($intents) { Say "For ! commands, turn ON 'Server Members Intent' and 'Message Content Intent' (Developer Portal > Bot), then run: bot-control.ps1 start" 'Yellow' }

Say @"

It runs hidden in the background, starts when you log in, and restarts itself if it crashes.
It runs while this PC is on (a switched-off PC can't run anything).
  Status: powershell -ExecutionPolicy Bypass -File "$control" status
  Logs:   Get-Content "$log" -Tail 30 -Wait -Encoding UTF8
  Stop:   powershell -ExecutionPolicy Bypass -File "$control" stop
  Start:  powershell -ExecutionPolicy Bypass -File "$control" start
  Remove: powershell -ExecutionPolicy Bypass -File "$control" uninstall
"@
