import path from 'node:path';
import fs from 'node:fs/promises';
import {BrowserWindow, dialog, app} from 'electron';
import {VITE_DEV_SERVER_URL, MAIN_DIST} from './main';
import {fileURLToPath} from 'node:url';
import type ProfileManager from './profile-manager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function saveInvoicePdf(
  kind: 'purchase' | 'sale',
  id: number,
  pageSize: 'A4' | 'A5' = 'A4',
  profileManager?: ProfileManager,
  profileId?: string
): Promise<void> {
  if (profileManager && profileId) {
    // ✅ Validate profile is open
    const db = profileManager.getConnection(profileId);
    const key = profileManager.getEncryptionKey(profileId);

    if (!db || !key) {
      throw new Error('Profile not open');
    }
  }

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

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  const printUrl = devServerUrl
    ? `${devServerUrl}#/print/${kind}/${id}?size=${pageSize}`
    : `file://${path.join(
        __dirname,
        '../dist/index.html'
      )}#/print/${kind}/${id}?size=${pageSize}`;

  await win.loadURL(printUrl);

  return new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 500));
        const data = await win.webContents.printToPDF({
          pageSize: pageSize === 'A5' ? 'A5' : 'A4',
          margins: {top: 0, bottom: 0, left: 0, right: 0},
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
          await fs.writeFile(filePath, data);
          win.destroy();
          resolve();
        } else {
          win.destroy();
          resolve();
        }
      } catch (err) {
        win.close();
        reject(err);
      }
    });
  });
}
