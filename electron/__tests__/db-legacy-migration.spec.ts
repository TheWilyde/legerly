import {afterEach, describe, expect, it} from 'vitest';
import Database from 'better-sqlite3';
import {ensureSchema} from '../db';

describe('legacy database migrations', () => {
  const openedDbs: Database.Database[] = [];

  afterEach(() => {
    for (const db of openedDbs.splice(0, openedDbs.length)) {
      db.close();
    }
  });

  function freshRawDb() {
    const db = new Database(':memory:');
    openedDbs.push(db);
    return db;
  }

  it('rebuilds legacy stock snapshot schema before creating periodId indexes', () => {
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

    const snapshotCols = db.prepare(`PRAGMA table_info(stock_snapshots)`).all() as Array<{name: string}>;
    expect(snapshotCols.some((col) => col.name === 'periodId')).toBe(true);

    const indexRows = db.prepare(`PRAGMA index_list(stock_snapshots)`).all() as Array<{name: string}>;
    expect(indexRows.some((idx) => idx.name === 'idx_stock_snapshots_period_id')).toBe(true);
  });

  it('adds and backfills periodId for legacy invoice tables', () => {
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
    ).run('L-1001', '2026-03-10', 'Legacy Supplier', '120');

    db.prepare(
      `INSERT INTO sale_invoices (invoiceNumber, invoiceDate, customerName, total)
       VALUES (?, ?, ?, ?)`,
    ).run('SL-1001', '2026-03-11', 'Legacy Customer', '220');

    expect(() => ensureSchema(db)).not.toThrow();

    const invoiceCols = db.prepare(`PRAGMA table_info(invoices)`).all() as Array<{name: string}>;
    const saleCols = db.prepare(`PRAGMA table_info(sale_invoices)`).all() as Array<{name: string}>;

    expect(invoiceCols.some((col) => col.name === 'periodId')).toBe(true);
    expect(saleCols.some((col) => col.name === 'periodId')).toBe(true);

    const purchaseRows = db.prepare(`SELECT periodId FROM invoices`).all() as Array<{periodId: number | null}>;
    const saleRows = db.prepare(`SELECT periodId FROM sale_invoices`).all() as Array<{periodId: number | null}>;

    expect(purchaseRows.every((row) => Number(row.periodId) > 0)).toBe(true);
    expect(saleRows.every((row) => Number(row.periodId) > 0)).toBe(true);
  });

  it('backfills periodId even when legacy invoices are missing invoiceDate and createdAt', () => {
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
      'L-2001',
      '140',
    );
    db.prepare(`INSERT INTO sale_invoices (invoiceNumber, total) VALUES (?, ?)`).run(
      'SL-2001',
      '260',
    );

    expect(() => ensureSchema(db)).not.toThrow();

    const purchaseRow = db.prepare(`SELECT periodId FROM invoices LIMIT 1`).get() as {periodId?: number};
    const saleRow = db.prepare(`SELECT periodId FROM sale_invoices LIMIT 1`).get() as {periodId?: number};

    expect(Number(purchaseRow?.periodId ?? 0)).toBeGreaterThan(0);
    expect(Number(saleRow?.periodId ?? 0)).toBeGreaterThan(0);
  });

  it('is idempotent when migration is run more than once', () => {
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
});
