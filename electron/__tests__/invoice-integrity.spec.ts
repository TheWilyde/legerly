import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  deleteInvoice,
  deleteSaleInvoice,
  ensureSchema,
  getActivePeriod,
  saveInvoice,
  saveSaleInvoice,
  createStock,
  deleteStock,
  listStock,
  rebuildStockFromMovements,
} from "../db";
import { AppError, ErrorCodes } from "../errors";

const KEY = Buffer.alloc(32, 9);
const databases: Database.Database[] = [];

function freshDb() {
  const db = new Database(":memory:");
  databases.push(db);
  db.pragma("foreign_keys = ON");
  ensureSchema(db, KEY);
  return db;
}

function invoiceDate(db: Database.Database) {
  return getActivePeriod(db)!.startDate;
}

function createInvoice(db: Database.Database, status: "draft" | "posted" = "draft") {
  return saveInvoice(
    {
      number: "1",
      supplierName: "Integrity Supplier",
      invoiceDate: invoiceDate(db),
      status,
      items: [
        { code: "SKU-1", name: "Item", rate: 12.34, qty: 2, position: 0 },
      ],
    },
    db,
    KEY,
  );
}

afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

describe("invoice persistence integrity", () => {
  it("enforces foreign keys and cascades draft item deletion", () => {
    const db = freshDb();
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    const created = createInvoice(db);

    deleteInvoice(created.invoice.id, db, KEY);

    expect(
      db.prepare("SELECT COUNT(*) AS count FROM invoice_items").get(),
    ).toEqual({ count: 0 });
    expect(() =>
      db
        .prepare(
          `INSERT INTO invoice_items
           (invoiceId, code, name, rate, rateMinor, qty, position)
           VALUES (999, 'X', 'Missing', '0', '0', 1, 0)`,
        )
        .run(),
    ).toThrow();
  });

  it("derives exact minor-unit totals and rejects fractional quantities", () => {
    const db = freshDb();
    const created = createInvoice(db);
    expect(created.invoice.totalMinor).toBe(2468);
    expect(created.invoice.total).toBe(24.68);
    expect(created.items[0].rateMinor).toBe(1234);

    expect(() =>
      saveInvoice(
        {
          number: "2",
          supplierName: "Bad Quantity",
          invoiceDate: invoiceDate(db),
          items: [{ code: "X", name: "X", rate: 1, qty: 1.5, position: 0 }],
        },
        db,
        KEY,
      ),
    ).toThrowError(AppError);
  });

  it("rejects stale versions without replacing invoice items", () => {
    const db = freshDb();
    const created = createInvoice(db);
    const updated = saveInvoice(
      {
        id: created.invoice.id,
        version: created.invoice.version,
        number: created.invoice.number,
        supplierName: "Updated",
        invoiceDate: invoiceDate(db),
        status: "draft",
        items: [{ code: "SKU-2", name: "New", rate: 5, qty: 1, position: 0 }],
      },
      db,
      KEY,
    );
    expect(updated.invoice.version).toBe(created.invoice.version + 1);

    try {
      saveInvoice(
        {
          id: created.invoice.id,
          version: created.invoice.version,
          number: created.invoice.number,
          supplierName: "Stale",
          invoiceDate: invoiceDate(db),
          status: "draft",
          items: [{ code: "BAD", name: "Bad", rate: 1, qty: 1, position: 0 }],
        },
        db,
        KEY,
      );
      throw new Error("Expected stale version to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.VERSION_CONFLICT);
    }
    expect(
      db.prepare("SELECT code FROM invoice_items WHERE invoiceId = ?").get(created.invoice.id),
    ).toEqual({ code: "SKU-2" });
  });

  it("audits posted corrections with reversal and replacement movements", () => {
    const db = freshDb();
    const created = createInvoice(db, "posted");

    saveInvoice(
      {
        id: created.invoice.id,
        version: created.invoice.version,
        correctionReason: "Corrected quantity",
        number: created.invoice.number,
        supplierName: created.invoice.supplierName,
        invoiceDate: invoiceDate(db),
        status: "posted",
        items: [{ code: "SKU-1", name: "Item", rate: 12.34, qty: 3, position: 0 }],
      },
      db,
      KEY,
    );

    expect(
      db.prepare("SELECT COUNT(*) AS count FROM invoice_revisions").get(),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare(
          `SELECT reason, quantityDelta FROM stock_movements
           WHERE invoiceKind = 'purchase' ORDER BY id`,
        )
        .all(),
    ).toEqual([
      { reason: "posting", quantityDelta: 2 },
      { reason: "reversal", quantityDelta: -2 },
      { reason: "posting", quantityDelta: 3 },
    ]);
  });

  it("preserves legacy fractional quantities during migration", () => {
    const db = freshDb();
    createStock(
      {
        code: "FRACTION",
        name: "Fractional legacy stock",
        purchaseRate: 1,
        saleRate: 1,
        purchaseQty: 1,
        saleQty: 0,
      },
      db,
      KEY,
    );
    db.prepare("UPDATE stock SET purchaseQty = 1.5 WHERE code = 'FRACTION'").run();
    db.prepare("UPDATE app_schema SET version = 0 WHERE id = 1").run();

    expect(() => ensureSchema(db, KEY)).not.toThrow();
    expect(
      db.prepare("SELECT purchaseQty FROM stock WHERE code = 'FRACTION'").get(),
    ).toEqual({ purchaseQty: 1.5 });
  });

  it("rebuilds cached stock deterministically from movements", () => {
    const db = freshDb();
    createInvoice(db, "posted");
    db.prepare("UPDATE stock SET purchaseQty = 999 WHERE code = 'SKU-1'").run();

    const result = rebuildStockFromMovements(db);

    expect(result.discrepancies).toEqual([
      { code: "SKU-1", before: 999, after: 2 },
    ]);
    expect(
      db.prepare("SELECT purchaseQty, saleQty FROM stock WHERE code = 'SKU-1'").get(),
    ).toEqual({ purchaseQty: 2, saleQty: 0 });
  });

  it("reactivates archived stock when a purchase invoice reuses its code", () => {
    const db = freshDb();
    const original = createStock(
      {
        code: "RESTORE-PURCHASE",
        name: "Original item",
        purchaseRate: 4,
        saleRate: 6,
        purchaseQty: 1,
        saleQty: 0,
      },
      db,
      KEY,
    );
    deleteStock(original.id, db, KEY);
    expect(listStock(db, KEY)).toHaveLength(0);

    saveInvoice(
      {
        number: "1",
        supplierName: "Restore Supplier",
        invoiceDate: invoiceDate(db),
        status: "posted",
        items: [
          {
            code: "RESTORE-PURCHASE",
            name: "Restored item",
            rate: 5,
            qty: 2,
            position: 0,
          },
        ],
      },
      db,
      KEY,
    );

    expect(listStock(db, KEY)).toEqual([
      expect.objectContaining({
        id: original.id,
        code: "RESTORE-PURCHASE",
        name: "Restored item",
        purchaseQty: 3,
        archived: 0,
      }),
    ]);
  });

  it("reactivates archived stock when a sale invoice reuses its code", () => {
    const db = freshDb();
    const original = createStock(
      {
        code: "RESTORE-SALE",
        name: "Original item",
        purchaseRate: 4,
        saleRate: 6,
        purchaseQty: 5,
        saleQty: 0,
      },
      db,
      KEY,
    );
    deleteStock(original.id, db, KEY);

    saveSaleInvoice(
      {
        number: "1",
        customerName: "Restore Customer",
        invoiceDate: invoiceDate(db),
        status: "posted",
        items: [
          {
            code: "RESTORE-SALE",
            name: "Restored item",
            rate: 7,
            qty: 2,
            position: 0,
          },
        ],
      },
      db,
      KEY,
    );

    expect(listStock(db, KEY)).toEqual([
      expect.objectContaining({
        id: original.id,
        code: "RESTORE-SALE",
        name: "Restored item",
        saleQty: 2,
        archived: 0,
      }),
    ]);
  });

  it("reactivates archived stock through manual creation and reconciles it", () => {
    const db = freshDb();
    const original = createStock(
      {
        code: "RESTORE-MANUAL",
        name: "Original item",
        purchaseRate: 4,
        saleRate: 6,
        purchaseQty: 5,
        saleQty: 1,
      },
      db,
      KEY,
    );
    deleteStock(original.id, db, KEY);

    const restored = createStock(
      {
        code: "RESTORE-MANUAL",
        name: "Restored item",
        purchaseRate: 8,
        saleRate: 10,
        purchaseQty: 9,
        saleQty: 2,
      },
      db,
      KEY,
    );

    expect(restored).toEqual(
      expect.objectContaining({
        id: original.id,
        name: "Restored item",
        purchaseRate: 8,
        saleRate: 10,
        purchaseQty: 9,
        saleQty: 2,
        archived: 0,
      }),
    );
    rebuildStockFromMovements(db);
    const rebuilt = listStock(db, KEY)[0];
    expect(rebuilt.purchaseQty - rebuilt.saleQty).toBe(7);
  });

  it("continues rejecting manual creation for an active stock code", () => {
    const db = freshDb();
    createStock(
      {
        code: "ACTIVE",
        name: "Active item",
        purchaseRate: 1,
        saleRate: 2,
        purchaseQty: 1,
        saleQty: 0,
      },
      db,
      KEY,
    );

    expect(() =>
      createStock(
        {
          code: "ACTIVE",
          name: "Duplicate",
          purchaseRate: 1,
          saleRate: 2,
          purchaseQty: 1,
          saleQty: 0,
        },
        db,
        KEY,
      ),
    ).toThrowError(
      expect.objectContaining({ code: ErrorCodes.DUPLICATE_CODE }),
    );
  });

  it("reverses sale stock when a posted sale invoice is deleted", () => {
    const db = freshDb();
    createInvoice(db, "posted");
    const sale = saveSaleInvoice(
      {
        number: "1",
        customerName: "Integrity Customer",
        invoiceDate: invoiceDate(db),
        status: "posted",
        items: [
          { code: "SKU-1", name: "Item", rate: 20, qty: 1, position: 0 },
        ],
      },
      db,
      KEY,
    );
    expect(
      db.prepare("SELECT purchaseQty, saleQty FROM stock WHERE code = 'SKU-1'").get(),
    ).toEqual({ purchaseQty: 2, saleQty: 1 });

    deleteSaleInvoice(sale.invoice.id, db, KEY);

    expect(
      db.prepare("SELECT purchaseQty, saleQty FROM stock WHERE code = 'SKU-1'").get(),
    ).toEqual({ purchaseQty: 2, saleQty: 0 });
    expect(
      db
        .prepare(
          `SELECT reason, quantityDelta FROM stock_movements
           WHERE invoiceKind = 'sale' AND invoiceId = ? ORDER BY id`,
        )
        .all(sale.invoice.id),
    ).toEqual([
      { reason: "posting", quantityDelta: -1 },
      { reason: "reversal", quantityDelta: 1 },
    ]);
  });
});
