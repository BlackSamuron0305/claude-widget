const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const WIDTH = 300;
const HEIGHT = 150;
const EDGE_MARGIN = 16;

const STATE_PATH = path.join(os.homedir(), '.claude', 'usage-widget', 'state.json');
const POSITION_PATH = path.join(app.getPath('userData'), 'position.json');

let win = null;
let tray = null;
let watcher = null;
let pollTimer = null;
let debounceTimer = null;
let clickThrough = false;

function loadSavedPosition() {
  try {
    const raw = fs.readFileSync(POSITION_PATH, 'utf-8');
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch {
    // no saved position yet
  }
  return null;
}

function savePosition(x, y) {
  try {
    fs.mkdirSync(path.dirname(POSITION_PATH), { recursive: true });
    fs.writeFileSync(POSITION_PATH, JSON.stringify({ x, y }));
  } catch {
    // best-effort only
  }
}

function defaultTopRight() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WIDTH - EDGE_MARGIN,
    y: workArea.y + EDGE_MARGIN
  };
}

function clampToWorkArea(x, y) {
  const { workArea } = screen.getPrimaryDisplay();
  const maxX = workArea.x + workArea.width - WIDTH;
  const maxY = workArea.y + workArea.height - HEIGHT;
  return {
    x: Math.min(Math.max(x, workArea.x), maxX),
    y: Math.min(Math.max(y, workArea.y), maxY)
  };
}

function createWindow() {
  const saved = loadSavedPosition();
  const pos = saved ? clampToWorkArea(saved.x, saved.y) : defaultTopRight();

  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile('index.html');

  win.once('ready-to-show', () => win.show());

  let moveDebounce = null;
  win.on('move', () => {
    clearTimeout(moveDebounce);
    moveDebounce = setTimeout(() => {
      const [x, y] = win.getPosition();
      savePosition(x, y);
    }, 300);
  });

  win.on('closed', () => { win = null; });
}

function resetPosition() {
  if (!win) return;
  const pos = defaultTopRight();
  win.setPosition(pos.x, pos.y);
  savePosition(pos.x, pos.y);
}

function toggleClickThrough() {
  if (!win) return;
  clickThrough = !clickThrough;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  const loginSettings = app.getLoginItemSettings();

  const menu = Menu.buildFromTemplate([
    { label: 'Reset position', click: resetPosition },
    { label: 'Click-through', type: 'checkbox', checked: clickThrough, click: toggleClickThrough },
    {
      label: 'Launch at login',
      type: 'checkbox',
      checked: loginSettings.openAtLogin,
      click: () => app.setLoginItemSettings({ openAtLogin: !loginSettings.openAtLogin })
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Claude Usage HUD');
  buildTrayMenu();
}

function readState() {
  try {
    let raw = fs.readFileSync(STATE_PATH, 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip stray BOM
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pushState() {
  if (!win) return;
  const state = readState();
  win.webContents.send('usage-state', state);
}

function debouncedPush() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(pushState, 150);
}

function watchState() {
  const dir = path.dirname(STATE_PATH);
  fs.mkdirSync(dir, { recursive: true });

  try {
    watcher = fs.watch(dir, (eventType, filename) => {
      if (filename === path.basename(STATE_PATH)) debouncedPush();
    });
  } catch {
    // fs.watch can fail on some setups; polling fallback below still covers us.
  }

  // fs.watch is unreliable across platforms/network drives - poll as a fallback.
  pollTimer = setInterval(debouncedPush, 2000);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  watchState();
  pushState();

  ipcMain.handle('get-state', () => readState());
});

app.on('window-all-closed', () => {
  if (watcher) watcher.close();
  if (pollTimer) clearInterval(pollTimer);
  app.quit();
});
