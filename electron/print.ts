import path from 'node:path';
import fs from 'node:fs/promises';
import {BrowserWindow, dialog, app} from 'electron';
import {VITE_DEV_SERVER_URL, RENDERER_DIST, MAIN_DIST} from './main';

export async function saveInvoicePdf(
  kind: 'purchase' | 'sale',
  id: number,
  pageSize: 'A4' | 'A5' = 'A4'
) {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(
        MAIN_DIST,
        VITE_DEV_SERVER_URL ? 'preload.mjs' : 'preload.js'
      ),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    },
  });

  const hashRoute = `#/print/${encodeURIComponent(
    kind
  )}/${id}?size=${pageSize}`;
  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL + hashRoute);
  } else {
    await win.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      hash: hashRoute,
    });
  }

  await new Promise<void>((resolve) =>
    win.webContents.once('did-finish-load', () => resolve())
  );

  const pdf = await win.webContents.printToPDF({
    pageSize,
    landscape: false,
    printBackground: true,
  });

  const {canceled, filePath} = await dialog.showSaveDialog({
    title: 'Save Invoice PDF',
    defaultPath: path.join(
      app.getPath('documents'),
      `invoice-${kind}-${id}.pdf`
    ),
    filters: [{name: 'PDF', extensions: ['pdf']}],
  });

  if (!canceled && filePath) {
    await fs.writeFile(filePath, pdf);
    win.destroy();
    return filePath;
  }
  win.destroy();
  return null;
}
