// npx electron scripts/capture-lab.cjs <sortie.png> : exporte la planche face-lab en image.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1600, height: 900, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, '..', 'face-lab', 'index.html'));
  const size = await win.webContents.executeJavaScript('[document.querySelector("canvas").width, document.querySelector("canvas").height]');
  const url = await win.webContents.executeJavaScript('document.querySelector("canvas").toDataURL("image/png")');
  fs.writeFileSync(process.argv[process.argv.length - 1], Buffer.from(url.split(',')[1], 'base64'));
  console.log('ok', size.join('x'));
  app.quit();
});
