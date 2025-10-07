import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {app, BrowserWindow, Menu} from 'electron';
import {installCSP} from './security';
import {registerIpcHandlers} from './ipc-handlers';
import {initAutoUpdater} from './updater';
import {initDatabase} from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, '..');

const APP_ROOT = process.env.APP_ROOT ?? app.getAppPath();
const VITE_PUBLIC = process.env.VITE_PUBLIC ?? path.join(APP_ROOT, 'dist');
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron');
export const PUBLIC_DIR = VITE_PUBLIC;
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const RENDERER_DIST = path.join(process.env.APP_ROOT!, 'dist');

const PRELOAD_PATH = path.join(
  MAIN_DIST,
  VITE_DEV_SERVER_URL ? 'preload.mjs' : 'preload.js'
);

const IS_DEV = !!VITE_DEV_SERVER_URL;

installCSP(IS_DEV);

let win: BrowserWindow | null = null;

function createMainWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'Bartan Markaz',
  });

  Menu.setApplicationMenu(null);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  // ✅ Initialize single database
  const dataDir = path.join(app.getPath('userData'), 'data');
  initDatabase(dataDir);

  // ✅ Initialize auto-updater
  try {
    await initAutoUpdater();
  } catch (err) {
    console.error('Auto-updater initialization failed:', err);
  }

  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
