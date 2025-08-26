import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';

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

let db: Database.Database;

export function initDatabase(dataDir: string) {
  const dbPath = path.join(dataDir, 'app.db');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT UNIQUE,
      number TEXT NOT NULL,
      supplierName TEXT NOT NULL,
      total REAL NOT NULL,
      createdAt TEXT NOT NULL
    )
  `
  ).run();
  // Migration: add `uid` if missing
  const cols = db.prepare(`PRAGMA table_info(invoices)`).all() as {
    name: string;
  }[];
  if (!cols.find((c) => c.name === 'uid')) {
    db.prepare(`ALTER TABLE invoices ADD COLUMN uid TEXT`).run();
  }
  // Backfill uid where missing
  db.prepare(
    `UPDATE invoices SET uid = 'PI-' || CAST(strftime('%s','now') AS TEXT) || '-' || id WHERE uid IS NULL`
  ).run();

  // New migrations: add address and invoiceDate if missing
  if (!cols.find((c) => c.name === 'address')) {
    db.prepare(`ALTER TABLE invoices ADD COLUMN address TEXT DEFAULT ''`).run();
  }
  if (!cols.find((c) => c.name === 'invoiceDate')) {
    db.prepare(`ALTER TABLE invoices ADD COLUMN invoiceDate TEXT`).run();
  }

  // Stock table
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

  // New: invoice_items table
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

  // +++ Sales: separate tables
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
}

// Make list include address, invoiceDate and totalQty (sum of items.qty)
export function listInvoices(): (Invoice & {totalQty: number})[] {
  return db
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
  const stmt = db.prepare(
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
  db.prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}

// Stock CRUD
export function listStock(): StockItem[] {
  return db
    .prepare(
      `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt FROM stock ORDER BY id ASC`
    )
    .all() as StockItem[];
}

export function createStock(input: NewStockItem): StockItem {
  const createdAt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
       VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, @createdAt)`
    )
    .run({...input, createdAt});
  return {id: Number(info.lastInsertRowid), createdAt, ...input};
}

export function updateStock(id: number, input: NewStockItem): StockItem {
  db.prepare(
    `UPDATE stock SET code=@code, name=@name, purchaseRate=@purchaseRate, purchaseQty=@purchaseQty, saleRate=@saleRate, saleQty=@saleQty WHERE id=@id`
  ).run({id, ...input});
  const row = db
    .prepare(
      `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt FROM stock WHERE id = ?`
    )
    .get(id) as StockItem | undefined;
  if (!row) throw new Error('Stock item not found after update');
  return row;
}

export function deleteStock(id: number): void {
  db.prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}

// New: get invoice with items
export function getInvoice(id: number): InvoiceWithItems | undefined {
  const inv = db
    .prepare(
      `SELECT id, number, supplierName, total, createdAt FROM invoices WHERE id = ?`
    )
    .get(id) as Invoice | undefined;
  if (!inv) return undefined;
  const items = db
    .prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    )
    .all(id) as InvoiceItem[];
  return {invoice: inv, items};
}

// New: create or update invoice with items (transaction)
export function saveInvoice(payload: {
  id?: number;
  number: string;
  supplierName: string;
  total: number;
  address?: string;
  invoiceDate?: string;
  items: NewInvoiceItem[];
}): InvoiceWithItems {
  const tx = db.transaction(
    (p: {
      id?: number;
      number: string;
      supplierName: string;
      total: number;
      address?: string;
      invoiceDate?: string;
      items: NewInvoiceItem[];
    }) => {
      let invoiceId = p.id ?? 0;
      const createdAt = new Date().toISOString();

      if (!p.id) {
        const uid = `PI-${randomUUID()}`;
        const info = db
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
        db.prepare(
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
        db.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);
      }

      const insertItem = db.prepare(
        `INSERT INTO invoice_items (invoiceId, code, name, rate, qty, position)
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

      const invoice = db
        .prepare(
          `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
        )
        .get(invoiceId) as Invoice;
      const items = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
        )
        .all(invoiceId) as InvoiceItem[];
      return {invoice, items};
    }
  );
  return tx(payload);
}

// +++ Sales CRUD (separate from purchase)
export function listSaleInvoices(): (Invoice & {totalQty: number})[] {
  return db
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
  const stmt = db.prepare(
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
  db.prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}

export function getSaleInvoice(id: number): InvoiceWithItems | undefined {
  const inv = db
    .prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
    )
    .get(id) as Invoice | undefined;
  if (!inv) return undefined;
  const items = db
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
  const tx = db.transaction(
    (p: {
      id?: number;
      number: string;
      supplierName: string;
      total: number;
      address?: string;
      invoiceDate?: string;
      items: NewInvoiceItem[];
    }) => {
      let invoiceId = p.id ?? 0;
      const createdAt = new Date().toISOString();

      if (!p.id) {
        const uid = `SI-${randomUUID()}`;
        const info = db
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
        db.prepare(
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
        db.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(
          p.id
        );
      }

      const insertItem = db.prepare(
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

      const invoice = db
        .prepare(
          `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
        )
        .get(invoiceId) as Invoice;
      const items = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
        )
        .all(invoiceId) as InvoiceItem[];
      return {invoice, items};
    }
  );
  return tx(payload);
}
