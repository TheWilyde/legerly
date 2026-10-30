import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  ensureSchema,
  getActivePeriod,
  saveInvoice,
  saveSaleInvoice,
} from "../db";

const KEY = Buffer.alloc(32, 7);

describe("legacy database migrations", () => {
  const openedDbs: Database.Database[] = [];

  afterEach(() => {
    for (const db of openedDbs.splice(0, openedDbs.length)) {
      db.close();
    }
  });

  function freshRawDb() {
    const db = new Database(":memory:");
    openedDbs.push(db);
    return db;
  }

  it("rebuilds legacy stock snapshot schema before creating periodId indexes", () => {
    const db = freshRawDb();

    db.exec(`
      CREATE TABLE stock_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capturedAt TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE stock_snapshot_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stockCode TEXT NOT NULL,
        qty INTEGER DEFAULT 0
      );
    `);

    expect(() => ensureSchema(db)).not.toThrow();

    const snapshotCols = db
      .prepare(`PRAGMA table_info(stock_snapshots)`)
      .all() as Array<{ name: string }>;
    expect(snapshotCols.some((col) => col.name === "periodId")).toBe(true);

    const indexRows = db
      .prepare(`PRAGMA index_list(stock_snapshots)`)
      .all() as Array<{ name: string }>;
    expect(
      indexRows.some((idx) => idx.name === "idx_stock_snapshots_period_id"),
    ).toBe(true);
  });

  it("adds and backfills periodId for legacy invoice tables", () => {
    const db = freshRawDb();

    db.exec(`
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT,
        invoiceDate TEXT,
        supplierName TEXT,
        total TEXT DEFAULT '0',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE sale_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT,
        invoiceDate TEXT,
        customerName TEXT,
        total TEXT DEFAULT '0',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.prepare(
      `INSERT INTO invoices (invoiceNumber, invoiceDate, supplierName, total)
       VALUES (?, ?, ?, ?)`,
    ).run("L-1001", "2026-03-10", "Legacy Supplier", "120");

    db.prepare(
      `INSERT INTO sale_invoices (invoiceNumber, invoiceDate, customerName, total)
       VALUES (?, ?, ?, ?)`,
    ).run("SL-1001", "2026-03-11", "Legacy Customer", "220");

    expect(() => ensureSchema(db)).not.toThrow();

    const invoiceCols = db
      .prepare(`PRAGMA table_info(invoices)`)
      .all() as Array<{ name: string }>;
    const saleCols = db
      .prepare(`PRAGMA table_info(sale_invoices)`)
      .all() as Array<{ name: string }>;

    expect(invoiceCols.some((col) => col.name === "periodId")).toBe(true);
    expect(saleCols.some((col) => col.name === "periodId")).toBe(true);
    expect(invoiceCols.some((col) => col.name === "invoiceSequence")).toBe(
      true,
    );
    expect(saleCols.some((col) => col.name === "invoiceSequence")).toBe(true);

    const purchaseRows = db
      .prepare(`SELECT periodId, invoiceNumber, invoiceSequence FROM invoices`)
      .all() as Array<{
      periodId: number | null;
      invoiceNumber: string | null;
      invoiceSequence: number | null;
    }>;
    const saleRows = db
      .prepare(
        `SELECT periodId, invoiceNumber, invoiceSequence FROM sale_invoices`,
      )
      .all() as Array<{
      periodId: number | null;
      invoiceNumber: string | null;
      invoiceSequence: number | null;
    }>;

    expect(purchaseRows.every((row) => Number(row.periodId) > 0)).toBe(true);
    expect(saleRows.every((row) => Number(row.periodId) > 0)).toBe(true);

    // Backward compatibility: non-numeric legacy numbers remain untouched
    expect(purchaseRows[0]?.invoiceNumber).toBe("L-1001");
    expect(purchaseRows[0]?.invoiceSequence).toBeNull();
    expect(saleRows[0]?.invoiceNumber).toBe("SL-1001");
    expect(saleRows[0]?.invoiceSequence).toBeNull();
  });

  it("backfills periodId even when legacy invoices are missing invoiceDate and createdAt", () => {
    const db = freshRawDb();

    db.exec(`
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT,
        total TEXT DEFAULT '0'
      );

      CREATE TABLE sale_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT,
        total TEXT DEFAULT '0'
      );
    `);

    db.prepare(`INSERT INTO invoices (invoiceNumber, total) VALUES (?, ?)`).run(
      "L-2001",
      "140",
    );
    db.prepare(
      `INSERT INTO sale_invoices (invoiceNumber, total) VALUES (?, ?)`,
    ).run("SL-2001", "260");

    expect(() => ensureSchema(db)).not.toThrow();

    const purchaseRow = db
      .prepare(
        `SELECT periodId, invoiceNumber, invoiceSequence FROM invoices LIMIT 1`,
      )
      .get() as {
      periodId?: number;
      invoiceNumber?: string | null;
      invoiceSequence?: number | null;
    };
    const saleRow = db
      .prepare(
        `SELECT periodId, invoiceNumber, invoiceSequence FROM sale_invoices LIMIT 1`,
      )
      .get() as {
      periodId?: number;
      invoiceNumber?: string | null;
      invoiceSequence?: number | null;
    };

    expect(Number(purchaseRow?.periodId ?? 0)).toBeGreaterThan(0);
    expect(Number(saleRow?.periodId ?? 0)).toBeGreaterThan(0);
    expect(purchaseRow?.invoiceNumber).toBe("L-2001");
    expect(saleRow?.invoiceNumber).toBe("SL-2001");
    expect(purchaseRow?.invoiceSequence ?? null).toBeNull();
    expect(saleRow?.invoiceSequence ?? null).toBeNull();
  });

  it("is idempotent when migration is run more than once", () => {
    const db = freshRawDb();

    db.exec(`
      CREATE TABLE stock_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capturedAt TEXT NOT NULL
      );
    `);

    expect(() => ensureSchema(db)).not.toThrow();
    expect(() => ensureSchema(db)).not.toThrow();
  });

  it("saves and posts purchase and sale drafts after migrating a legacy schema", () => {
    const db = freshRawDb();
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT,
        invoiceSequence INTEGER,
        invoiceIdPerPeriod INTEGER,
        invoiceDate TEXT,
        supplierName TEXT,
        total TEXT DEFAULT '0',
        totalQty INTEGER DEFAULT 0,
        status TEXT DEFAULT 'draft',
        periodId INTEGER,
        address TEXT,
        contactNo TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER,
        code TEXT,
        name TEXT,
        rate TEXT DEFAULT '0',
        qty INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0
      );

      CREATE TABLE sale_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT,
        invoiceSequence INTEGER,
        invoiceIdPerPeriod INTEGER,
        invoiceDate TEXT,
        customerName TEXT,
        total TEXT DEFAULT '0',
        totalQty INTEGER DEFAULT 0,
        status TEXT DEFAULT 'draft',
        periodId INTEGER,
        address TEXT,
        contactNo TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE sale_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER,
        code TEXT,
        name TEXT,
        rate TEXT DEFAULT '0',
        qty INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0
      );

      CREATE TABLE stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT,
        purchaseRate TEXT DEFAULT '0',
        purchaseQty INTEGER DEFAULT 0,
        saleRate TEXT DEFAULT '0',
        saleQty INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    ensureSchema(db, KEY);
    const invoiceDate = getActivePeriod(db)!.startDate;

    const purchaseDraft = saveInvoice(
      {
        number: "1",
        supplierName: "Post-migration Supplier",
        invoiceDate,
        status: "draft",
        items: [
          { code: "MIG-1", name: "Migrated item", rate: 12.34, qty: 4, position: 0 },
        ],
      },
      db,
      KEY,
    );
    expect(purchaseDraft.invoice.status).toBe("draft");
    expect(db.prepare("SELECT COUNT(*) AS count FROM stock").get()).toEqual({ count: 0 });

    const purchasePosted = saveInvoice(
      {
        id: purchaseDraft.invoice.id,
        version: purchaseDraft.invoice.version,
        number: purchaseDraft.invoice.number,
        supplierName: purchaseDraft.invoice.supplierName,
        invoiceDate,
        status: "posted",
        items: purchaseDraft.items,
      },
      db,
      KEY,
    );
    expect(purchasePosted.invoice.status).toBe("posted");
    expect(
      db.prepare("SELECT purchaseQty, saleQty FROM stock WHERE code = 'MIG-1'").get(),
    ).toEqual({ purchaseQty: 4, saleQty: 0 });

    const saleDraft = saveSaleInvoice(
      {
        number: "1",
        customerName: "Post-migration Customer",
        invoiceDate,
        status: "draft",
        items: [
          { code: "MIG-1", name: "Migrated item", rate: 20, qty: 3, position: 0 },
        ],
      },
      db,
      KEY,
    );
    expect(saleDraft.invoice.status).toBe("draft");
    expect(
      db.prepare("SELECT purchaseQty, saleQty FROM stock WHERE code = 'MIG-1'").get(),
    ).toEqual({ purchaseQty: 4, saleQty: 0 });

    const salePosted = saveSaleInvoice(
      {
        id: saleDraft.invoice.id,
        version: saleDraft.invoice.version,
        number: saleDraft.invoice.number,
        customerName: "Post-migration Customer",
        invoiceDate,
        status: "posted",
        items: saleDraft.items,
      },
      db,
      KEY,
    );
    expect(salePosted.invoice.status).toBe("posted");
    expect(
      db.prepare("SELECT purchaseQty, saleQty FROM stock WHERE code = 'MIG-1'").get(),
    ).toEqual({ purchaseQty: 4, saleQty: 3 });
    expect(
      db
        .prepare(
          `SELECT invoiceKind, quantityDelta, reason
           FROM stock_movements
           WHERE stockCode = 'MIG-1'
           ORDER BY id`,
        )
        .all(),
    ).toEqual([
      { invoiceKind: "purchase", quantityDelta: 4, reason: "posting" },
      { invoiceKind: "sale", quantityDelta: -3, reason: "posting" },
    ]);
  });
});
