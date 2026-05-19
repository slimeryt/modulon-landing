'use strict';
const { app, BrowserWindow, shell, Menu, nativeTheme } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  nativeTheme.themeSource = 'dark';

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    icon: path.join(__dirname, '../public/icon-512.png'),
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Remove default menu bar (keeps keyboard shortcuts like Ctrl+R working in dev)
  if (!isDev) Menu.setApplicationMenu(null);

  if (isDev) {
    win.loadURL('http://localhost:5181');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open all target="_blank" links in the system browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
