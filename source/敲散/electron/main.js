/* 敲散 · Electron 桌面壳
 * 使用：npm install  →  npm start
 * 打包：npm run dist （生成 Windows exe / mac dmg / linux AppImage）
 * 资源约定：把 src/index.html、styles.css、profile.js、app.js 放进本目录的 app/ 子目录，
 *          或者直接把单文件 QiaoSan.html 改名为 app/index.html。
 */
const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 480,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: '敲散 · 解压气泡',
    backgroundColor: '#08060f',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // 开发期按 F12 打开 DevTools
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });
  return win;
}

app.whenReady().then(() => {
  createWindow();
  // 全局快捷键：任何界面按 F5 重新载入
  globalShortcut.register('F5', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) w.reload();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
