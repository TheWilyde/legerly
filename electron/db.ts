import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {AppError, ErrorCodes} from './errors';
import log from './logger';
import {normalizeCode} from './utils';

export type NewInvoice = {
  supplierName: string;
  total: number;
  number: string;
  address?: string;
  invoiceDate?: string; // yyyy-MM-dd
};

export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
};

// Stock types
export type NewStockItem = {
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
};
export type StockItem = NewStockItem & {id: number; createdAt: string};

// New: invoice items
export type NewInvoiceItem = {
  code: string;
  name: string;
  rate: number;
  qty: number;
  position: number;
};
export type InvoiceItem = NewInvoiceItem & {id: number; invoiceId: number};
export type InvoiceWithItems = {invoice: Invoice; items: InvoiceItem[]};

// ✅ Add missing Ledger types
export type LedgerSavePayload = {
  id?: number;
  customerName: string;
  contactNo?: string;
  totals: {
    debit: number;
    credit: number;
    net: number;
  };
  rows: {
    id?: number;
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    crDr: 'CR' | 'DR';
    position: number;
  }[];
};

let db: Database.Database;

export function initDatabase(dataDir: string) {
  const dbPath = path.join(dataDir, 'app.db');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  db = new Database(dbPath);
  ensureSchema(db);
}

// ✅ Remove workspace override - use singleton db only
function _db() {
  return db;
}

// ✅ Remove dbOverride parameter from all function signatures
export function listInvoices(): (Invoice & {totalQty: number})[] {
  return _db()
    .prepare(
      `
      SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC
    `
    )
    .all() as (Invoice & {totalQty: number})[];
}

