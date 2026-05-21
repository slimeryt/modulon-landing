'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');
const os    = require('os');
const { exec } = require('child_process');

const APP_NAME       = 'Modulon';
const APP_VERSION    = '0.1.0';
const LAUNCHER_VERSION = '0.1.0';
const REPO           = 'slimeryt/modulon-landing';
const DOWNLOAD_URL   = 'https://github.com/slimeryt/modulon-landing/releases/latest/download/Modulon-App.zip';
const DEFAULT_DIR    = path.join(os.homedir(), 'AppData', 'Local', 'Programs', APP_NAME);

let win;

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width:           820,
    height:          520,
    frame:           false,
    resizable:       false,
    center:          true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:close',    () => app.quit());

ipcMain.handle('get-defaults', () => ({
  installDir:      DEFAULT_DIR,
  version:         APP_VERSION,
  launcherVersion: LAUNCHER_VERSION,
}));

ipcMain.handle('check-installed', () => {
  return fs.existsSync(path.join(DEFAULT_DIR, `${APP_NAME}.exe`));
});

// ── Launcher update check ─────────────────────────────────────────────────────
ipcMain.handle('check-launcher-update', () => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path:     `/repos/${REPO}/releases/latest`,
      headers:  { 'User-Agent': 'Modulon-Setup', 'Accept': 'application/vnd.github+json' },
    };
    https.get(options, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const rel     = JSON.parse(raw);
          const tag     = rel.tag_name || '';                       // e.g. "v0.2.0"
          const latest  = tag.replace(/^v/, '');                   // "0.2.0"
          const asset   = (rel.assets || []).find(a => a.name === 'Modulon-Setup.exe');
          const hasUpdate = semverGt(latest, LAUNCHER_VERSION);
          resolve({ hasUpdate, latest, tag, downloadUrl: asset?.browser_download_url || null });
        } catch (e) {
          resolve({ error: e.message });
        }
      });
    }).on('error', e => resolve({ error: e.message }));
  });
});

