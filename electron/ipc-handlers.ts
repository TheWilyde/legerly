import {ipcMain, dialog} from 'electron';
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
  type NewInvoice,
  type NewStockItem,
  type LedgerSavePayload,
} from './db';
import {saveInvoicePdf} from './print';
import log from './logger';
import ProfileManager from './profile-manager';
import AppStateManager from './app-state-manager';
import {app} from 'electron';

// ✅ Initialize managers
const profileManager = new ProfileManager();
const appStateManager = new AppStateManager(app.getPath('userData'));

export function registerIpcHandlers() {
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

  ipcMain.handle('profiles:create', async (_, name: string) => {
    try {
      const profile = await profileManager.createProfile(name);
      await profileManager.openProfile(profile.id);
      appStateManager.addOpenProfile(profile.id);
      return profile;
    } catch (error: any) {
      log.error('Failed to create profile:', error);
      throw error;
    }
  });

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

  ipcMain.handle('profiles:delete', async (_, profileId: string) => {
    try {
      await profileManager.deleteProfile(profileId);
      appStateManager.removeOpenProfile(profileId);
      return {success: true};
    } catch (error: any) {
      log.error('Failed to delete profile:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'profiles:rename',
    async (_, profileId: string, newName: string) => {
      try {
        profileManager.renameProfile(profileId, newName);
        return {success: true};
      } catch (error: any) {
        log.error('Failed to rename profile:', error);
        throw error;
      }
    }
  );

  // ====================================================================
  // ✅ PURCHASE INVOICES (Updated to use profileId)
  // ====================================================================

  ipcMain.handle('invoices:list', async (_, profileId: string) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      return listInvoices(db, key);
    } catch (error: any) {
      log.error('Failed to list invoices:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'invoices:create',
    async (_, profileId: string, data: NewInvoice) => {
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

  ipcMain.handle(
    'invoices:save',
    async (_, profileId: string, payload: any) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return saveInvoice(payload, db, key);
      } catch (error: any) {
        log.error('Failed to save invoice:', error);
        throw error;
      }
    }
  );

  // ====================================================================
  // ✅ STOCK (Updated to use profileId)
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
  // ✅ SALE INVOICES (Updated to use profileId)
  // ====================================================================

  ipcMain.handle('sale-invoices:list', async (_, profileId: string) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error('Profile not open');
      return listSaleInvoices(db, key);
    } catch (error: any) {
      log.error('Failed to list sale invoices:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'sale-invoices:create',
    async (_, profileId: string, data: NewInvoice) => {
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

  ipcMain.handle(
    'sale-invoices:save',
    async (_, profileId: string, payload: any) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return saveSaleInvoice(payload, db, key);
      } catch (error: any) {
        log.error('Failed to save sale invoice:', error);
        throw error;
      }
    }
  );

  // ====================================================================
  // ✅ LEDGER (Updated to use profileId)
  // ====================================================================

  ipcMain.handle(
    'ledger:save',
    async (_, profileId: string, payload: LedgerSavePayload) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error('Profile not open');
        return ledgerSave(payload, db, key);
      } catch (error: any) {
        log.error('Failed to save ledger:', error);
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
  // ✅ PDF EXPORT (Updated to use profileId)
  // ====================================================================

  ipcMain.handle(
    'invoice:savePdf',
    async (
      _,
      profileId: string,
      kind: 'purchase' | 'sale',
      id: number,
      pageSize?: 'A4' | 'A5'
    ) => {
      try {
        const result = await dialog.showSaveDialog({
          title: 'Save Invoice PDF',
          defaultPath: `invoice-${id}.pdf`,
          filters: [{name: 'PDF', extensions: ['pdf']}],
        });

        if (result.canceled || !result.filePath) {
          return {success: false, canceled: true};
        }

        // ✅ Pass profileManager to saveInvoicePdf
        await saveInvoicePdf(kind, id, pageSize, profileManager, profileId);
        return {success: true, path: result.filePath};
      } catch (error: any) {
        log.error('Failed to save invoice PDF:', error);
        throw error;
      }
    }
  );

  log.info('✅ IPC handlers registered (with profile support)');
}

// ✅ Export managers for use in main.ts
export {profileManager, appStateManager};
