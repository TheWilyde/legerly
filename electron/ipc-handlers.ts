import {app, ipcMain, BrowserWindow, shell} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {
  listInvoices,
  createInvoice,
  deleteInvoice,
  getInvoice,
  saveInvoice,
  listStock,
  createStock,
  updateStock,
  deleteStock,
  listSaleInvoices,
  createSaleInvoice,
  deleteSaleInvoice,
  getSaleInvoice,
  saveSaleInvoice,
  ledgerSave,
  getLedger,
  listLedgers,
  deleteLedger,
  type NewPurchaseInvoice,
  type NewSaleInvoice,
  type NewStockItem,
  type LedgerSavePayload,
  createStockSnapshot,
  listStockSnapshots,
  getStockSnapshot,
} from './db';
import {saveInvoicePdf} from './print';
import log from './logger';
import ProfileManager from './profile-manager';
import AppStateManager from './app-state-manager';

// ✅ Initialize managers
const profileManager = new ProfileManager();
const appStateManager = new AppStateManager(app.getPath('userData'));

// Helper for visual feedback
function flashFeedback(sender: any, type: 'success' | 'error') {
  const win = BrowserWindow.fromWebContents(sender);
  if (!win) return;
  win.webContents.send('app:feedback', type);
}

// FIX: Helper to format date as DD-MMM-YY
function formatDateForFilename(dateStr: string): {
  formatted: string;
  year: string;
  month: string;
} {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const monthShort = d.toLocaleString('en-US', {month: 'short'});
  const yearFull = String(d.getFullYear());
  const yearShort = yearFull.slice(-2);

  return {
    formatted: `${day}-${monthShort}-${yearShort}`,
    year: yearFull,
    month: monthShort,
  };
}

// FIX: Helper to get initials
function getInitials(name: string): string {
  return (name || 'Unknown')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 3);
}

