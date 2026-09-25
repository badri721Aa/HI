// Copies the web client + shared sim into desktop/app so electron-builder can package them.
const fs = require('fs');
const path = require('path');
const dest = path.join(__dirname, 'app');
fs.rmSync(dest, { recursive: true, force: true });
for (const dir of ['client', 'shared']) fs.cpSync(path.join(__dirname, '..', dir), path.join(dest, dir), { recursive: true });
console.log('copied game into', dest);
