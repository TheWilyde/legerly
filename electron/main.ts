import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {app, BrowserWindow, Menu} from 'electron';
import {installCSP} from './security';
import {loadConfig} from './config';
import {WorkspaceManager} from './workspace-manager';
import {registerIpcHandlers} from './ipc-handlers';
import {initAutoUpdater} from './updater';

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
let wsMgr: WorkspaceManager;

function createMainWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 820,
    icon: path.join(PUBLIC_DIR, 'electron-vite.svg'),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !!VITE_DEV_SERVER_URL,
    },
    autoHideMenuBar: true,
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(RENDERER_DIST, 'index.html'));

  win.on('closed', () => (win = null));
}

app.on('web-contents-created', (_ev, wc) => {
  wc.on('destroyed', () => {
    wsMgr?.cleanupWC(wc);
  });
});

app.whenReady().then(async () => {
  const cfg = await loadConfig();
  if (cfg.updates?.enabled) {
    initAutoUpdater().catch(() => {});
  }

  wsMgr = new WorkspaceManager(cfg.idleCloseMs);
  await wsMgr.initialize(cfg.workspaces);

  registerIpcHandlers(wsMgr);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  // Close timers and DBs cleanly
  try {
    wsMgr?.cleanup();
  } catch {}
});
