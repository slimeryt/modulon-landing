'use strict';
const { app, BrowserWindow, shell, Menu, nativeTheme, protocol, net } = require('electron');
const path = require('path');
const fs   = require('fs');

const isDev = !app.isPackaged;

// Must be called before app is ready.
// Registers app:// as a privileged scheme so BrowserRouter (HTML5 history API)
// works exactly like http:// — file:// doesn't support it.
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

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

  if (!isDev) Menu.setApplicationMenu(null);

  if (isDev) {
    // Dev: Vite dev server handles routing; open directly on /chat
    win.loadURL('http://localhost:5181/chat');
  } else {
    // Prod: custom protocol serves dist/ as if it were http://
    win.loadURL('app://localhost/chat');
  }

  // Open external links in the system browser, never inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  if (!isDev) {
    const distDir = path.join(__dirname, '../dist');

    // Serve the built Vite app via app:// with SPA fallback
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);

      // Try the exact file first (assets, icons, manifest, etc.)
      const candidate = path.join(distDir, pathname);
      if (
        pathname !== '/' &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        return net.fetch(`file://${candidate}`);
      }

      // SPA fallback — let React Router handle the route
      return net.fetch(`file://${path.join(distDir, 'index.html')}`);
    });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
