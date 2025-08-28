import {app, BrowserWindow, Menu, ipcMain} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {
  initDatabase,
  listInvoices,
  createInvoice,
  type NewInvoice,
  deleteInvoice,
  listStock,
  createStock,
  updateStock,
  deleteStock,
  type NewStockItem,
  getInvoice, // +++
  saveInvoice, // +++
  listSaleInvoices,
  createSaleInvoice,
  deleteSaleInvoice,
  getSaleInvoice,
  saveSaleInvoice,
} from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

const APP_ROOT = process.env.APP_ROOT ?? app.getAppPath();
const VITE_PUBLIC = process.env.VITE_PUBLIC ?? path.join(APP_ROOT, 'dist');

// Safe to use as string now
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron');
export const PUBLIC_DIR = VITE_PUBLIC;

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 750,
    icon: path.join(VITE_PUBLIC, 'electron-vite.svg'),
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
  // New
  ipcMain.handle('invoices:get', (_e, id: number) => getInvoice(id));
  ipcMain.handle(
    'invoices:save',
    (
      _e,
      payload: {
        id?: number;
        number: string;
        supplierName: string;
        total: number;
        items: {
          code: string;
          name: string;
          rate: number;
          qty: number;
          position: number;
        }[];
      }
    ) => saveInvoice(payload)
  );

  // IPC: stock
  ipcMain.handle('stock:list', () => listStock());
  ipcMain.handle('stock:create', (_e, payload: NewStockItem) =>
    createStock(payload)
  );
  ipcMain.handle('stock:update', (_e, id: number, payload: NewStockItem) =>
    updateStock(id, payload)
  );
  ipcMain.handle('stock:delete', (_e, id: number) => {
    deleteStock(id);
    return true;
  });
  // +++ Sales IPC
  ipcMain.handle('sales:list', () => listSaleInvoices());
  ipcMain.handle('sales:create', (_e, payload: NewInvoice) =>
    createSaleInvoice(payload)
  );
  ipcMain.handle('sales:delete', (_e, id: number) => {
    deleteSaleInvoice(id);
    return true;
  });
  ipcMain.handle('sales:get', (_e, id: number) => getSaleInvoice(id));
  ipcMain.handle(
    'sales:save',
    (
      _e,
      payload: {
        id?: number;
        number: string;
        supplierName: string;
        total: number;
        address?: string;
        invoiceDate?: string;
        items: {
          code: string;
          name: string;
          rate: number;
          qty: number;
          position: number;
        }[];
      }
    ) => saveSaleInvoice(payload)
  );

  createWindow();
});
