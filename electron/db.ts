import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

export type NewInvoice = {
  supplierName: string;
  total: number;
  number: string; // user-provided invoice number
};

export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
};

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
}

export function listInvoices(): Invoice[] {
  return db
    .prepare(
      `SELECT id, number, supplierName, total, createdAt FROM invoices ORDER BY id DESC`
    )
    .all() as Invoice[];
}

export function createInvoice(input: NewInvoice) {
  const createdAt = new Date().toISOString();
  const uid = `PI-${Date.now()}`; // internal unique id
  const stmt = db.prepare(
    `INSERT INTO invoices (uid, number, supplierName, total, createdAt)
     VALUES (@uid, @number, @supplierName, @total, @createdAt)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
  } as const;
}

export function deleteInvoice(id: number): void {
  db.prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}
