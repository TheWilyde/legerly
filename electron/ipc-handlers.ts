import {ipcMain} from 'electron';
import {
  listInvoices,
  createInvoice,
  deleteInvoice,
  listStock,
  createStock,
  updateStock,
  deleteStock,
  getInvoice,
  saveInvoice,
  listSaleInvoices,
  createSaleInvoice,
  deleteSaleInvoice,
  getSaleInvoice,
  saveSaleInvoice,
  ledgerSave,
  ledgerGet,
  ledgerList,
  ledgerDelete,
} from './db';
import {saveInvoicePdf} from './print';
import {
  NewInvoiceSchema,
  SaveInvoiceSchema,
  NewStockItemSchema,
  IdSchema,
  LedgerSaveSchema,
} from './validation';
import log from './logger';

function handle<T extends any[]>(
  channel: string,
  fn: (e: Electron.IpcMainInvokeEvent, ...args: T) => any | Promise<any>
) {
  ipcMain.handle(channel, async (e, ...args: T) => {
    try {
      return await fn(e, ...args);
    } catch (err: any) {
      log.error(`[ipc:${channel}]`, err);
      throw err;
    }
  });
}

export function registerIpcHandlers() {
  // Invoices
  handle('invoices:list', () => listInvoices());
  handle('invoices:create', (_e, payload: unknown) =>
    createInvoice(NewInvoiceSchema.parse(payload))
  );
  handle('invoices:delete', (_e, id: unknown) => {
    deleteInvoice(IdSchema.parse(id));
    return true;
  });
  handle('invoices:get', (_e, id: unknown) => getInvoice(IdSchema.parse(id)));
  handle('invoices:save', (_e, payload: unknown) =>
    saveInvoice(SaveInvoiceSchema.parse(payload))
  );

  // Stock
  handle('stock:list', () => listStock());
  handle('stock:create', (_e, payload: unknown) =>
    createStock(NewStockItemSchema.parse(payload))
  );
  handle('stock:update', (_e, id: unknown, payload: unknown) =>
    updateStock(IdSchema.parse(id), NewStockItemSchema.parse(payload))
  );
  handle('stock:delete', (_e, id: unknown) => {
    deleteStock(IdSchema.parse(id));
    return true;
  });

  // Sales
  handle('sales:list', () => listSaleInvoices());
  handle('sales:create', (_e, payload: unknown) =>
    createSaleInvoice(NewInvoiceSchema.parse(payload))
  );
  handle('sales:delete', (_e, id: unknown) => {
    deleteSaleInvoice(IdSchema.parse(id));
    return true;
  });
  handle('sales:get', (_e, id: unknown) => getSaleInvoice(IdSchema.parse(id)));
  handle('sales:save', (_e, payload: unknown) =>
    saveSaleInvoice(SaveInvoiceSchema.parse(payload))
  );

  // Ledger
  handle('ledger:save', (_e, payload: unknown) =>
    ledgerSave(LedgerSaveSchema.parse(payload))
  );
  handle('ledger:get', (_e, id: unknown) => ledgerGet(IdSchema.parse(id)));
  handle('ledger:list', () => ledgerList());
  handle('ledger:delete', (_e, id: unknown) => {
    ledgerDelete(IdSchema.parse(id));
    return true;
  });

  // Print - ✅ Fixed: Pass kind, id, and optional pageSize
  handle(
    'print:save-invoice-pdf',
    (_e, kind: 'purchase' | 'sale', id: number, pageSize?: 'A4' | 'A5') =>
      saveInvoicePdf(kind, id, pageSize)
  );
  handle('print:ready', () => true);
}
