'use strict';
// Load .env so VITE_PUBLIC_SITE_URL is available in the main process
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { app, BrowserWindow, shell, Menu, nativeTheme, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

const isDev = !app.isPackaged;

// Deployed website URL — needed to open /desktop/login in the system browser.
// Set VITE_PUBLIC_SITE_URL=https://your-site.com in your .env file.
const SITE_URL = (process.env.VITE_PUBLIC_SITE_URL || 'https://www.modulon.xyz').replace(/\/$/, '');

// ── Custom protocol: modulon:// ───────────────────────────────────────────────
// Registers the app as the system handler for modulon:// links.
// On Windows this writes to the registry; on macOS it uses Info.plist.
app.setAsDefaultProtocolClient('modulon');

// Windows / Linux: enforce a single running instance so the second-instance
// event fires in the existing process when a modulon:// deep-link launches a
// new one.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Another instance already running — quit immediately (the running instance
  // will receive the deep-link URL via second-instance).
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // On Windows the deep-link URL is the last item in commandLine.
    const url = commandLine.find(arg => arg.startsWith('modulon://'));
    if (url) handleDeepLink(url);

    // Bring the existing window to front.
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// macOS: deep-link arrives via open-url (may fire before or after app ready).
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// If a deep-link arrives before the window is ready, store it here.
let pendingDeepLink = null;

/**
 * Handle a modulon:// URL.
 * Expected format: modulon://auth?googleIdToken=<JWT>
 */
function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'auth') {
      const googleIdToken = parsed.searchParams.get('googleIdToken');
      if (!googleIdToken) return;

      const [win] = BrowserWindow.getAllWindows();
      if (win) {
        win.webContents.send('google-auth-callback', { googleIdToken });
      } else {
        // Window not created yet — send once it finishes loading.
        pendingDeepLink = { googleIdToken };
      }
    }
  } catch (err) {
    console.error('[main] handleDeepLink error:', err);
  }
}

// ── app:// privileged scheme (must be registered before app is ready) ─────────
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

// ── IPC ───────────────────────────────────────────────────────────────────────
// Renderer calls window.electronAPI.openGoogleLogin() → opens /desktop/login
// in the user's default browser so they can sign in with Google.
ipcMain.handle('open-google-login', () => {
  const loginUrl = isDev
    ? 'http://localhost:5181/desktop/login'
    : `${SITE_URL}/desktop/login`;
  shell.openExternal(loginUrl);
});

// ── Window ────────────────────────────────────────────────────────────────────
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
    // Dev: Vite dev server handles routing; open directly on /desktop
    win.loadURL('http://localhost:5181/desktop');
  } else {
    // Prod: custom protocol serves dist/ as if it were http://
    win.loadURL('app://localhost/desktop');
  }

  // If a deep-link arrived before the window was ready, deliver it now.
  win.webContents.once('did-finish-load', () => {
    if (pendingDeepLink) {
      win.webContents.send('google-auth-callback', pendingDeepLink);
      pendingDeepLink = null;
    }
  });

  // Open external links in the system browser, never inside Electron.
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
