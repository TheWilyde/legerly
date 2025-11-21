import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('api', {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (name: string) => ipcRenderer.invoke('profiles:create', name),
    open: (id: string, pass: string) =>
      ipcRenderer.invoke('profiles:open', id, pass),
    close: (id: string) => ipcRenderer.invoke('profiles:close', id),
    switch: (id: string) => ipcRenderer.invoke('profiles:switch', id),
    getOpen: () => ipcRenderer.invoke('profiles:getOpen'),
    getActive: () => ipcRenderer.invoke('profiles:getActive'),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
  },
  invoices: {
    list: (profileId: string, filters?: any) =>
      ipcRenderer.invoke('invoices:list', profileId, filters),
    create: (profileId: string, data: any) =>
      ipcRenderer.invoke('invoices:create', profileId, data),
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
      pageSize?: 'A4' | 'A5'
    ) =>
      ipcRenderer.invoke('invoice:savePdf', profileId, kind, id, pageSize),
  },
  saleInvoices: {
    list: (profileId: string, filters?: any) =>
      ipcRenderer.invoke('sale-invoices:list', profileId, filters),
    create: (profileId: string, data: any) =>
      ipcRenderer.invoke('sale-invoices:create', profileId, data),
    delete: (profileId: string, id: number) =>
      ipcRenderer.invoke('sale-invoices:delete', profileId, id),
    get: (profileId: string, id: number) =>
      ipcRenderer.invoke('sale-invoices:get', profileId, id),
    save: (profileId: string, payload: any) =>
      ipcRenderer.invoke('sale-invoices:save', profileId, payload),
  },
  stock: {
    list: (profileId: string) => ipcRenderer.invoke('stock:list', profileId),
    create: (profileId: string, data: any) =>
      ipcRenderer.invoke('stock:create', profileId, data),
    update: (profileId: string, id: number, data: any) =>
      ipcRenderer.invoke('stock:update', profileId, id, data),
    delete: (profileId: string, id: number) =>
      ipcRenderer.invoke('stock:delete', profileId, id),
    // FIX: Added missing snapshot methods
    createSnapshot: (profileId: string) =>
      ipcRenderer.invoke('stock:createSnapshot', profileId),
    listSnapshots: (profileId: string) =>
      ipcRenderer.invoke('stock:listSnapshots', profileId),
    getSnapshot: (profileId: string, date: string) =>
      ipcRenderer.invoke('stock:getSnapshot', profileId, date),
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
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    // FIX: Added onFeedback method
    onFeedback: (callback: (type: 'success' | 'error') => void) => {
      const handler = (_: any, type: 'success' | 'error') => callback(type);
      ipcRenderer.on('app:feedback', handler);
      return () => ipcRenderer.removeListener('app:feedback', handler);
    },
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    // FIX: Add navigation channels to the allow list
    const validChannels = ['app:feedback', 'app:navigate', 'app:restore-session'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => func(...args));
    }
  },
  off: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, func);
  },
});
