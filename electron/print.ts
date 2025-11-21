import path from 'node:path';
import fs from 'node:fs/promises';
import {BrowserWindow} from 'electron';
import {fileURLToPath, pathToFileURL} from 'node:url';
import type ProfileManager from './profile-manager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function saveInvoicePdf(
  kind: 'purchase' | 'sale',
  id: number,
  destinationPath: string,
  pageSize: 'A4' | 'A5' = 'A4',
  profileManager?: ProfileManager,
  profileId?: string
): Promise<void> {
  if (profileManager && profileId) {
    const db = profileManager.getConnection(profileId);
    const key = profileManager.getEncryptionKey(profileId);

    if (!db || !key) {
      throw new Error('Profile not open');
    }
  }

  // FIX: Calculate paths inside the function to ensure process.env.APP_ROOT is set
  // This prevents issues where this module loads before main.ts sets the env var
  const APP_ROOT = process.env.APP_ROOT || path.join(__dirname, '..');
  const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
  const MAIN_DIST = path.join(APP_ROOT, 'dist-electron');
  const RENDERER_DIST = path.join(APP_ROOT, 'dist');

  const preloadPath = path.join(
    MAIN_DIST,
    VITE_DEV_SERVER_URL ? 'preload.mjs' : 'preload.js'
  );

  console.log('Print Window Config:', {
    APP_ROOT,
    preloadPath,
    VITE_DEV_SERVER_URL,
  });

  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Match main window config (remove explicit sandbox: false unless necessary)
      webSecurity: true,
      devTools: false,
    },
  });

  // Construct URL
  const baseUrl =
    VITE_DEV_SERVER_URL ||
    pathToFileURL(path.join(RENDERER_DIST, 'index.html')).href;
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const params = new URLSearchParams();
  params.append('size', pageSize);
  if (profileId) {
    params.append('profileId', profileId);
  }

  const printUrl = `${cleanBaseUrl}/#/print/${kind}/${id}?${params.toString()}`;

  console.log('Loading print URL:', printUrl);

  try {
    await win.loadURL(printUrl);

    // FIX: Replace hardcoded 2s delay with smart polling
    // This checks every 50ms if the invoice (.min-h-screen) or error (.text-red-600) has rendered
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          const success = document.querySelector('.min-h-screen');
          const error = document.querySelector('.text-red-600');
          
          // Resolve if content found, error found, or timeout (5s fallback)
          if (success || error || (Date.now() - start > 5000)) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    `);

    // Small buffer (100ms) to ensure fonts and layout are fully settled
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log('Generating PDF...');
    const data = await win.webContents.printToPDF({
      pageSize: pageSize === 'A5' ? 'A5' : 'A4',
      margins: {top: 0, bottom: 0, left: 0, right: 0},
      printBackground: true,
    });

    console.log('Writing PDF to file:', destinationPath);
    await fs.writeFile(destinationPath, data);
    console.log('PDF write complete');
  } catch (error) {
    console.error('PDF Generation failed:', error);
    throw error;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
