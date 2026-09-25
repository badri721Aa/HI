@echo off
cd /d "%~dp0"
where pythonw >nul 2>&1
if %errorlevel% == 0 (
    start "" pythonw "%~dp0src\main.py"
) else (
    start "" pythonw.exe "%~dp0src\main.py" 2>nul
    if %errorlevel% neq 0 (
        start "" python "%~dp0src\main.py"
    )
)
