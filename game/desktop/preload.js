// Exposes a tiny, safe Steam bridge to the game page (window.steam).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const info = ipcRenderer.sendSync('steam:info');
contextBridge.exposeInMainWorld('steam', {
  name: info.name,
  server: info.server,
  available: info.steam,
  unlock: (id) => ipcRenderer.invoke('steam:ach', id),
});
