import {contextBridge, ipcRenderer} from 'electron';

// Detect print window (routes start with #/print)
const isPrintWindow = (() => {
  try {
    return (
      typeof location?.hash === 'string' && location.hash.startsWith('#/print')
    );
  } catch {
    return false;
  }
})();

// Allowlisted IPC wrapper (reduced surface for print windows)
const allowedInvoke = new Set(
  isPrintWindow
    ? ['invoices:get', 'sales:get', 'print:ready']
    : [
        'invoices:list',
        'invoices:create',
        'invoices:delete',
        'invoices:get',
        'invoices:save',
        'stock:list',
        'stock:create',
        'stock:update',
        'stock:delete',
        'sales:list',
        'sales:create',
        'sales:delete',
        'sales:get',
        'sales:save',
        'ledger:save',
        'ledger:get',
        'ledger:list',
        'ledger:delete',
        'print:save-invoice-pdf',
        'print:ready',
      ]
);

const safeInvoke = (channel: string, ...args: any[]) => {
  if (!allowedInvoke.has(channel))
    throw new Error(`Channel not allowed: ${channel}`);
  return ipcRenderer.invoke(channel as any, ...args);
};

contextBridge.exposeInMainWorld('api', {
  invoices: {
    list: () => safeInvoke('invoices:list'),
    create: (input: any) => safeInvoke('invoices:create', input),
    delete: (id: number) => safeInvoke('invoices:delete', id),
    get: (id: number) => safeInvoke('invoices:get', id),
    save: (payload: any) => safeInvoke('invoices:save', payload),
  },
  stock: {
    list: () => safeInvoke('stock:list'),
    create: (input: any) => safeInvoke('stock:create', input),
    update: (id: number, input: any) => safeInvoke('stock:update', id, input),
    delete: (id: number) => safeInvoke('stock:delete', id),
  },
  sales: {
    list: () => safeInvoke('sales:list'),
    create: (input: any) => safeInvoke('sales:create', input),
    delete: (id: number) => safeInvoke('sales:delete', id),
    get: (id: number) => safeInvoke('sales:get', id),
    save: (payload: any) => safeInvoke('sales:save', payload),
  },
  ledger: {
    save: (payload: any) => safeInvoke('ledger:save', payload),
    get: (id: number) => safeInvoke('ledger:get', id),
    list: () => safeInvoke('ledger:list'),
    delete: (id: number) => safeInvoke('ledger:delete', id),
  },
  print: {
    saveInvoicePdf: (payload: any) =>
      safeInvoke('print:save-invoice-pdf', payload),
    ready: () => safeInvoke('print:ready'),
  },
});
