import {app, BrowserWindow, shell, ipcMain, session} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import log from './logger';
import {encryptionService} from './encryption';
import {installCSP} from './security';
import {loadConfig} from './config';
import {initAutoUpdater} from './updater';
import {
  registerIpcHandlers,
  profileManager,
  appStateManager,
} from './ipc-handlers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

// Some Windows environments lock Chromium cache folders unexpectedly.
// Avoid startup failures by keeping Chromium caches in memory.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-http-cache');
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

let mainWindow: BrowserWindow | null;

async function clearChromiumDiskCache() {
  try {
    // Use Electron's cache API instead of deleting cache folders directly.
    // Direct filesystem deletion can race Chromium startup and cause EPERM on Windows.
    await session.defaultSession.clearCache();
  } catch (error) {
    log.warn('Failed to clear Chromium network cache via session API:', error);
  }
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function createWindow() {
  const savedBounds = appStateManager.getWindowBounds();

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1200,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    autoHideMenuBar: true,
    frame: false, // ✅ Disable default frame for custom titlebar
    icon: path.join(process.env.APP_ROOT!, 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Ledgerly',
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url);
    } else {
      log.warn('Blocked unsafe external URL:', details.url);
    }
    return {action: 'deny'};
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAppUrl = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : url.startsWith('file://');

    if (isAppUrl) return;

    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
      return;
    }
    log.warn('Blocked navigation to unsafe URL:', url);
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    // ✅ This ensures DevTools ONLY open in dev mode
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
    // ✅ Explicitly ensure they are closed in production (optional safety)
    mainWindow.webContents.closeDevTools();
  }

  // Save window bounds on close
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      appStateManager.setWindowBounds(bounds);
    }
  });
}

// ✅ Initialize app with profile support
async function initializeApp() {
  try {
    log.info('🚀 Initializing Ledgerly...');

    const isDev = Boolean(VITE_DEV_SERVER_URL);

    // Self-heal known Chromium cache corruption safely without touching cache folders.
    void clearChromiumDiskCache();
    installCSP(isDev);

    const config = await loadConfig();
    if (config.updates?.enabled !== false) {
      void initAutoUpdater();
    } else {
      log.info('Auto-updates disabled by config');
    }

    // 1. Initialize encryption service
    await encryptionService.initialize();
    log.info('✅ Encryption service initialized');

    // 2. Load all profiles
    const profiles = profileManager.loadProfiles();
    log.info(`✅ Loaded ${profiles.length} profile(s)`);

    // 3. Register IPC handlers
    registerIpcHandlers();
    log.info('✅ IPC handlers registered');

    // ✅ OPTIMIZATION: Increase max listeners for IPC to prevent warnings
    ipcMain.setMaxListeners(20);

    // 4. Create main window
    createWindow();
    log.info('✅ Main window created');

    // 5. Check if we should restore previous session
    const hasProfiles = profileManager.hasProfiles();
    const openProfileIds = appStateManager.getOpenProfiles();

    if (!hasProfiles) {
      log.info('📋 No profiles found - showing welcome screen');
      if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow?.webContents.send('app:navigate', '/welcome');
        });
      }
    } else if (openProfileIds.length > 0) {
      log.info(
        `🔄 Restoring session with ${openProfileIds.length} open profile(s)`,
      );
      for (const pid of openProfileIds) {
        try {
          await profileManager.openProfile(pid);
        } catch (err) {
          log.error(`❌ Failed to restore profile ${pid}:`, err);
          appStateManager.removeOpenProfile(pid);
        }
      }

      const restoredProfileIds = appStateManager.getOpenProfiles();

      if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow?.webContents.send('app:restore-session', {
            profiles: restoredProfileIds,
          });
        });
      }
    }
  } catch (error) {
    log.error('❌ App initialization failed:', error);
    throw error;
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    mainWindow = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ✅ Save state and close connections before quit
app.on('before-quit', () => {
  log.info('💾 Saving app state...');

  // Get currently open profiles from app state
  const openProfiles = appStateManager.getOpenProfiles();
  log.info(`📋 Open profiles: ${openProfiles.length}`);

  // Close all database connections
  for (const profileId of openProfiles) {
    try {
      profileManager.closeProfile(profileId);
      log.info(`✅ Closed profile: ${profileId}`);
    } catch (err) {
      log.error(`❌ Failed to close profile ${profileId}:`, err);
    }
  }

  log.info('✅ App state saved');
});

// ✅ Start app
app.whenReady().then(initializeApp);