export function createInvoice(input: NewInvoice) {
  const createdAt = new Date().toISOString();
  const uid = `PI-${randomUUID()}`;
  const stmt = _db().prepare(
    `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  } as const;
}

export function deleteInvoice(id: number): void {
  _db().prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}

export function listStock(): StockItem[] {
  return _db()
    .prepare(
      `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt FROM stock ORDER BY id ASC`
    )
    .all() as StockItem[];
}

export function createStock(input: NewStockItem): StockItem {
  const d = _db();
  const code = normalizeCode(input.code);
  const name = String(input.name ?? '').trim();
  try {
    const stmt = d.prepare(`
      INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
      VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))
    `);
    const info = stmt.run({
      code,
      name,
      purchaseRate: +input.purchaseRate || 0,
      purchaseQty: +input.purchaseQty || 0,
      saleRate: +input.saleRate || 0,
      saleQty: +input.saleQty || 0,
    });
    return d
      .prepare(`SELECT * FROM stock WHERE id=@id`)
      .get({id: info.lastInsertRowid}) as StockItem;
  } catch (e: any) {
    if (
      String(e?.message || '').includes('UNIQUE') &&
      String(e?.message || '').includes('stock.code')
    ) {
      throw new AppError(
        ErrorCodes.STOCK_CODE_EXISTS,
        'Stock code already exists'
      );
    }
    log.error('[db] Unexpected stock create error:', e);
    throw e;
  }
}

export function updateStock(id: number, input: NewStockItem): StockItem {
  const d = _db();
  const code = normalizeCode(input.code);
  const name = String(input.name ?? '').trim();
  try {
    const stmt = d.prepare(`
      UPDATE stock
      SET code=@code, name=@name, purchaseRate=@purchaseRate, purchaseQty=@purchaseQty, saleRate=@saleRate, saleQty=@saleQty
      WHERE id=@id
    `);
    stmt.run({
      id,
      code,
      name,
      purchaseRate: +input.purchaseRate || 0,
      purchaseQty: +input.purchaseQty || 0,
      saleRate: +input.saleRate || 0,
      saleQty: +input.saleQty || 0,
    });
    return d.prepare(`SELECT * FROM stock WHERE id=@id`).get({id}) as StockItem;
  } catch (e: any) {
    if (
      String(e?.message || '').includes('UNIQUE') &&
      String(e?.message || '').includes('stock.code')
    ) {
      throw new AppError(
        ErrorCodes.STOCK_CODE_EXISTS,
        'Stock code already exists'
      );
    }
    log.error('[db] Unexpected stock update error:', e);
    throw e;
  }
}

export function deleteStock(id: number): void {
  _db().prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}

export function getInvoice(id: number): InvoiceWithItems | undefined {
  const d = _db();
  const inv = d
    .prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
    )
    .get(id) as Invoice | undefined;
  if (!inv) return undefined;
  const items = d
    .prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    )
    .all(id) as InvoiceItem[];
  return {invoice: inv, items};
}

export function saveInvoice(payload: {
  id?: number;
  number: string;
  supplierName: string;
  total: number;
  address?: string;
  invoiceDate?: string;
  items: NewInvoiceItem[];
}): InvoiceWithItems {
  const d = _db();
  const items = (payload.items ?? []).map((it) => ({
    code: normalizeCode(it.code),
    name: String(it.name ?? '').trim(),
    rate: +it.rate || 0,
    qty: +it.qty || 0,
    position: +it.position || 0,
  }));
  const tx = d.transaction((p: typeof payload) => {
    let invoiceId = p.id ?? 0;
    const createdAt = new Date().toISOString();

    // ✅ Get previous items if editing (for stock reversal)
    let previousItems: InvoiceItem[] | undefined;
    if (p.id) {
      previousItems = d
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ?`
        )
        .all(p.id) as InvoiceItem[];
    }

    if (!p.id) {
      const uid = `PI-${randomUUID()}`;
      const info = d
        .prepare(
          `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
           VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
        )
        .run({
          uid,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total,
          createdAt,
          address: p.address ?? '',
          invoiceDate: p.invoiceDate ?? null,
        });
      invoiceId = Number(info.lastInsertRowid);
    } else {
      d.prepare(
        `UPDATE invoices
           SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
         WHERE id=@id`
      ).run({
        id: p.id,
        number: p.number,
        supplierName: p.supplierName,
        total: p.total,
        address: p.address ?? '',
        invoiceDate: p.invoiceDate ?? null,
      });
      d.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);
    }

    const insertItem = d.prepare(
      `INSERT INTO invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: it.rate,
        qty: it.qty,
        position: it.position,
      });
    }

    // ✅ Update stock after invoice items are saved
    updateStockOnPurchase(d, items, !!p.id, previousItems);

    const invoice = d
      .prepare(
        `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
      )
      .get(invoiceId) as Invoice;
    const itemsOut = d
      .prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
      )
      .all(invoiceId) as InvoiceItem[];
    return {invoice, items: itemsOut};
  });
  return tx(payload);
}

// ✅ Helper function to update stock on purchase invoice save
function updateStockOnPurchase(
  db: Database.Database,
  items: NewInvoiceItem[],
  isEdit: boolean,
  previousItems?: InvoiceItem[]
) {
  // If editing, first reverse previous stock changes
  if (isEdit && previousItems) {
    for (const prevItem of previousItems) {
      const stock = db
        .prepare(`SELECT * FROM stock WHERE code = ?`)
        .get(prevItem.code) as StockItem | undefined;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET purchaseQty = purchaseQty - @qty
           WHERE code = @code`
        ).run({
          code: prevItem.code,
          qty: prevItem.qty,
        });
      }
    }
  }

  // Apply new stock changes
  for (const item of items) {
    const stock = db
      .prepare(`SELECT * FROM stock WHERE code = ?`)
      .get(item.code) as StockItem | undefined;

    if (stock) {
      // ✅ Update stock: name, purchaseQty, and purchaseRate
      db.prepare(
        `UPDATE stock
         SET name = @name,
             purchaseQty = purchaseQty + @qty,
             purchaseRate = @rate
         WHERE code = @code`
      ).run({
        code: item.code,
        name: item.name, // ✅ Update name from invoice
        qty: item.qty,
        rate: item.rate,
      });
    } else {
      // Create new stock item if it doesn't exist
      db.prepare(
        `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
         VALUES (@code, @name, @purchaseRate, @purchaseQty, 0, 0, datetime('now'))`
      ).run({
        code: item.code,
        name: item.name,
        purchaseRate: item.rate,
        purchaseQty: item.qty,
      });
    }
  }
}

