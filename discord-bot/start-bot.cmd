@echo off
rem Runs the Discord bot in this window and starts it again whenever it stops.
rem Started by the DiscordBot task in Task Scheduler, see README.md.
rem Don't double-click this file while the DiscordBot task is on; use Start-ScheduledTask -TaskName "DiscordBot".
rem Restart the bot: click this window's title bar, press Ctrl+C, answer N.
title Discord Bot - keep this window open, minimize it
cd /d "%~dp0"
rem Full path to node.exe. If Node.js is installed somewhere else, change this line.
set "NODE_EXE=E:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
:loop
echo.
echo Keep this window open. Minimize it, do not click inside it.
echo Restart the bot: press Ctrl+C, then type N and press Enter.
echo [%date% %time%] Starting the bot...
call "%NODE_EXE%" src\index.js
if "%errorlevel%"=="9009" echo Node.js was not found. Install Node.js 22.12 or newer, or put the full path to node.exe in the NODE_EXE line of start-bot.cmd.
echo [%date% %time%] The bot stopped with exit code %errorlevel%. Restarting in 15 seconds...
timeout /t 15 /nobreak >nul
goto loop
