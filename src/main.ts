import { app, BrowserWindow, ipcMain, Menu, Tray } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

interface UsageData {
  currentUsage: number;
  monthlyLimit: number;
  remainingQuota: number;
  lastUpdated: string;
  history: { date: string; usage: number }[];
}

let usageData: UsageData = {
  currentUsage: 0,
  monthlyLimit: 1000000,
  remainingQuota: 1000000,
  lastUpdated: new Date().toISOString(),
  history: []
};

function loadConfig(): { apiKey?: string } {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return {};
}

function saveConfig(config: { apiKey: string }) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

async function fetchUsageData(apiKey: string): Promise<UsageData> {
  try {
    const response = await fetch('https://api.anthropic.com/beta/usage', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-beta': 'usage-2024-06-01'
      }
    }) as any;

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: any = await response.json();

    const currentUsage = data.usage?.input_tokens || 0;
    const monthlyLimit = 1000000;
    const remainingQuota = Math.max(0, monthlyLimit - currentUsage);

    const newData: UsageData = {
      currentUsage,
      monthlyLimit,
      remainingQuota,
      lastUpdated: new Date().toISOString(),
      history: usageData.history || []
    };

    newData.history.push({
      date: new Date().toISOString(),
      usage: currentUsage
    });

    if (newData.history.length > 30) {
      newData.history = newData.history.slice(-30);
    }

    usageData = newData;
    return usageData;
  } catch (error) {
    console.error('Failed to fetch usage data:', error);
    return usageData;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    },
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    skipTaskbar: false,
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../public/index.html'));

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray();
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

app.on('ready', () => {
  createWindow();

  ipcMain.handle('save-api-key', async (event, apiKey: string) => {
    saveConfig({ apiKey });
    return { success: true };
  });

  ipcMain.handle('get-usage-data', async (event) => {
    const config = loadConfig();
    if (config.apiKey) {
      return await fetchUsageData(config.apiKey);
    }
    return usageData;
  });

  ipcMain.handle('has-api-key', async (event) => {
    const config = loadConfig();
    return !!config.apiKey;
  });

  setInterval(() => {
    const config = loadConfig();
    if (config.apiKey && mainWindow?.webContents) {
      fetchUsageData(config.apiKey).then(() => {
        mainWindow?.webContents.send('usage-updated', usageData);
      });
    }
  }, 5 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
