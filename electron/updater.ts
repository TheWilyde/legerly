import log from './logger';

export async function initAutoUpdater() {
  // Run only in production
  if (process.env.VITE_DEV_SERVER_URL) return;

  try {
    // Dynamic import avoids TS/module resolution errors in dev without the package
    const mod: any = await (Function('return import("electron-updater")')());
    const au = mod?.autoUpdater;
    if (!au) return;

    au.on('error', (err: any) => log.error('[updater] error:', err));
    au.on('update-available', (info: any) =>
      log.info('[updater] Update available:', info?.version ?? 'unknown')
    );
    au.on('update-not-available', () => log.info('[updater] No update available'));
    au.on('checking-for-update', () => log.info('[updater] Checking for update...'));
    au.on('download-progress', (p: any) =>
      log.info('[updater] Download progress:', Math.round(p?.percent ?? 0) + '%')
    );
    au.on('update-downloaded', () => log.info('[updater] Update downloaded'));

    await au.checkForUpdatesAndNotify().catch((err: any) => {
      log.error('[updater] Failed to check for updates:', err);
    });
  } catch (err) {
    log.error('[updater] initialization failed:', err);
  }
}
