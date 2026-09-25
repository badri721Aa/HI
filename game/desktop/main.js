/*
 * Deep Waters — Electron shell for the Steam release.
 * Loads the same HTML5 client, adds Steam (name, achievements, overlay) via steamworks.js.
 * Runs fine without Steam too (e.g. for local testing).
 */
'use strict';
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let steam = null;
try {
  const candidates = [path.join(__dirname, 'steam_appid.txt'), path.join(process.resourcesPath || __dirname, '..', 'steam_appid.txt')];
  const file = candidates.find((f) => fs.existsSync(f));
  const appId = file ? +fs.readFileSync(file, 'utf8').trim() : 480; // 480 = Valve's "Spacewar" test app
  const steamworks = require('steamworks.js');
  steam = steamworks.init(appId);
  steamworks.electronEnableSteamOverlay();
  console.log('Steam ready for', steam.localplayer.getName());
} catch (e) {
  console.log('Steam not available, running standalone:', e.message);
}

const config = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; } })();

ipcMain.on('steam:info', (e) => {
  e.returnValue = { name: steam ? steam.localplayer.getName() : '', server: config.server || '', steam: !!steam };
});
ipcMain.handle('steam:ach', (e, id) => {
  if (!steam || typeof id !== 'string' || id.length > 40) return false;
  try { return steam.achievement.activate(id.toUpperCase()); } catch { return false; }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#06121f', title: 'Deep Waters', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  const packaged = path.join(__dirname, 'app', 'client', 'index.html');
  win.loadFile(fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', 'client', 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') win.setFullScreen(!win.isFullScreen());
  });
  // Block navigation away from the game and external windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
