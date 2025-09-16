import {app, BrowserWindow, ipcMain, dialog, Menu} from 'electron';
import fs from 'node:fs/promises';
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

// Use correct preload file for dev vs prod
const PRELOAD_PATH = VITE_DEV_SERVER_URL
  ? path.join(__dirname, 'preload.mjs')
  : path.join(MAIN_DIST, 'preload.js');

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
      preload: PRELOAD_PATH,
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

  ipcMain.handle(
    'print:save-invoice-pdf',
    async (
      _evt,
      args: {kind: 'purchase' | 'sale'; id: number; pageSize?: 'A4' | 'A5'}
    ) => {
      const {kind, id, pageSize = 'A5'} = args;
      const pdfWin = new BrowserWindow({
        show: false,
        width: 900,
        height: 1270,
        webPreferences: {preload: PRELOAD_PATH},
      });
      // Use hash route so HashRouter renders the printable template
      const qs = `?size=${pageSize}`;
      const url = VITE_DEV_SERVER_URL
        ? `${VITE_DEV_SERVER_URL}#/print/${kind}/${id}${qs}`
        : `file://${path.join(
            RENDERER_DIST,
            'index.html'
          )}#/print/${kind}/${id}${qs}`;
      await pdfWin.loadURL(url);
      // Wait until renderer says content ready
      await new Promise<void>((resolve) => {
        const done = () => {
          pdfWin.webContents.removeAllListeners('ipc-message');
          resolve();
        };
        const to = setTimeout(done, 2000);
        pdfWin.webContents.on('ipc-message', (_e, channel) => {
          if (channel === 'print:ready') {
            clearTimeout(to);
            done();
          }
        });
      });
      const pdf = await pdfWin.webContents.printToPDF({
        margins: {top: 0, bottom: 0, left: 0, right: 0},
        pageSize,
        printBackground: true,
        landscape: false,
      });

      const {filePath, canceled} = await dialog.showSaveDialog(pdfWin, {
        title: `Save ${kind} invoice #${id} as PDF`,
        defaultPath: `invoice-${kind}-${id}.pdf`,
        filters: [{name: 'PDF', extensions: ['pdf']}],
      });

      if (!filePath || canceled) {
        pdfWin.destroy();
        return null;
      }

      await fs.writeFile(filePath, pdf);
      pdfWin.destroy();
      return filePath;
    }
  );

  ipcMain.handle(
    'file:save-buffer',
    async (_evt, args: {data: ArrayBuffer; defaultPath: string}) => {
      const {data, defaultPath} = args;
      const {filePath, canceled} = await dialog.showSaveDialog({
        title: 'Save PDF',
        defaultPath,
        filters: [{name: 'PDF', extensions: ['pdf']}],
      });
      if (!filePath || canceled) return null;
      await fs.writeFile(filePath, Buffer.from(data));
      return filePath;
    }
  );

  createWindow();
});
