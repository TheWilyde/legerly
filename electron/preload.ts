import {ipcRenderer, contextBridge} from 'electron';

// Keep existing bridge
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) =>
      listener(event, ...args)
    );
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});

// High-level APIs
contextBridge.exposeInMainWorld('api', {
  invoices: {
    list: () =>
      ipcRenderer.invoke('invoices:list') as Promise<
        {
          id: number;
          number: string;
          supplierName: string;
          total: number;
          createdAt: string;
        }[]
      >,
    create: (input: {supplierName: string; total: number; number: string}) =>
      ipcRenderer.invoke('invoices:create', input) as Promise<{
        id: number;
        number: string;
        supplierName: string;
        total: number;
        createdAt: string;
      }>,
    delete: (id: number) =>
      ipcRenderer.invoke('invoices:delete', id) as Promise<boolean>,
  },
});
