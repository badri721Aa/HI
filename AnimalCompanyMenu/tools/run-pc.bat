@echo off
REM Attaches the menu to the running PC game. Start Animal Company first and load fully into the game.
cd /d "%~dp0.."
where frida >nul 2>nul
if errorlevel 1 (
    echo [!] frida not found. Install Python 3 and run:  pip install frida-tools
    pause
    exit /b 1
)
if not exist "dist\_agent.js" (
    echo [!] dist\_agent.js is missing. Run:  npm install  and  npm run build
    pause
    exit /b 1
)
frida -l dist\_agent.js AnimalCompany.exe
pause
