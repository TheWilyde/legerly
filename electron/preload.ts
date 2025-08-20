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
    // New
    get: (id: number) =>
      ipcRenderer.invoke('invoices:get', id) as Promise<
        | {
            invoice: RendererInvoice;
            items: {
              id: number;
              invoiceId: number;
              code: string;
              name: string;
              rate: number;
              qty: number;
              position: number;
            }[];
          }
        | undefined
      >,
    save: (input: {
      id?: number;
      number: string;
      supplierName: string;
      total: number;
      items: {
        code: string;
        name: string;
        rate: number;
        qty: number;
        position: number;
      }[];
    }) =>
      ipcRenderer.invoke('invoices:save', input) as Promise<{
        invoice: RendererInvoice;
        items: {
          id: number;
          invoiceId: number;
          code: string;
          name: string;
          rate: number;
          qty: number;
          position: number;
        }[];
      }>,
  },
  stock: {
    list: () =>
      ipcRenderer.invoke('stock:list') as Promise<
        {
          id: number;
          code: string;
          name: string;
          purchaseRate: number;
          purchaseQty: number;
          saleRate: number;
          saleQty: number;
          createdAt: string;
        }[]
      >,
    create: (input: {
      code: string;
      name: string;
      purchaseRate: number;
      purchaseQty: number;
      saleRate: number;
      saleQty: number;
    }) =>
      ipcRenderer.invoke('stock:create', input) as Promise<{
        id: number;
        code: string;
        name: string;
        purchaseRate: number;
        purchaseQty: number;
        saleRate: number;
        saleQty: number;
        createdAt: string;
      }>,
    update: (
      id: number,
      input: {
        code: string;
        name: string;
        purchaseRate: number;
        purchaseQty: number;
        saleRate: number;
        saleQty: number;
      }
    ) =>
      ipcRenderer.invoke('stock:update', id, input) as Promise<{
        id: number;
        code: string;
        name: string;
        purchaseRate: number;
        purchaseQty: number;
        saleRate: number;
        saleQty: number;
        createdAt: string;
      }>,
    delete: (id: number) =>
      ipcRenderer.invoke('stock:delete', id) as Promise<boolean>,
  },
});
