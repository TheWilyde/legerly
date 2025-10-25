import {app, BrowserWindow, shell} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import log from './logger';
import {encryptionService} from './encryption';
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

let mainWindow: BrowserWindow | null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
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
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // ✅ Always open DevTools console
  mainWindow.webContents.openDevTools();

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
    log.info('🚀 Initializing Bartan Markaz...');

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

    // 5. Check if we should restore previous session
    const hasProfiles = profileManager.hasProfiles();
    const openProfileIds = appStateManager.getOpenProfiles();

    if (!hasProfiles) {
      // First time - show welcome screen
      log.info('📋 No profiles found - showing welcome screen');
      if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow?.webContents.send('app:navigate', '/welcome');
        });
      }
      return;
    }

    if (openProfileIds.length > 0) {
      // Restore previously open profiles
      log.info(`🔄 Restoring ${openProfileIds.length} open profile(s)...`);
      const validProfileIds: string[] = [];

      for (const profileId of openProfileIds) {
        try {
          await profileManager.openProfile(profileId);
          validProfileIds.push(profileId);
          log.info(`✅ Restored profile: ${profileId}`);
        } catch (err) {
          log.error(`❌ Failed to restore profile ${profileId}:`, err);
        }
      }

      if (validProfileIds.length > 0) {
        // Set active profile
        const lastActive = appStateManager.getLastActiveProfile();
        const activeProfile = validProfileIds.includes(lastActive!)
          ? lastActive!
          : validProfileIds[0];

        appStateManager.setActiveProfile(activeProfile);
        log.info(`✅ Active profile: ${activeProfile}`);

        // Send navigation command to renderer
        if (mainWindow) {
          mainWindow.webContents.once('did-finish-load', () => {
            mainWindow?.webContents.send('app:restore-session', {
              profiles: validProfileIds,
              activeProfile,
            });
          });
        }
        return;
      }
    }

    // No valid open profiles - show profile selector
    log.info('📋 No open profiles - showing profile selector');
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send('app:navigate', '/profile-selector');
      });
    }
  } catch (error) {
    log.error('❌ Failed to initialize app:', error);
    app.quit();
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