export function registerIpcHandlers() {
  const GUARD_KEY = '__ipcHandlersRegistered__';
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  // Optional: clear handlers in dev to avoid duplicates
  try {
    const chans = [
      'profiles:list',
      'profiles:create',
      'profiles:open',
      'profiles:close',
      'profiles:switch',
      'profiles:getOpen',
      'profiles:getActive',
      'profiles:delete',
      'invoices:list',
      'invoices:create',
      'invoices:delete',
      'invoices:get',
      'invoices:save',
      'sale-invoices:list',
      'sale-invoices:create',
      'sale-invoices:delete',
      'sale-invoices:get',
      'sale-invoices:save',
      'stock:list',
      'stock:create',
      'stock:update',
      'stock:delete',
      'ledger:list',
      'ledger:get',
      'ledger:save',
      'ledger:delete',
      'invoice:savePdf',
      'invoice:getPrintData',
    ];
    for (const ch of chans) {
      (ipcMain as any).removeHandler?.(ch);
    }
  } catch {}

  // ====================================================================
  // ✅ PROFILE MANAGEMENT
  // ====================================================================

  ipcMain.handle('profiles:list', async () => {
    try {
      return profileManager.listProfiles();
    } catch (error: any) {
      log.error('Failed to list profiles:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'profiles:create',
    async (_event, name: string, password?: string) => {
      const profile = await profileManager.createProfile(name, password);
      // Automatically open the profile after creation to initialize the database
      await profileManager.openProfile(profile.id);
      return profile;
    }
  );

  ipcMain.handle('profiles:open', async (_, profileId: string) => {
    try {
      await profileManager.openProfile(profileId);
      appStateManager.addOpenProfile(profileId);
      return {success: true};
    } catch (error: any) {
      log.error('Failed to open profile:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:close', async (_, profileId: string) => {
    try {
      profileManager.closeProfile(profileId);
      appStateManager.removeOpenProfile(profileId);
      return {success: true};
    } catch (error: any) {
      log.error('Failed to close profile:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:switch', async (event, profileId: string) => {
    try {
      const oldProfile = appStateManager.getLastActiveProfile();
      appStateManager.setActiveProfile(profileId);

      // ✅ Notify renderer process of profile switch
      event.sender.send('profile:switched', {
        from: oldProfile,
        to: profileId,
        timestamp: Date.now(),
      });

      return {success: true};
    } catch (error: any) {
      log.error('Failed to switch profile:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:getOpen', async () => {
    try {
      return appStateManager.getOpenProfiles();
    } catch (error: any) {
      log.error('Failed to get open profiles:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:getActive', async () => {
    try {
      return appStateManager.getLastActiveProfile();
    } catch (error: any) {
      log.error('Failed to get active profile:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:delete', async (_, id: string) => {
    await profileManager.deleteProfile(id);
    return {success: true};
  });

  // FIX: Add Backup Handlers
  ipcMain.handle('profiles:getBackups', (_, profileId: string) => {
    return profileManager.getBackups(profileId);
  });

  ipcMain.handle(
    'profiles:restoreBackup',
    async (_, profileId: string, filename: string) => {
      await profileManager.restoreBackup(profileId, filename);
      return {success: true};
    }
  );

  // ✅ Add manual backup handler
  ipcMain.handle('profiles:createBackup', async (_, profileId: string) => {
    return profileManager.createManualBackup(profileId);
  });

  // ====================================================================
  // INVOICES
  // ====================================================================
  ipcMain.handle(
    'invoices:list',
    (
      _,
      profileId: string,
      filters?: {startDate?: string; endDate?: string}
    ) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        // FIX: Pass filters to db function
        return listInvoices(db, key, filters);
      } catch (error: any) {
        log.error('Failed to list invoices:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'invoices:create',
    async (_, profileId: string, data: NewPurchaseInvoice) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return createInvoice(data, db, key);
      } catch (error: any) {
        log.error('Failed to create invoice:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'invoices:delete',
    async (_, profileId: string, id: number) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        deleteInvoice(id, db, key);
        return {success: true};
      } catch (error: any) {
        log.error('Failed to delete invoice:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('invoices:get', async (_, profileId: string, id: number) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      return getInvoice(id, db, key);
    } catch (error: any) {
      log.error('Failed to get invoice:', error);
      throw error;
    }
  });

  // FIX: Added visual feedback for Purchase Invoice Save
  ipcMain.handle(
    'invoices:save',
    async (event, profileId: string, payload: any) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        const result = saveInvoice(payload, db, key);
        flashFeedback(event.sender, 'success');
        return result;
      } catch (error: any) {
        log.error('Failed to save invoice:', error);
        flashFeedback(event.sender, 'error');
        throw error;
      }
    }
  );

  // ====================================================================
  // ✅ STOCK
  // ====================================================================

  ipcMain.handle('stock:list', async (_, profileId: string) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      return listStock(db, key);
    } catch (error: any) {
      log.error('Failed to list stock:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'stock:create',
    async (_, profileId: string, data: NewStockItem) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return createStock(data, db, key);
      } catch (error: any) {
        log.error('Failed to create stock:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'stock:update',
    async (_, profileId: string, id: number, data: NewStockItem) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return updateStock(id, data, db, key);
      } catch (error: any) {
        log.error('Failed to update stock:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('stock:delete', async (_, profileId: string, id: number) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      deleteStock(id, db, key);
      return {success: true};
    } catch (error: any) {
      log.error('Failed to delete stock:', error);
      throw error;
    }
  });

  // ====================================================================
  // ✅ SALE INVOICES
  // ====================================================================
  ipcMain.handle(
    'sale-invoices:list',
    (
      _,
      profileId: string,
      filters?: {startDate?: string; endDate?: string}
    ) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        // FIX: Pass filters to db function
        return listSaleInvoices(db, key, filters);
      } catch (error: any) {
        log.error('Failed to list sale invoices:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'sale-invoices:create',
    async (_, profileId: string, data: NewSaleInvoice) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return createSaleInvoice(data, db, key);
      } catch (error: any) {
        log.error('Failed to create sale invoice:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'sale-invoices:delete',
    async (_, profileId: string, id: number) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        deleteSaleInvoice(id, db, key);
        return {success: true};
      } catch (error: any) {
        log.error('Failed to delete sale invoice:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'sale-invoices:get',
    async (_, profileId: string, id: number) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return getSaleInvoice(id, db, key);
      } catch (error: any) {
        log.error('Failed to get sale invoice:', error);
        throw error;
      }
    }
  );

  // FIX: Added visual feedback for Sale Invoice Save
  ipcMain.handle(
    'sale-invoices:save',
    async (event, profileId: string, payload: any) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        const result = saveSaleInvoice(payload, db, key);
        flashFeedback(event.sender, 'success');
        return result;
      } catch (error: any) {
        log.error('Failed to save sale invoice:', error);
        flashFeedback(event.sender, 'error');
        throw error;
      }
    }
  );

  // ====================================================================
  // ✅ LEDGER
  // ====================================================================

  // FIX: Added visual feedback for Ledger Save
  ipcMain.handle(
    'ledger:save',
    async (event, profileId: string, payload: LedgerSavePayload) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        const result = ledgerSave(payload, db, key);
        flashFeedback(event.sender, 'success');
        return result;
      } catch (error: any) {
        log.error('Failed to save ledger:', error);
        flashFeedback(event.sender, 'error');
        throw error;
      }
    }
  );

  ipcMain.handle('ledger:get', async (_, profileId: string, id: number) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      return getLedger(id, db, key);
    } catch (error: any) {
      log.error('Failed to get ledger:', error);
      throw error;
    }
  });

  ipcMain.handle('ledger:list', async (_, profileId: string) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      return listLedgers(db, key);
    } catch (error: any) {
      log.error('Failed to list ledgers:', error);
      throw error;
    }
  });

  ipcMain.handle('ledger:delete', async (_, profileId: string, id: number) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      deleteLedger(id, db, key);
      return {success: true};
    } catch (error: any) {
      log.error('Failed to delete ledger:', error);
      throw error;
    }
  });

  // ====================================================================
  // ✅ PDF EXPORT (UPDATED)
  // ====================================================================

  ipcMain.handle(
    'invoice:savePdf',
    async (
      event,
      profileId: string,
      kind: 'purchase' | 'sale',
      id: number,
      pageSize?: 'A4' | 'A5'
    ) => {
      try {
        console.log('Starting PDF save process...');

        // 1. Fetch Data
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');

        let invoiceData;
        if (kind === 'purchase') {
          invoiceData = getInvoice(id, db, key);
        } else {
          invoiceData = getSaleInvoice(id, db, key);
        }

        if (!invoiceData || !invoiceData.invoice) {
          throw new Error('Invoice not found');
        }

        // Get Profile Name
        const profiles = await profileManager.listProfiles();
        const profile = profiles.find((p) => p.id === profileId);
        const profileName = profile?.name || 'Profile';

        // 2. Construct Paths and Filename
        const invoice = invoiceData.invoice;
        const {
          formatted: dateStr,
          year,
          month,
        } = formatDateForFilename(invoice.invoiceDate || invoice.createdAt);
        const initials = getInitials(profileName);
        const typeCode = kind === 'purchase' ? 'P' : 'S';
        const typeFolder =
          kind === 'purchase' ? 'Purchase Invoices' : 'Sale Invoices';

        // Filename: [Initials]-[P/S]-[DD-MMM-YY]-[InvoiceNumber].pdf
        const filename = `${initials}-${typeCode}-${dateStr}-${invoice.number}.pdf`;

        // Folder Structure: Documents/Legerly/[Profile Name]/[Type]/[Year]/[Month]/
        const documentsPath = app.getPath('documents');
        const saveDir = path.join(
          documentsPath,
          'Legerly', // FIX: Changed from BartanMarkaz to Legerly
          profileName,
          typeFolder,
          year,
          month
        );

        // Ensure directory exists
        if (!fs.existsSync(saveDir)) {
          fs.mkdirSync(saveDir, {recursive: true});
        }

        const destinationPath = path.join(saveDir, filename);
        console.log('Saving PDF directly to:', destinationPath);

        // 3. Generate PDF
        await saveInvoicePdf(
          kind,
          id,
          destinationPath,
          pageSize || 'A4',
          profileManager,
          profileId
        );

        console.log('PDF saved successfully');
        flashFeedback(event.sender, 'success');

        // 4. Open folder
        shell.showItemInFolder(destinationPath);

        return {success: true, path: destinationPath};
      } catch (error: any) {
        console.error('PDF Save Error:', error);
        flashFeedback(event.sender, 'error');
        return {success: false, error: error.message};
      }
    }
  );

  // FIX: Add handler for fetching print data
  ipcMain.handle(
    'invoice:getPrintData',
    async (_, profileId: string, kind: 'purchase' | 'sale', id: number) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');

        if (kind === 'purchase') {
          return getInvoice(id, db, key);
        } else {
          return getSaleInvoice(id, db, key);
        }
      } catch (error: any) {
        log.error('Failed to get print data:', error);
        throw error;
      }
    }
  );

  // ====================================================================
  // STOCK SNAPSHOTS (HISTORY)
  // ====================================================================

  ipcMain.handle('stock:createSnapshot', (_, profileId: string) => {
    const db = profileManager.getConnection(profileId);
    const key = profileManager.getEncryptionKey(profileId);
    if (!db || !key) throw new Error('Profile not open');
    return createStockSnapshot(db, key);
  });

  ipcMain.handle('stock:listSnapshots', (_, profileId: string) => {
    const db = profileManager.getConnection(profileId);
    if (!db) throw new Error('Profile not open');
    return listStockSnapshots(db);
  });

  ipcMain.handle('stock:getSnapshot', (_, profileId: string, date: string) => {
    const db = profileManager.getConnection(profileId);
    const key = profileManager.getEncryptionKey(profileId);
    if (!db || !key) throw new Error('Profile not open');
    return getStockSnapshot(db, key, date);
  });

  // ✅ Window Controls
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  log.info('✅ IPC handlers registered (with profile support)');
}

// ✅ Export managers for use in main.ts
export {profileManager, appStateManager};
