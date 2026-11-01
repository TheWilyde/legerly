import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  deleteStock,
  ensureSchema,
  getActivePeriod,
  listInvoices,
  listStock,
  saveInvoice,
} from "../db";
import { encryptionService } from "../encryption";

const TEST_KEY = Buffer.alloc(32, 7);

/**
 * Objects the 1.0.1 - 1.0.3 "invoice integrity" migration left on profile
 * databases. Replayed verbatim so the compatibility pass is tested against the
 * shape real client data actually has.
 */
function applyWithdrawnMigration(db: Database.Database, version = 4) {
  db.exec(`
    ALTER TABLE invoices ADD COLUMN totalMinor TEXT;
    ALTER TABLE invoices ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE sale_invoices ADD COLUMN totalMinor TEXT;
    ALTER TABLE sale_invoices ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE invoice_items ADD COLUMN rateMinor TEXT;
    ALTER TABLE sale_invoice_items ADD COLUMN rateMinor TEXT;
    ALTER TABLE stock ADD COLUMN purchaseRateMinor TEXT;
    ALTER TABLE stock ADD COLUMN saleRateMinor TEXT;
    ALTER TABLE stock ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS app_schema (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      migratedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceKind TEXT CHECK(invoiceKind IN ('purchase', 'sale')),
      invoiceId INTEGER,
      invoiceRevision INTEGER NOT NULL DEFAULT 1,
      linePosition INTEGER NOT NULL DEFAULT 0,
      stockCode TEXT NOT NULL,
      quantityDelta INTEGER NOT NULL CHECK(quantityDelta <> 0),
      unitRateMinor TEXT NOT NULL,
      effectiveDate TEXT NOT NULL,
      reason TEXT NOT NULL CHECK(reason IN ('posting', 'reversal', 'adjustment', 'migration_adjustment')),
      reversesMovementId INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(reversesMovementId) REFERENCES stock_movements(id),
      UNIQUE(invoiceKind, invoiceId, invoiceRevision, linePosition, reason, reversesMovementId)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_movements_code
      ON stock_movements(stockCode, effectiveDate, id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_invoice
      ON stock_movements(invoiceKind, invoiceId, invoiceRevision);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_items_position
      ON invoice_items(invoiceId, position);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_invoice_items_position
      ON sale_invoice_items(invoiceId, position);

    CREATE TRIGGER IF NOT EXISTS invoice_items_integrity_insert
    BEFORE INSERT ON invoice_items
    WHEN NEW.invoiceId IS NULL OR TRIM(COALESCE(NEW.code, '')) = ''
      OR TRIM(COALESCE(NEW.name, '')) = '' OR NEW.qty <= 0
      OR NEW.qty != CAST(NEW.qty AS INTEGER) OR NEW.position < 0
    BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice item'); END;

    CREATE TRIGGER IF NOT EXISTS invoice_items_integrity_update
    BEFORE UPDATE ON invoice_items
    WHEN NEW.invoiceId IS NULL OR TRIM(COALESCE(NEW.code, '')) = ''
      OR TRIM(COALESCE(NEW.name, '')) = '' OR NEW.qty <= 0
      OR NEW.qty != CAST(NEW.qty AS INTEGER) OR NEW.position < 0
    BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice item'); END;

    CREATE TRIGGER IF NOT EXISTS sale_invoice_items_integrity_insert
    BEFORE INSERT ON sale_invoice_items
    WHEN NEW.invoiceId IS NULL OR NEW.qty <= 0
    BEGIN SELECT RAISE(ABORT, 'invalid sale invoice item'); END;

    CREATE TRIGGER IF NOT EXISTS sale_invoice_items_integrity_update
    BEFORE UPDATE ON sale_invoice_items
    WHEN NEW.invoiceId IS NULL OR NEW.qty <= 0
    BEGIN SELECT RAISE(ABORT, 'invalid sale invoice item'); END;

    CREATE TRIGGER IF NOT EXISTS invoices_integrity_insert
    BEFORE INSERT ON invoices
    WHEN TRIM(COALESCE(NEW.invoiceNumber, '')) = ''
      OR TRIM(COALESCE(NEW.supplierName, '')) = ''
      OR NEW.invoiceDate IS NULL OR NEW.status NOT IN ('draft', 'posted')
    BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice'); END;

    CREATE TRIGGER IF NOT EXISTS invoices_integrity_update
    BEFORE UPDATE ON invoices
    WHEN TRIM(COALESCE(NEW.invoiceNumber, '')) = ''
      OR TRIM(COALESCE(NEW.supplierName, '')) = ''
      OR NEW.invoiceDate IS NULL OR NEW.status NOT IN ('draft', 'posted')
    BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice'); END;

    CREATE TRIGGER IF NOT EXISTS sale_invoices_integrity_insert
    BEFORE INSERT ON sale_invoices
    WHEN TRIM(COALESCE(NEW.customerName, '')) = ''
      OR NEW.invoiceDate IS NULL
    BEGIN SELECT RAISE(ABORT, 'invalid sale invoice'); END;

    CREATE TRIGGER IF NOT EXISTS sale_invoices_integrity_update
    BEFORE UPDATE ON sale_invoices
    WHEN TRIM(COALESCE(NEW.customerName, '')) = ''
      OR NEW.invoiceDate IS NULL
    BEGIN SELECT RAISE(ABORT, 'invalid sale invoice'); END;
  `);

  db.prepare(
    `INSERT INTO app_schema (id, version, migratedAt) VALUES (1, ?, CURRENT_TIMESTAMP)`,
  ).run(version);
}