// ✅ Helper function to update stock on sale invoice save
function updateStockOnSale(
  db: Database.Database,
  items: NewInvoiceItem[],
  isEdit: boolean,
  previousItems?: InvoiceItem[]
) {
  // If editing, first reverse previous stock changes
  if (isEdit && previousItems) {
    for (const prevItem of previousItems) {
      const stock = db
        .prepare(`SELECT * FROM stock WHERE code = ?`)
        .get(prevItem.code) as StockItem | undefined;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET saleQty = saleQty - @qty
           WHERE code = @code`
        ).run({
          code: prevItem.code,
          qty: prevItem.qty,
        });
      }
    }
  }

  // Apply new stock changes
  for (const item of items) {
    const stock = db
      .prepare(`SELECT * FROM stock WHERE code = ?`)
      .get(item.code) as StockItem | undefined;

    if (stock) {
      // ✅ Update stock: name, saleQty, and saleRate
      db.prepare(
        `UPDATE stock
         SET name = @name,
             saleQty = saleQty + @qty,
             saleRate = @rate
         WHERE code = @code`
      ).run({
        code: item.code,
        name: item.name, // ✅ Update name from invoice
        qty: item.qty,
        rate: item.rate,
      });
    }
  }
}

export function listSaleInvoices(): (Invoice & {totalQty: number})[] {
  return _db()
    .prepare(
      `
      SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM sale_invoices i
      LEFT JOIN sale_invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC
    `
    )
    .all() as (Invoice & {totalQty: number})[];
}

export function createSaleInvoice(input: NewInvoice) {
  const createdAt = new Date().toISOString();
  const uid = `SI-${randomUUID()}`;
  const stmt = _db().prepare(
    `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
  } as const;
}

export function deleteSaleInvoice(id: number): void {
  _db().prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}

export function getSaleInvoice(id: number): InvoiceWithItems | undefined {
  const d = _db();
  const inv = d
    .prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
    )
    .get(id) as Invoice | undefined;
  if (!inv) return undefined;
  const items = d
    .prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    )
    .all(id) as InvoiceItem[];
  return {invoice: inv, items};
}

export function saveSaleInvoice(payload: {
  id?: number;
  number: string;
  supplierName: string;
  total: number;
  address?: string;
  invoiceDate?: string;
  items: NewInvoiceItem[];
}): InvoiceWithItems {
  const d = _db();
  const tx = d.transaction((p: typeof payload) => {
    let invoiceId = p.id ?? 0;
    const createdAt = new Date().toISOString();

    // ✅ Get previous items if editing (for stock reversal)
    let previousItems: InvoiceItem[] | undefined;
    if (p.id) {
      previousItems = d
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ?`
        )
        .all(p.id) as InvoiceItem[];
    }

    if (!p.id) {
      const uid = `SI-${randomUUID()}`;
      const info = d
        .prepare(
          `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
           VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
        )
        .run({
          uid,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total,
          createdAt,
          address: p.address ?? '',
          invoiceDate: p.invoiceDate ?? null,
        });
      invoiceId = Number(info.lastInsertRowid);
    } else {
      d.prepare(
        `UPDATE sale_invoices
           SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
         WHERE id=@id`
      ).run({
        id: p.id,
        number: p.number,
        supplierName: p.supplierName,
        total: p.total,
        address: p.address ?? '',
        invoiceDate: p.invoiceDate ?? null,
      });
      d.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(p.id);
    }

    const insertItem = d.prepare(
      `INSERT INTO sale_invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
    );
    for (const it of p.items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: it.rate,
        qty: it.qty,
        position: it.position,
      });
    }

    // ✅ Update stock after invoice items are saved
    updateStockOnSale(d, p.items, !!p.id, previousItems);

    const invoice = d
      .prepare(
        `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
      )
      .get(invoiceId) as Invoice;
    const items = d
      .prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
      )
      .all(invoiceId) as InvoiceItem[];
    return {invoice, items};
  });
  return tx(payload);
}