// ── Self-update: download new launcher to Downloads folder, open it, quit ─────
ipcMain.handle('self-update', async (_event, downloadUrl) => {
  const dest = path.join(os.homedir(), 'Downloads', 'Modulon-Setup.exe');
  try {
    await download(downloadUrl, dest, (pct) => {
      win?.webContents.send('update-dl-progress', pct);
    });
    shell.openPath(dest);
    setTimeout(() => app.quit(), 1200);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

function semverGt(a, b) {
  const pa = (a || '0').split('.').map(Number);
  const pb = (b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

ipcMain.handle('browse-dir', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties:  ['openDirectory', 'createDirectory'],
    defaultPath: DEFAULT_DIR,
    title:       'Choose installation folder',
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('start-install', async (_event, { installDir, desktopShortcut, startMenu }) => {
  try {
    // 1 ── Create directory
    push('Creating directory...', 2);
    fs.mkdirSync(installDir, { recursive: true });

    // 2 ── Download zip
    const zipPath = path.join(os.tmpdir(), `Modulon-App-${Date.now()}.zip`);
    await download(DOWNLOAD_URL, zipPath, (pct) => {
      push(`Downloading... ${pct}%`, 2 + Math.round(pct * 0.68));
    });

    // 3 ── Extract
    push('Extracting files...', 72);
    await run(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${installDir}' -Force"`
    );
    try { fs.unlinkSync(zipPath); } catch {}

    // 4 ── Shortcuts
    push('Creating shortcuts...', 88);
    const exe = path.join(installDir, `${APP_NAME}.exe`);
    if (desktopShortcut) {
      await shortcut(exe, path.join(os.homedir(), 'Desktop', `${APP_NAME}.lnk`));
    }
    if (startMenu) {
      const smDir = path.join(
        os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows',
        'Start Menu', 'Programs', APP_NAME
      );
      fs.mkdirSync(smDir, { recursive: true });
      await shortcut(exe, path.join(smDir, `${APP_NAME}.lnk`));
    }

    // 5 ── Registry uninstall entry
    push('Registering application...', 94);
    await writeUninstall(installDir, exe);

    push('Done', 100);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.on('launch-app', (_event, targetPath) => {
  // targetPath can be the exe, a bat file, or a folder (open in Explorer)
  const resolved = targetPath.endsWith('\\.') || targetPath.endsWith('/.')
    ? path.dirname(targetPath)
    : fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
      ? targetPath
      : targetPath;
  shell.openPath(resolved);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function push(phase, percent) {
  win?.webContents.send('progress', { phase, percent });
}

function run(cmd) {
  return new Promise((resolve, reject) =>
    exec(cmd, { windowsHide: true }, (err) => (err ? reject(err) : resolve()))
  );
}

/** Follow redirects and stream to dest, calling onProgress(0-100). */
function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const attempt = (urlStr) => {
      const mod  = urlStr.startsWith('https') ? https : http;
      const file = fs.createWriteStream(dest);

      mod.get(urlStr, (res) => {
        // follow redirect
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          file.destroy();
          setTimeout(() => {
            try { fs.unlinkSync(dest); } catch {}
            attempt(res.headers.location);
          }, 20);
          return;
        }
        if (res.statusCode !== 200) {
          file.destroy();
          return reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;

        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) onProgress(Math.round((received / total) * 100));
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error',  (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
      }).on('error', (e) => { file.destroy(); try { fs.unlinkSync(dest); } catch {} reject(e); });
    };
    attempt(url);
  });
}

/** Create a Windows .lnk shortcut via VBScript. */
function shortcut(target, linkPath) {
  const esc  = (s) => s.replace(/\\/g, '\\\\');
  const vbs  = [
    `Set sh  = CreateObject("WScript.Shell")`,
    `Set lnk = sh.CreateShortcut("${esc(linkPath)}")`,
    `lnk.TargetPath       = "${esc(target)}"`,
    `lnk.WorkingDirectory = "${esc(path.dirname(target))}"`,
    `lnk.IconLocation     = "${esc(target)},0"`,
    `lnk.Save()`,
  ].join('\r\n');
  const tmp = path.join(os.tmpdir(), `lnk-${Date.now()}.vbs`);
  fs.writeFileSync(tmp, vbs, 'utf8');
  return run(`cscript //nologo "${tmp}"`).finally(() => { try { fs.unlinkSync(tmp); } catch {} });
}

/** Write Add/Remove Programs entry so the app appears in Settings → Apps. */
function writeUninstall(installDir, exePath) {
  // Write a self-contained uninstall.bat to the install dir.
  // This avoids embedding a complex command with nested quotes directly in
  // the reg add /d argument, which breaks cmd.exe's quoting rules.
  const batPath = path.join(installDir, 'uninstall.bat');
  const batLines = [
    '@echo off',
    `taskkill /F /IM Modulon.exe /T >nul 2>&1`,
    `ping -n 2 127.0.0.1 >nul`,
    // delete install dir — schedule via cmd /c so the bat can delete itself
    `start "" /B cmd /c "ping -n 2 127.0.0.1 >nul & rd /s /q "${installDir}" & rd /s /q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Modulon" >nul 2>&1 & del /f /q "%USERPROFILE%\\Desktop\\Modulon.lnk" >nul 2>&1 & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Modulon" /f >nul 2>&1"`,
    `exit`,
  ];
  fs.writeFileSync(batPath, batLines.join('\r\n'), 'utf8');

  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}`;

  // Now that UninstallString is just a plain bat path (no embedded quotes),
  // individual reg add commands are safe to chain.
  const cmds = [
    `reg add "${key}" /v DisplayName     /t REG_SZ    /d "Modulon"       /f`,
    `reg add "${key}" /v DisplayVersion  /t REG_SZ    /d "${APP_VERSION}" /f`,
    `reg add "${key}" /v Publisher       /t REG_SZ    /d "Modulon"       /f`,
    `reg add "${key}" /v InstallLocation /t REG_SZ    /d "${installDir}" /f`,
    `reg add "${key}" /v UninstallString /t REG_SZ    /d "${batPath}"    /f`,
    `reg add "${key}" /v DisplayIcon     /t REG_SZ    /d "${exePath}"    /f`,
    `reg add "${key}" /v NoModify        /t REG_DWORD /d 1               /f`,
    `reg add "${key}" /v NoRepair        /t REG_DWORD /d 1               /f`,
  ].join(' && ');

  return run(cmds);
}