function countObject(
  db: Database.Database,
  type: "trigger" | "index" | "table",
  name: string,
): number {
  return Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = ? AND name = ?`,
        )
        .get(type, name) as { count: number }
    ).count,
  );
}

describe("legacy schema compatibility", () => {
  const openedDbs: Database.Database[] = [];

  afterEach(() => {
    for (const db of openedDbs.splice(0, openedDbs.length)) {
      db.close();
    }
  });

  /** A database as a 1.0.1 - 1.0.3 client left it, reopened by this version. */
  function clientDb(version = 4) {
    const db = new Database(":memory:");
    openedDbs.push(db);
    ensureSchema(db);
    applyWithdrawnMigration(db, version);
    return db;
  }

  function activeDate(db: Database.Database): string {
    const active = getActivePeriod(db);
    if (!active) throw new Error("Expected active period");
    return active.startDate;
  }

  it("is a no-op on a database this version created", () => {
    const db = new Database(":memory:");
    openedDbs.push(db);

    const report = ensureSchema(db);

    expect(report.changed).toBe(false);
    expect(report.schemaVersionFound).toBe(0);
    expect(report.droppedTriggers).toEqual([]);
    expect(report.droppedIndexes).toEqual([]);
  });

  it("removes the withdrawn triggers, constraint indexes and version stamp", () => {
    const db = clientDb();

    const report = ensureSchema(db);

    expect(report.schemaVersionFound).toBe(4);
    expect(report.changed).toBe(true);
    expect(report.droppedTriggers).toHaveLength(8);
    expect(report.clearedSchemaStamp).toBe(true);

    for (const trigger of [
      "invoice_items_integrity_insert",
      "invoice_items_integrity_update",
      "sale_invoice_items_integrity_insert",
      "sale_invoice_items_integrity_update",
      "invoices_integrity_insert",
      "invoices_integrity_update",
      "sale_invoices_integrity_insert",
      "sale_invoices_integrity_update",
    ]) {
      expect(countObject(db, "trigger", trigger)).toBe(0);
    }
    expect(countObject(db, "index", "idx_invoice_items_position")).toBe(0);
    expect(countObject(db, "index", "idx_sale_invoice_items_position")).toBe(0);

    // The stamp must be gone so a future upgrade reruns its own backfill
    // instead of trusting the minor-unit columns this version leaves empty.
    expect(
      db.prepare(`SELECT COUNT(*) AS count FROM app_schema`).get(),
    ).toEqual({ count: 0 });

    // This version's own period triggers must survive untouched.
    expect(countObject(db, "trigger", "periods_no_overlap_insert")).toBe(1);
    expect(countObject(db, "trigger", "periods_no_overlap_update")).toBe(1);
  });

  it("keeps working on a database stamped with the earlier schema 3", () => {
    const db = clientDb(3);

    const report = ensureSchema(db);

    expect(report.schemaVersionFound).toBe(3);
    expect(report.droppedTriggers).toHaveLength(8);
  });

  it("preserves every added column and the audit rows", () => {
    const db = clientDb();
    db.prepare(
      `INSERT INTO stock_movements (
        invoiceKind, invoiceId, linePosition, stockCode, quantityDelta,
        unitRateMinor, effectiveDate, reason
      ) VALUES ('purchase', 1, 0, 'A1', 5, 'enc', '2026-10-30', 'posting')`,
    ).run();

    const report = ensureSchema(db);

    expect(report.parkedStockMovements).toBe(1);
    // Nothing the user entered is discarded: the ledger is parked, not dropped.
    expect(countObject(db, "table", "stock_movements")).toBe(0);
    expect(countObject(db, "table", "stock_movements_parked_v4")).toBe(1);
    expect(
      db
        .prepare(`SELECT COUNT(*) AS count FROM stock_movements_parked_v4`)
        .get(),
    ).toEqual({ count: 1 });

    const invoiceColumns = (
      db.prepare(`PRAGMA table_info(invoices)`).all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    expect(invoiceColumns).toContain("totalMinor");
    expect(invoiceColumns).toContain("version");
  });

  it("restores stock the newer release had soft deleted", () => {
    const db = clientDb();
    db.prepare(
      `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, archived)
       VALUES ('A1', 'Widget', ?, 10, ?, 0, 1)`,
    ).run(
      encryptionService.encrypt("50", TEST_KEY),
      encryptionService.encrypt("75", TEST_KEY),
    );

    const report = ensureSchema(db);

    expect(report.unarchivedStockItems).toBe(1);
    const stock = listStock(db, TEST_KEY);
    expect(stock).toHaveLength(1);
    expect(stock[0].code).toBe("A1");
    // Deleting it here is a real delete again, as this version intends.
    deleteStock(stock[0].id, db, TEST_KEY);
    expect(listStock(db, TEST_KEY)).toHaveLength(0);
  });

  it("accepts the writes the withdrawn triggers rejected", () => {
    const db = clientDb();
    ensureSchema(db);

    // Fractional quantities: permitted here, aborted by the withdrawn triggers.
    const saved = saveInvoice(
      {
        number: "1",
        supplierName: "Supplier A",
        total: 125,
        invoiceDate: activeDate(db),
        items: [
          { code: "A1", name: "Widget", rate: 50, qty: 2.5, position: 0 },
        ],
        status: "posted",
      },
      db,
      TEST_KEY,
    );
    expect(saved.invoice.id).toBeGreaterThan(0);

    const invoices = listInvoices(db, TEST_KEY);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].total).toBe(125);
  });

  it("allows the periodId backfill on legacy invoices that have no date", () => {
    // A dateless row from an old version, then the withdrawn migration on top:
    // the order real client databases are in.
    const db = new Database(":memory:");
    openedDbs.push(db);
    ensureSchema(db);
    db.prepare(
      `INSERT INTO invoices (invoiceNumber, supplierName, total, totalQty, status, invoiceDate)
       VALUES ('LEGACY-1', ?, ?, 1, 'posted', NULL)`,
    ).run(
      encryptionService.encrypt("Supplier A", TEST_KEY),
      encryptionService.encrypt("100", TEST_KEY),
    );
    applyWithdrawnMigration(db);

    ensureSchema(db);

    const invoiceId = Number(
      (
        db
          .prepare(`SELECT id FROM invoices WHERE invoiceNumber = 'LEGACY-1'`)
          .get() as { id: number }
      ).id,
    );
    const period = getActivePeriod(db);
    expect(period).toBeDefined();

    // The withdrawn invoices_integrity_update trigger aborted exactly this
    // statement, which is how the app assigns a period to legacy rows.
    expect(() =>
      db
        .prepare(`UPDATE invoices SET periodId = ? WHERE id = ?`)
        .run(period!.id, invoiceId),
    ).not.toThrow();
  });

  it("reads money written by the newer release from the legacy columns", () => {
    const db = clientDb();
    db.prepare(
      `INSERT INTO invoices (
        invoiceNumber, supplierName, total, totalMinor, totalQty, status, invoiceDate, version
      ) VALUES ('NEWER-1', ?, ?, ?, 2, 'posted', ?, 3)`,
    ).run(
      encryptionService.encrypt("Supplier A", TEST_KEY),
      encryptionService.encrypt("1234.56", TEST_KEY),
      encryptionService.encrypt("123456", TEST_KEY),
      "2026-10-30",
    );

    ensureSchema(db);

    const invoice = listInvoices(db, TEST_KEY).find(
      (row) => row.number === "NEWER-1",
    );
    expect(invoice?.total).toBe(1234.56);
  });

  it("is idempotent across repeated opens", () => {
    const db = clientDb();

    expect(ensureSchema(db).changed).toBe(true);
    const second = ensureSchema(db);
    expect(second.changed).toBe(false);
    expect(second.droppedTriggers).toEqual([]);
    expect(second.parkedStockMovements).toBe(0);
  });

  it("merges a second round trip into the parked ledger", () => {
    const db = clientDb();
    db.prepare(
      `INSERT INTO stock_movements (
        invoiceKind, invoiceId, linePosition, stockCode, quantityDelta,
        unitRateMinor, effectiveDate, reason
      ) VALUES ('purchase', 1, 0, 'A1', 5, 'enc', '2026-10-30', 'posting')`,
    ).run();
    ensureSchema(db);

    // The user goes forward to the newer release once more, then back here.
    applyWithdrawnMigration2(db);
    db.prepare(
      `INSERT INTO stock_movements (
        invoiceKind, invoiceId, linePosition, stockCode, quantityDelta,
        unitRateMinor, effectiveDate, reason
      ) VALUES ('sale', 2, 0, 'A1', -3, 'enc', '2026-11-01', 'posting')`,
    ).run();

    const report = ensureSchema(db);

    expect(report.parkedStockMovements).toBe(1);
    expect(countObject(db, "table", "stock_movements")).toBe(0);
    expect(
      db
        .prepare(`SELECT COUNT(*) AS count FROM stock_movements_parked_v4`)
        .get(),
    ).toEqual({ count: 2 });
  });
});

/** Only the ledger table, as a reinstalled newer release would recreate it. */
function applyWithdrawnMigration2(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceKind TEXT CHECK(invoiceKind IN ('purchase', 'sale')),
      invoiceId INTEGER,
      invoiceRevision INTEGER NOT NULL DEFAULT 1,
      linePosition INTEGER NOT NULL DEFAULT 0,
      stockCode TEXT NOT NULL,
      quantityDelta INTEGER NOT NULL CHECK(quantityDelta <> 0),
      unitRateMinor TEXT NOT NULL,
      effectiveDate TEXT NOT NULL,
      reason TEXT NOT NULL CHECK(reason IN ('posting', 'reversal', 'adjustment', 'migration_adjustment')),
      reversesMovementId INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(reversesMovementId) REFERENCES stock_movements(id),
      UNIQUE(invoiceKind, invoiceId, invoiceRevision, linePosition, reason, reversesMovementId)
    );
  `);
}