export function ledgerSave(payload: LedgerSavePayload): {
  id?: number;
  error?: string;
} {
  const d = _db();
  const {id, customerName, contactNo, totals, rows} = payload;
  const now = new Date().toISOString();
  if (!customerName.trim()) return {error: 'CUSTOMER_REQUIRED'};

  const tx = d.transaction(() => {
    let ledgerId = id as number | undefined;
    if (!ledgerId) {
      const info = d
        .prepare(
          `INSERT INTO ledgers (customerName, contactNo, totalDebit, totalCredit, netBalance, createdAt, updatedAt)
           VALUES (@customerName, @contactNo, @totalDebit, @totalCredit, @netBalance, @createdAt, @updatedAt)`
        )
        .run({
          customerName: customerName.trim(),
          contactNo: contactNo?.trim() || '',
          totalDebit: totals.debit,
          totalCredit: totals.credit,
          netBalance: totals.net,
          createdAt: now,
          updatedAt: now,
        });
      ledgerId = Number(info.lastInsertRowid);
    } else {
      d.prepare(
        `UPDATE ledgers
         SET customerName=@customerName,
             contactNo=@contactNo,
             totalDebit=@totalDebit,
             totalCredit=@totalCredit,
             netBalance=@netBalance,
             updatedAt=@updatedAt
         WHERE id=@id`
      ).run({
        id: ledgerId,
        customerName: customerName.trim(),
        contactNo: contactNo?.trim() || '',
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        netBalance: totals.net,
        updatedAt: now,
      });
      d.prepare(`DELETE FROM ledger_rows WHERE ledgerId=?`).run(ledgerId);
    }

    const insertRow = d.prepare(`
      INSERT INTO ledger_rows (ledgerId, position, date, particulars, debit, credit, crDr)
      VALUES (@ledgerId, @position, @date, @particulars, @debit, @credit, @crDr)
    `);

    for (const r of rows) {
      insertRow.run({
        ledgerId,
        position: r.position,
        date: r.date || null,
        particulars: r.particulars || '',
        debit: r.debit || 0,
        credit: r.credit || 0,
        crDr: r.crDr,
      });
    }

    return {id: ledgerId};
  });

  return tx();
}

export function ledgerGet(ledgerId: number):
  | {
      id: number;
      customerName: string;
      contactNo: string;
      totals: {debit: number; credit: number; net: number};
      rows: {
        id: number;
        date: string;
        particulars: string;
        debit: number;
        credit: number;
        crDr: 'CR' | 'DR';
        position: number;
      }[];
    }
  | undefined {
  const d = _db();
  const ledger = d
    .prepare(
      `SELECT id, customerName, contactNo, totalDebit, totalCredit, netBalance
       FROM ledgers WHERE id=?`
    )
    .get(ledgerId) as
    | {
        id: number;
        customerName: string;
        contactNo: string;
        totalDebit: number;
        totalCredit: number;
        netBalance: number;
      }
    | undefined;
  if (!ledger) return undefined;
  const rows = d
    .prepare(
      `SELECT id, date, particulars, debit, credit, crDr, position
       FROM ledger_rows WHERE ledgerId=? ORDER BY position ASC`
    )
    .all(ledgerId) as any[];
  return {
    id: ledger.id,
    customerName: ledger.customerName,
    contactNo: ledger.contactNo,
    totals: {
      debit: ledger.totalDebit,
      credit: ledger.totalCredit,
      net: ledger.netBalance,
    },
    rows,
  };
}

