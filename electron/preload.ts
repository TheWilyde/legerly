import {contextBridge, ipcRenderer} from 'electron';

const validChannels = new Set([
  'app:feedback',
  'app:navigate',
  'app:restore-session',
  'profile:switched',
]);

const channelListeners: Record<
  string,
  Map<(...args: any[]) => void, (_event: unknown, ...args: any[]) => void>
> = {};

function registerChannelListener(
  channel: string,
  callback: (...args: any[]) => void,
): () => void {
  if (!validChannels.has(channel)) {
    return () => {};
  }

  if (!channelListeners[channel]) {
    channelListeners[channel] = new Map();
  }

  const existing = channelListeners[channel].get(callback);
  if (existing) {
    ipcRenderer.removeListener(channel, existing);
  }

  const wrapped = (_event: unknown, ...args: any[]) => callback(...args);
  channelListeners[channel].set(callback, wrapped);
  ipcRenderer.on(channel, wrapped);

  // Return a direct unsubscribe closure so caller does not depend on
  // function identity crossing the contextBridge boundary.
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
    const listeners = channelListeners[channel];
    if (!listeners) return;
    const current = listeners.get(callback);
    if (current === wrapped) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        delete channelListeners[channel];
      }
    }
  };
}

function removeChannelListener(
  channel: string,
  callback?: (...args: any[]) => void,
) {
  if (!validChannels.has(channel)) return;

  const listeners = channelListeners[channel];
  if (!listeners) return;

  if (callback) {
    const wrapped = listeners.get(callback);
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped);
      listeners.delete(callback);
    }
    if (listeners.size === 0) {
      delete channelListeners[channel];
    }
    return;
  }

  for (const wrapped of listeners.values()) {
    ipcRenderer.removeListener(channel, wrapped);
  }
  delete channelListeners[channel];
}

contextBridge.exposeInMainWorld('api', {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (name: string, password?: string, color?: string) =>
      ipcRenderer.invoke('profiles:create', name, password, color),
    open: (id: string, _pass?: string) =>
      ipcRenderer.invoke('profiles:open', id),
    close: (id: string) => ipcRenderer.invoke('profiles:close', id),
    switch: (id: string) => ipcRenderer.invoke('profiles:switch', id),
    getOpen: () => ipcRenderer.invoke('profiles:getOpen'),
    getActive: () => ipcRenderer.invoke('profiles:getActive'),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
    updateColor: (id: string, color: string) =>
      ipcRenderer.invoke('profiles:updateColor', id, color),
    getBackups: (profileId: string) =>
      ipcRenderer.invoke('profiles:getBackups', profileId),
    restoreBackup: (profileId: string, filename: string) =>
      ipcRenderer.invoke('profiles:restoreBackup', profileId, filename),
    createBackup: (profileId: string) =>
      ipcRenderer.invoke('profiles:createBackup', profileId),
  },
  invoices: {
    list: (profileId: string, filters?: any) =>
      ipcRenderer.invoke('invoices:list', profileId, filters),
    nextNumber: (profileId: string) =>
      ipcRenderer.invoke('invoices:next-number', profileId),
    delete: (profileId: string, id: number) =>
      ipcRenderer.invoke('invoices:delete', profileId, id),
    get: (profileId: string, id: number) =>
      ipcRenderer.invoke('invoices:get', profileId, id),
    save: (profileId: string, payload: any) =>
      ipcRenderer.invoke('invoices:save', profileId, payload),
    savePdf: (
      profileId: string,
      kind: 'purchase' | 'sale',
      id: number,
      pageSize?: 'A4' | 'A5',
    ) => ipcRenderer.invoke('invoice:savePdf', profileId, kind, id, pageSize),
  },
  saleInvoices: {
    list: (profileId: string, filters?: any) =>
      ipcRenderer.invoke('sale-invoices:list', profileId, filters),
    nextNumber: (profileId: string) =>
      ipcRenderer.invoke('sale-invoices:next-number', profileId),
    delete: (profileId: string, id: number) =>
      ipcRenderer.invoke('sale-invoices:delete', profileId, id),
    get: (profileId: string, id: number) =>
      ipcRenderer.invoke('sale-invoices:get', profileId, id),
    save: (profileId: string, payload: any) =>
      ipcRenderer.invoke('sale-invoices:save', profileId, payload),
  },
  stock: {
    list: (profileId: string, filters?: {periodId?: number}) =>
      ipcRenderer.invoke('stock:list', profileId, filters),
    create: (profileId: string, data: any) =>
      ipcRenderer.invoke('stock:create', profileId, data),
    update: (profileId: string, id: number, data: any) =>
      ipcRenderer.invoke('stock:update', profileId, id, data),
    delete: (profileId: string, id: number) =>
      ipcRenderer.invoke('stock:delete', profileId, id),
  },
  ledger: {
    list: (profileId: string) => ipcRenderer.invoke('ledger:list', profileId),
    get: (profileId: string, id: number) =>
      ipcRenderer.invoke('ledger:get', profileId, id),
    save: (profileId: string, payload: any) =>
      ipcRenderer.invoke('ledger:save', profileId, payload),
    delete: (profileId: string, id: number) =>
      ipcRenderer.invoke('ledger:delete', profileId, id),
  },
  periods: {
    list: (profileId: string) => ipcRenderer.invoke('periods:list', profileId),
    getActive: (profileId: string) =>
      ipcRenderer.invoke('periods:get-active', profileId),
    getReopenContext: (profileId: string) =>
      ipcRenderer.invoke('periods:get-reopen-context', profileId),
    close: (profileId: string, payload: any) =>
      ipcRenderer.invoke('periods:close', profileId, payload),
    closeReopened: (profileId: string) =>
      ipcRenderer.invoke('periods:close-reopened', profileId),
    reopen: (profileId: string, periodId: number) =>
      ipcRenderer.invoke('periods:reopen', profileId, periodId),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    onFeedback: (callback: (type: 'success' | 'error') => void) => {
      const handler = (_: any, type: 'success' | 'error') => callback(type);
      ipcRenderer.on('app:feedback', handler);
      return () => ipcRenderer.removeListener('app:feedback', handler);
    },
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    return registerChannelListener(channel, func);
  },
  off: (channel: string, func?: (...args: any[]) => void) => {
    removeChannelListener(channel, func);
  },
});
