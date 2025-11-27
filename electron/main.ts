import {app, BrowserWindow, shell, ipcMain} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import log from './logger';
import {encryptionService} from './encryption';
import {
  registerIpcHandlers,
  profileManager,
  appStateManager,
} from './ipc-handlers';
import {sessionStore} from './sessionStore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let mainWindow: BrowserWindow | null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
    shell.openExternal(details.url);
    return {action: 'deny'};
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

    // 1. Initialize encryption service
    await encryptionService.initialize();
    log.info('✅ Encryption service initialized');

    // 2. Load all profiles
    const profiles = profileManager.loadProfiles();
    log.info(`✅ Loaded ${profiles.length} profile(s)`);

    // 3. Register IPC handlers
    registerIpcHandlers();
    log.info('✅ IPC handlers registered');

    // 4. Create main window
    createWindow();
    log.info('✅ Main window created');

    // ✅ OPTIMIZATION: Increase max listeners for IPC to prevent warnings
    const {ipcMain} = await import('electron');
    ipcMain.setMaxListeners(20);

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
        `🔄 Restoring session with ${openProfileIds.length} open profile(s)`
      );
      for (const pid of openProfileIds) {
        try {
          await profileManager.openProfile(pid);
        } catch (err) {
          log.error(`❌ Failed to restore profile ${pid}:`, err);
          appStateManager.removeOpenProfile(pid);
        }
      }

      if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow?.webContents.send('app:restore-session', {
            profiles: openProfileIds,
          });
        });
      }
    }
  } catch (error) {
    log.error('❌ App initialization failed:', error);
    throw error;
  }
}

// Return persisted session
ipcMain.handle('profiles:getOpen', async () => {
  return sessionStore.get().openProfiles;
});
ipcMain.handle('profiles:getActive', async () => {
  return sessionStore.get().activeProfileId;
});

// Update session on profile operations
ipcMain.handle('profiles:open', async (_evt, profileId: string) => {
  // ...existing open logic...
  sessionStore.addOpen(profileId);
  if (!sessionStore.get().activeProfileId) sessionStore.setActive(profileId);
  return {success: true};
});

ipcMain.handle('profiles:close', async (_evt, profileId: string) => {
  // ...existing close logic...
  sessionStore.removeOpen(profileId);
  return {success: true};
});

ipcMain.handle('profiles:switch', async (_evt, profileId: string) => {
  // ...existing switch logic...
  sessionStore.setActive(profileId);
  return {success: true};
});

// Optional: on app ready, keep session file present
app.on('ready', () => {
  const s = sessionStore.get();
  sessionStore.set(s);
});

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
