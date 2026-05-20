/**
 * build/make-installer.mjs
 *
 * Builds the fully custom Modulon installer (Electron-based GUI app) and
 * zips the win-unpacked app payload for download during installation.
 *
 * Output:
 *   dist-electron/Modulon-Setup.exe  — the custom installer
 *   dist-electron/Modulon-App.zip    — app payload downloaded by the installer
 */

import { execSync }                       from 'child_process';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, resolve }                  from 'path';

const root        = resolve(process.cwd());
const installerSrc = join(root, 'installer-src');
const distElectron = join(root, 'dist-electron');
const distInstaller = join(root, 'dist-installer');
const winUnpacked  = join(distElectron, 'win-unpacked');

// ── Verify win-unpacked exists ─────────────────────────────────────────────
if (!existsSync(winUnpacked)) {
  console.error('❌  dist-electron/win-unpacked not found.');
  console.error('    Run "npm run electron:package" first.');
  process.exit(1);
}

// ── 1. Build the installer Electron app ───────────────────────────────────
console.log('\n▶ Installing installer-src dependencies...');
execSync('npm install --prefer-offline', { cwd: installerSrc, stdio: 'inherit' });

console.log('\n▶ Building custom installer GUI...');
execSync('npx electron-builder --win --x64', { cwd: installerSrc, stdio: 'inherit' });

// ── 2. Copy output to dist-electron ───────────────────────────────────────
const builtExe = join(distInstaller, 'Modulon Setup.exe');
const outExe   = join(distElectron, 'Modulon-Setup.exe');

if (!existsSync(builtExe)) {
  console.error('❌  Could not find "Modulon Setup.exe" in dist-installer/');
  console.error('    Check electron-builder output above.');
  process.exit(1);
}

copyFileSync(builtExe, outExe);
console.log('✓  dist-electron/Modulon-Setup.exe ready');

// ── 3. Zip win-unpacked → Modulon-App.zip (downloaded by the installer) ───
const zipOut = join(distElectron, 'Modulon-App.zip');
console.log('\n▶ Creating Modulon-App.zip from win-unpacked...');
execSync(
  `powershell -NoProfile -Command ` +
  `"Compress-Archive -Path '${winUnpacked}\\*' -DestinationPath '${zipOut}' -Force"`,
  { stdio: 'inherit' }
);
console.log('✓  dist-electron/Modulon-App.zip ready');

console.log('\n🎉  All done! Upload both files to GitHub releases:');
console.log('    dist-electron/Modulon-Setup.exe');
console.log('    dist-electron/Modulon-App.zip');
