import {ipcMain} from 'electron';
import type {WorkspaceManager} from './workspace-manager';
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
} from './db';
import {saveInvoicePdf} from './print';
import {
  NewInvoiceSchema,
  SaveInvoiceSchema,
  NewStockItemSchema,
  IdSchema,
  LedgerSaveSchema,
  WorkspaceIdSchema,
  WorkspaceNameSchema,
} from './validation';
import log from './logger';

function handle<T extends any[]>(
  channel: string,
  fn: (e: Electron.IpcMainInvokeEvent, ...args: T) => any | Promise<any>
) {
  ipcMain.handle(channel, async (e, ...args: T) => {
    try {
      return await fn(e, ...args);
    } catch (err) {
      log.error(`[ipc:${channel}]`, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  });
}

export function registerIpcHandlers(wsMgr: WorkspaceManager) {
  // Workspaces
  handle('workspace:list', () => wsMgr.list());
  ipcMain.on('workspace:activate', (e, id?: string) =>
    wsMgr.activate(e.sender, id ?? null)
  );

  handle('workspace:rename', async (_e, id: unknown, name: unknown) => {
    const ws = wsMgr.getById(WorkspaceIdSchema.parse(id));
    const newName = WorkspaceNameSchema.parse(name);
    ws.name = newName;
    if (ws.db) {
      ws.db
        .prepare(`INSERT OR REPLACE INTO meta (key,value) VALUES ('name', ?)`)
        .run(ws.name);
    } else {
      ws.needsWriteName = true;
    }
    return true;
  });

  // Invoices
  handle('invoices:list', (e) => listInvoices(wsMgr.getDbFor(e.sender)));
  handle('invoices:create', (e, payload: unknown) =>
    createInvoice(NewInvoiceSchema.parse(payload), wsMgr.getDbFor(e.sender))
  );
  handle('invoices:delete', (e, id: unknown) => {
    deleteInvoice(IdSchema.parse(id), wsMgr.getDbFor(e.sender));
    return true;
  });
  handle('invoices:get', (e, id: unknown) =>
    getInvoice(IdSchema.parse(id), wsMgr.getDbFor(e.sender))
  );
  handle('invoices:save', (e, payload: unknown) =>
    saveInvoice(SaveInvoiceSchema.parse(payload), wsMgr.getDbFor(e.sender))
  );

  // Stock
  handle('stock:list', (e) => listStock(wsMgr.getDbFor(e.sender)));
  handle('stock:create', (e, payload: unknown) =>
    createStock(NewStockItemSchema.parse(payload), wsMgr.getDbFor(e.sender))
  );
  handle('stock:update', (e, id: unknown, payload: unknown) =>
    updateStock(
      IdSchema.parse(id),
      NewStockItemSchema.parse(payload),
      wsMgr.getDbFor(e.sender)
    )
  );
  handle('stock:delete', (e, id: unknown) => {
    deleteStock(IdSchema.parse(id), wsMgr.getDbFor(e.sender));
    return true;
  });

  // Sales
  handle('sales:list', (e) => listSaleInvoices(wsMgr.getDbFor(e.sender)));
  handle('sales:create', (e, payload: unknown) =>
    createSaleInvoice(NewInvoiceSchema.parse(payload), wsMgr.getDbFor(e.sender))
  );
  handle('sales:delete', (e, id: unknown) => {
    deleteSaleInvoice(IdSchema.parse(id), wsMgr.getDbFor(e.sender));
    return true;
  });
  handle('sales:get', (e, id: unknown) =>
    getSaleInvoice(IdSchema.parse(id), wsMgr.getDbFor(e.sender))
  );
  handle('sales:save', (e, payload: unknown) =>
    saveSaleInvoice(SaveInvoiceSchema.parse(payload), wsMgr.getDbFor(e.sender))
  );

  // Ledger (validated)
  handle('ledger:save', (e, payload: unknown) =>
    ledgerSave(LedgerSaveSchema.parse(payload), wsMgr.getDbFor(e.sender))
  );
  handle('ledger:get', (e, id: unknown) =>
    ledgerGet(IdSchema.parse(id), wsMgr.getDbFor(e.sender))
  );
  handle('ledger:list', (e) => ledgerList(wsMgr.getDbFor(e.sender)));

  // Print
  handle(
    'print:save-invoice-pdf',
    async (
      _e,
      kind: 'purchase' | 'sale',
      id: unknown,
      pageSize?: 'A4' | 'A5'
    ) => saveInvoicePdf(kind, IdSchema.parse(id), pageSize)
  );
  handle('print:ready', async () => true);

  // Backup
  handle('workspace:backup', async (_e, id: unknown) =>
    wsMgr.backup(WorkspaceIdSchema.parse(id))
  );
}
