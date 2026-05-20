import { execSync }  from 'child_process';
import { existsSync } from 'fs';
import { join }       from 'path';
import { homedir }    from 'os';

// electron-builder caches its own NSIS build — reuse it so we don't need
// a separate NSIS installation on the machine.
const cache    = join(homedir(), 'AppData/Local/electron-builder/Cache/nsis');
const nsisDir  = 'nsis-3.0.4.1-nsis-3.0.4.1';
const makensis = join(cache, nsisDir, 'Bin/makensis.exe');

if (!existsSync(makensis)) {
  console.error('makensis not found at:', makensis);
  console.error('Run "npm run electron:package" once first to download it via electron-builder.');
  process.exit(1);
}

const script = 'build/installer.nsi';
console.log('▶ Compiling', script, 'with', makensis);

// Pass the project root as an absolute define so .nsi paths never depend
// on makensis's cwd or ${__FILEDIR__} context shifts inside !includes.
const root = process.cwd().replace(/\//g, '\\');

try {
  execSync(`"${makensis}" /DROOT="${root}" "${script}"`, {
    stdio: 'inherit',
    cwd: root,
  });
  console.log('✓ dist-electron/Modulon-Setup.exe ready');
} catch {
  process.exit(1);
}
