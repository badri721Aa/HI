@echo off
REM Attaches over USB to a headset that is running frida-server (rooted Quest).
REM Find the exact process name first with:  frida-ps -Ua
cd /d "%~dp0.."
set "PKG=Animal Company"
if not "%~1"=="" set "PKG=%~1"
where frida >nul 2>nul
if errorlevel 1 (
    echo [!] frida not found. Install Python 3 and run:  pip install frida-tools
    pause
    exit /b 1
)
frida -U -l dist\_agent.js -n "%PKG%"
pause
