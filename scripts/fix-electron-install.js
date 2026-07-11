// Workaround for a broken `extract-zip` unpack on some Node builds: the Electron
// binary zip downloads and caches fine, but extraction silently stops partway
// through (e.g. only locale files land in dist/, electron.exe never appears).
// This step verifies the binary is actually present after npm's own postinstall
// ran, and if not, re-extracts the already-cached zip itself.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');

function platformExeName() {
  switch (process.platform) {
    case 'win32': return 'electron.exe';
    case 'darwin': return 'Electron.app/Contents/MacOS/Electron';
    default: return 'electron';
  }
}

function isInstalled() {
  return fs.existsSync(path.join(distDir, platformExeName()));
}

function findCachedZip(version) {
  const cacheRoot = process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache')
    : path.join(os.homedir(), '.cache', 'electron');

  if (!fs.existsSync(cacheRoot)) return null;

  const target = `electron-v${version}-`;
  const stack = [cacheRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.startsWith(target) && entry.name.endsWith('.zip')) return full;
    }
  }
  return null;
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    // Bypass extract-zip; System.IO.Compression is reliable here.
    execFileSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
      `[System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath.replace(/'/g, "''")}', '${destDir.replace(/'/g, "''")}')`
    ], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
  }
}

function main() {
  if (isInstalled()) {
    console.log('[fix-electron-install] electron binary already present, nothing to do.');
    return;
  }

  console.log('[fix-electron-install] electron binary missing after npm install, attempting repair...');

  let pkgVersion;
  try {
    pkgVersion = require(path.join(electronDir, 'package.json')).version;
  } catch {
    console.warn('[fix-electron-install] could not read electron/package.json, skipping repair.');
    return;
  }

  let zipPath = findCachedZip(pkgVersion);

  if (!zipPath) {
    // Nothing cached yet - let electron's own installer populate the cache
    // (download works fine here; only the extraction step is broken).
    try {
      execFileSync(process.execPath, [path.join(electronDir, 'install.js')], { stdio: 'inherit' });
    } catch {
      // ignore - we check for the cached zip regardless below
    }
    zipPath = findCachedZip(pkgVersion);
  }

  if (!zipPath) {
    console.warn('[fix-electron-install] no cached electron zip found; repair skipped. Run `npm install` again, or check network access.');
    return;
  }

  try {
    fs.rmSync(distDir, { recursive: true, force: true });
    extractZip(zipPath, distDir);
    fs.writeFileSync(path.join(electronDir, 'path.txt'), platformExeName());

    if (isInstalled()) {
      console.log('[fix-electron-install] repair successful, electron binary is now present.');
    } else {
      console.warn('[fix-electron-install] repair ran but binary still missing - manual investigation needed.');
    }
  } catch (err) {
    console.warn('[fix-electron-install] repair failed:', err.message);
  }
}

main();
