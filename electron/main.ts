import {app, BrowserWindow, Menu, ipcMain} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {
  initDatabase,
  listInvoices,
  createInvoice,
  type NewInvoice,
  deleteInvoice,
} from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 750,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    autoHideMenuBar: true,
  });

  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.webContents.openDevTools();

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  // Init DB in user data folder
  initDatabase(app.getPath('userData'));

  // IPC: invoices
  ipcMain.handle('invoices:list', () => listInvoices());
  ipcMain.handle('invoices:create', (_e, payload: NewInvoice) =>
    createInvoice(payload)
  );
  ipcMain.handle('invoices:delete', (_e, id: number) => {
    deleteInvoice(id);
    return true;
  });

  createWindow();
});