export function ledgerList(): {
  id: number;
  customerName: string;
  totals: {debit: number; credit: number; net: number};
}[] {
  const list = _db()
    .prepare(
      `SELECT id, customerName, totalDebit, totalCredit, netBalance
       FROM ledgers ORDER BY id DESC`
    )
    .all() as {
    id: number;
    customerName: string;
    totalDebit: number;
    totalCredit: number;
    netBalance: number;
  }[];
  return list.map((l) => ({
    id: l.id,
    customerName: l.customerName,
    totals: {
      debit: l.totalDebit,
      credit: l.totalCredit,
      net: l.netBalance,
    },
  }));
}

export function ledgerDelete(id: number): void {
  const d = _db();
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM ledger_rows WHERE ledgerId = ?').run(id);
    d.prepare('DELETE FROM ledgers WHERE id = ?').run(id);
  });
  tx();
}

// ✅ Keep ensureSchema and getMeta unchanged
export function ensureSchema(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // ~64MB
  db.pragma('temp_store = MEMORY');

  // meta table with schema_version
  db.prepare(
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`
  ).run();
  const getVer = db.prepare(
    `SELECT value FROM meta WHERE key='schema_version'`
  );
  const setVer = db.prepare(
    `INSERT OR REPLACE INTO meta (key,value) VALUES ('schema_version', @v)`
  );

  const cur = getVer.get() as unknown;
  const v = (() => {
    const val = (cur as any)?.value;
    return typeof val === 'string' && val.trim() ? Number(val) : 0;
  })();

  const createBaseSchema = () => {
    // Invoices
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE,
        number TEXT NOT NULL,
        supplierName TEXT NOT NULL,
        total REAL NOT NULL,
        createdAt TEXT NOT NULL,
        address TEXT DEFAULT '',
        invoiceDate TEXT
      )
    `
    ).run();

    // Invoice items
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        rate REAL NOT NULL,
        qty REAL NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY(invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `
    ).run();

    // Stock
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        purchaseRate REAL NOT NULL,
        purchaseQty REAL NOT NULL,
        saleRate REAL NOT NULL,
        saleQty REAL NOT NULL,
        createdAt TEXT NOT NULL
      )
    `
    ).run();

    // Sale invoices
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS sale_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE,
        number TEXT NOT NULL,
        supplierName TEXT NOT NULL,
        total REAL NOT NULL,
        createdAt TEXT NOT NULL,
        address TEXT DEFAULT '',
        invoiceDate TEXT
      )
    `
    ).run();

    // Sale invoice items
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS sale_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        rate REAL NOT NULL,
        qty REAL NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY(invoiceId) REFERENCES sale_invoices(id) ON DELETE CASCADE
      )
    `
    ).run();

    // Ledgers
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS ledgers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customerName TEXT NOT NULL,
        contactNo TEXT,
        totalDebit REAL DEFAULT 0,
        totalCredit REAL DEFAULT 0,
        netBalance REAL DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `
    ).run();

    // Ledger rows
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS ledger_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ledgerId INTEGER NOT NULL,
        position INTEGER NOT NULL,
        date TEXT,
        particulars TEXT,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        crDr TEXT,
        FOREIGN KEY(ledgerId) REFERENCES ledgers(id) ON DELETE CASCADE
      )
    `
    ).run();

    // Indexes
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoiceId ON sale_invoice_items(invoiceId)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invoice_items_position ON invoice_items(invoiceId, position)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_position ON sale_invoice_items(invoiceId, position)`
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_code ON stock(code)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ledger_rows_ledgerId ON ledger_rows(ledgerId)`
    ).run();
  };

  const hardenSchema = () => {
    const ensureCols = (table: string, defs: {name: string; ddl: string}[]) => {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
      }[];
      for (const d of defs) {
        if (!cols.find((c) => c.name === d.name)) {
          db.prepare(`ALTER TABLE ${table} ADD COLUMN ${d.ddl}`).run();
        }
      }
    };

    ensureCols('invoices', [
      {name: 'uid', ddl: 'uid TEXT'},
      {name: 'number', ddl: "number TEXT DEFAULT ''"},
      {name: 'supplierName', ddl: "supplierName TEXT DEFAULT ''"},
      {name: 'total', ddl: 'total REAL DEFAULT 0'},
      {name: 'createdAt', ddl: 'createdAt TEXT DEFAULT CURRENT_TIMESTAMP'},
      {name: 'address', ddl: "address TEXT DEFAULT ''"},
      {name: 'invoiceDate', ddl: 'invoiceDate TEXT'},
    ]);

    ensureCols('invoice_items', [
      {name: 'code', ddl: 'code TEXT'},
      {name: 'name', ddl: 'name TEXT'},
      {name: 'rate', ddl: 'rate REAL DEFAULT 0'},
      {name: 'qty', ddl: 'qty REAL DEFAULT 0'},
      {name: 'position', ddl: 'position INTEGER DEFAULT 0'},
    ]);

    ensureCols('stock', [
      {name: 'code', ddl: 'code TEXT'},
      {name: 'name', ddl: 'name TEXT'},
      {name: 'purchaseRate', ddl: 'purchaseRate REAL DEFAULT 0'},
      {name: 'purchaseQty', ddl: 'purchaseQty REAL DEFAULT 0'},
      {name: 'saleRate', ddl: 'saleRate REAL DEFAULT 0'},
      {name: 'saleQty', ddl: 'saleQty REAL DEFAULT 0'},
      {name: 'createdAt', ddl: 'createdAt TEXT DEFAULT CURRENT_TIMESTAMP'},
    ]);

    ensureCols('sale_invoices', [
      {name: 'uid', ddl: 'uid TEXT'},
      {name: 'number', ddl: "number TEXT DEFAULT ''"},
      {name: 'supplierName', ddl: "supplierName TEXT DEFAULT ''"},
      {name: 'total', ddl: 'total REAL DEFAULT 0'},
      {name: 'createdAt', ddl: 'createdAt TEXT DEFAULT CURRENT_TIMESTAMP'},
      {name: 'address', ddl: "address TEXT DEFAULT ''"},
      {name: 'invoiceDate', ddl: 'invoiceDate TEXT'},
    ]);

    ensureCols('sale_invoice_items', [
      {name: 'code', ddl: 'code TEXT'},
      {name: 'name', ddl: 'name TEXT'},
      {name: 'rate', ddl: 'rate REAL DEFAULT 0'},
      {name: 'qty', ddl: 'qty REAL DEFAULT 0'},
      {name: 'position', ddl: 'position INTEGER DEFAULT 0'},
    ]);

    // Ensure indexes (idempotent)
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoiceId ON sale_invoice_items(invoiceId)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invoice_items_position ON invoice_items(invoiceId, position)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_position ON sale_invoice_items(invoiceId, position)`
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_code ON stock(code)`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ledger_rows_ledgerId ON ledger_rows(ledgerId)`
    ).run();
  };

  db.prepare('BEGIN').run();
  try {
    if (v === 0) createBaseSchema();
    hardenSchema();
    if (v === 0) setVer.run({v: '1'});
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

// Optionally, you can call ensureSchema(db) inside initDatabase for the single-db mode

export function getMeta(
  db: Database.Database,
  key: string
): string | undefined {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key=?`)
    .get(key) as unknown;
  if (row && typeof (row as any).value === 'string')
    return (row as any).value as string;
  return undefined;
}
// usage: const name = getMeta(db, 'name');
