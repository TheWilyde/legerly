import {contextBridge, ipcRenderer} from 'electron';
import type {
  NewInvoice,
  Invoice,
  InvoiceWithItems,
  NewStockItem,
  StockItem,
  LedgerSavePayload,
} from './db';
import type {Profile} from './types';

// ✅ Add profile APIs
contextBridge.exposeInMainWorld('electron', {
  // ====== PROFILE MANAGEMENT ======
  profiles: {
    list: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:list'),
    create: (name: string): Promise<Profile> =>
      ipcRenderer.invoke('profiles:create', name),
    open: (profileId: string): Promise<{success: boolean}> =>
      ipcRenderer.invoke('profiles:open', profileId),
    close: (profileId: string): Promise<{success: boolean}> =>
      ipcRenderer.invoke('profiles:close', profileId),
    switch: (profileId: string): Promise<{success: boolean}> =>
      ipcRenderer.invoke('profiles:switch', profileId),
    getOpen: (): Promise<string[]> => ipcRenderer.invoke('profiles:getOpen'),
    getActive: (): Promise<string | null> =>
      ipcRenderer.invoke('profiles:getActive'),
    delete: (profileId: string): Promise<{success: boolean}> =>
      ipcRenderer.invoke('profiles:delete', profileId),
    rename: (profileId: string, newName: string): Promise<{success: boolean}> =>
      ipcRenderer.invoke('profiles:rename', profileId, newName),
  },

  // ✅ Add event listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = ['profile:switched'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = ['profile:switched'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
});

// ✅ Update existing API to include profileId parameter
contextBridge.exposeInMainWorld('api', {
  // ====== PURCHASE INVOICES ======
  invoices: {
    list: (profileId: string): Promise<(Invoice & {totalQty: number})[]> =>
      ipcRenderer.invoke('invoices:list', profileId),
    create: (profileId: string, data: NewInvoice): Promise<Invoice> =>
      ipcRenderer.invoke('invoices:create', profileId, data),
    delete: (profileId: string, id: number): Promise<{success: boolean}> =>
      ipcRenderer.invoke('invoices:delete', profileId, id),
    get: (
      profileId: string,
      id: number
    ): Promise<InvoiceWithItems | undefined> =>
      ipcRenderer.invoke('invoices:get', profileId, id),
    save: (profileId: string, payload: any): Promise<InvoiceWithItems> =>
      ipcRenderer.invoke('invoices:save', profileId, payload),
  },

  // ====== STOCK ======
  stock: {
    list: (profileId: string): Promise<StockItem[]> =>
      ipcRenderer.invoke('stock:list', profileId),
    create: (profileId: string, data: NewStockItem): Promise<StockItem> =>
      ipcRenderer.invoke('stock:create', profileId, data),
    update: (
      profileId: string,
      id: number,
      data: NewStockItem
    ): Promise<StockItem> =>
      ipcRenderer.invoke('stock:update', profileId, id, data),
    delete: (profileId: string, id: number): Promise<{success: boolean}> =>
      ipcRenderer.invoke('stock:delete', profileId, id),
  },

  // ====== SALE INVOICES ======
  saleInvoices: {
    list: (profileId: string): Promise<Invoice[]> =>
      ipcRenderer.invoke('sale-invoices:list', profileId),
    create: (profileId: string, data: NewInvoice): Promise<Invoice> =>
      ipcRenderer.invoke('sale-invoices:create', profileId, data),
    delete: (profileId: string, id: number): Promise<{success: boolean}> =>
      ipcRenderer.invoke('sale-invoices:delete', profileId, id),
    get: (
      profileId: string,
      id: number
    ): Promise<InvoiceWithItems | undefined> =>
      ipcRenderer.invoke('sale-invoices:get', profileId, id),
    save: (profileId: string, payload: any): Promise<InvoiceWithItems> =>
      ipcRenderer.invoke('sale-invoices:save', profileId, payload),
  },

  // ====== LEDGER ======
  ledger: {
    save: (
      profileId: string,
      payload: LedgerSavePayload
    ): Promise<{id?: number; error?: string}> =>
      ipcRenderer.invoke('ledger:save', profileId, payload),
    get: (profileId: string, id: number): Promise<any> =>
      ipcRenderer.invoke('ledger:get', profileId, id),
    list: (profileId: string): Promise<any[]> =>
      ipcRenderer.invoke('ledger:list', profileId),
    delete: (profileId: string, id: number): Promise<{success: boolean}> =>
      ipcRenderer.invoke('ledger:delete', profileId, id),
  },

  // ====== PDF EXPORT ======
  invoice: {
    savePdf: (
      profileId: string,
      kind: 'purchase' | 'sale',
      id: number,
      pageSize?: 'A4' | 'A5'
    ): Promise<{success: boolean; path?: string; canceled?: boolean}> =>
      ipcRenderer.invoke('invoice:savePdf', profileId, kind, id, pageSize),
  },
});
