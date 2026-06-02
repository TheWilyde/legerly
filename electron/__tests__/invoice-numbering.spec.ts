import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  closePeriod,
  deleteInvoice,
  ensureSchema,
  getActivePeriod,
  getNextPurchaseInvoiceNumber,
  getNextSaleInvoiceNumber,
  listInvoices,
  listSaleInvoices,
  saveInvoice,
  saveSaleInvoice,
} from "../db";
import { AppError, ErrorCodes } from "../errors";
import { makeMemoryDb } from "./test-utils";

const TEST_KEY = Buffer.alloc(32, 7);

function getActiveInvoiceDate(db: Database.Database): string {
  const active = getActivePeriod(db);
  if (!active) throw new Error("Expected active period");
  return active.startDate;
}

function getActivePeriodId(db: Database.Database): number {
  const active = getActivePeriod(db);
  if (!active) throw new Error("Expected active period");
  return active.id;
}

function createPurchaseInvoice(
  db: Database.Database,
  number = "ignored-by-managed-numbering",
  supplierName = "Supplier A",
) {
  return saveInvoice(
    {
      number,
      supplierName,
      total: 100,
      invoiceDate: getActiveInvoiceDate(db),
      items: [
        {
          code: "SKU-1",
          name: "Item 1",
          rate: 100,
          qty: 1,
          position: 0,
        },
      ],
      status: "draft",
    },
    db,
    TEST_KEY,
  );
}

function createSaleInvoice(
  db: Database.Database,
  number = "ignored-by-managed-numbering",
  customerName = "Customer A",
) {
  return saveSaleInvoice(
    {
      number,
      customerName,
      total: 100,
      invoiceDate: getActiveInvoiceDate(db),
      items: [
        {
          code: "SKU-1",
          name: "Item 1",
          rate: 100,
          qty: 1,
          position: 0,
        },
      ],
      status: "draft",
    },
    db,
    TEST_KEY,
  );
}

describe("invoice numbering", () => {
  const openedDbs: Database.Database[] = [];

  afterEach(() => {
    for (const db of openedDbs.splice(0, openedDbs.length)) {
      db.close();
    }
  });

  function freshDb() {
    const db = makeMemoryDb();
    openedDbs.push(db);
    return db;
  }

  it("returns 1 for empty purchase and sale tables in active period", () => {
    const db = freshDb();

    expect(getNextPurchaseInvoiceNumber(db)).toBe("1");
    expect(getNextSaleInvoiceNumber(db)).toBe("1");
  });

  it("allocates sequential purchase and sale numbers per active period when no manual ID is provided", () => {
    const db = freshDb();

    const p1 = createPurchaseInvoice(db);
    const p2 = createPurchaseInvoice(db, "INV-99");
    const s1 = createSaleInvoice(db);

    expect(p1.invoice.number).toBe("1");
    expect(p2.invoice.number).toBe("2");
    expect(s1.invoice.number).toBe("1");

    expect(getNextPurchaseInvoiceNumber(db)).toBe("3");
    expect(getNextSaleInvoiceNumber(db)).toBe("2");
  });

  it("resets sequence to 1 in a new period while preserving historical period numbers", () => {
    const db = freshDb();

    const firstPeriodId = getActivePeriodId(db);
    createPurchaseInvoice(db);
    createPurchaseInvoice(db);

    const active = getActivePeriod(db);
    if (!active) throw new Error("Expected active period before close");

    const closeResult = closePeriod({ periodId: active.id }, db);
    if (!closeResult.activePeriod) {
      throw new Error("Expected next active period after close");
    }

    const secondPeriodId = closeResult.activePeriod.id;

    expect(getNextPurchaseInvoiceNumber(db, firstPeriodId)).toBe("3");
    expect(getNextPurchaseInvoiceNumber(db, secondPeriodId)).toBe("1");

    const firstInNewPeriod = saveInvoice(
      {
        number: "ignored-by-managed-numbering",
        supplierName: "Supplier B",
        total: 100,
        invoiceDate: closeResult.activePeriod.startDate,
        periodId: secondPeriodId,
        items: [
          {
            code: "SKU-2",
            name: "Item 2",
            rate: 100,
            qty: 1,
            position: 0,
          },
        ],
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    expect(firstInNewPeriod.invoice.number).toBe("1");
    expect(getNextPurchaseInvoiceNumber(db, secondPeriodId)).toBe("2");
  });

  it("keeps legacy manual-number records editable and enforces uniqueness inside period", () => {
    const db = freshDb();
    const invoiceDate = getActiveInvoiceDate(db);
    const periodId = getActivePeriodId(db);

    const insertLegacy = db.prepare(
      `INSERT INTO invoices (
        invoiceNumber,
        invoiceSequence,
        supplierName,
        total,
        totalQty,
        createdAt,
        invoiceDate,
        status,
        periodId
      ) VALUES (
        @invoiceNumber,
        NULL,
        @supplierName,
        @total,
        1,
        @createdAt,
        @invoiceDate,
        'draft',
        @periodId
      )`,
    );

    insertLegacy.run({
      invoiceNumber: "LEG-001",
      supplierName: "Legacy Supplier",
      total: "100",
      createdAt: new Date().toISOString(),
      invoiceDate,
      periodId,
    });

    insertLegacy.run({
      invoiceNumber: "LEG-003",
      supplierName: "Legacy Supplier 2",
      total: "120",
      createdAt: new Date().toISOString(),
      invoiceDate,
      periodId,
    });

    const legacyRows = db
      .prepare(
        `SELECT id, invoiceNumber, periodId, invoiceDate
         FROM invoices
         WHERE invoiceSequence IS NULL
         ORDER BY id ASC`,
      )
      .all() as Array<{
      id: number;
      invoiceNumber: string;
      periodId: number;
      invoiceDate: string;
    }>;

    const firstLegacy = legacyRows[0];
    const secondLegacy = legacyRows[1];
    if (!firstLegacy || !secondLegacy) {
      throw new Error("Expected two legacy rows");
    }

    const updatedLegacy = saveInvoice(
      {
        id: firstLegacy.id,
        number: "LEG-002",
        supplierName: "Legacy Supplier Updated",
        total: 125,
        invoiceDate: firstLegacy.invoiceDate,
        periodId: firstLegacy.periodId,
        items: [
          {
            code: "SKU-L",
            name: "Legacy Item",
            rate: 125,
            qty: 1,
            position: 0,
          },
        ],
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    expect(updatedLegacy.invoice.number).toBe("LEG-002");
    expect(updatedLegacy.invoice.invoiceSequence ?? null).toBeNull();

    try {
      saveInvoice(
        {
          id: secondLegacy.id,
          number: "LEG-002",
          supplierName: "Legacy Supplier Duplicate",
          total: 120,
          invoiceDate: secondLegacy.invoiceDate,
          periodId: secondLegacy.periodId,
          items: [
            {
              code: "SKU-L2",
              name: "Legacy Item 2",
              rate: 120,
              qty: 1,
              position: 0,
            },
          ],
          status: "draft",
        },
        db,
        TEST_KEY,
      );
      throw new Error("Expected duplicate legacy number check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(
        ErrorCodes.DUPLICATE_INVOICE_NUMBER,
      );
    }
  });

  it("persists manual renumbering attempts for existing records", () => {
    const db = freshDb();

    const created = createPurchaseInvoice(db);

    const updated = saveInvoice(
      {
        id: created.invoice.id,
        number: "99",
        supplierName: "Supplier Renumber",
        total: 100,
        invoiceDate: getActiveInvoiceDate(db),
        items: [
          {
            code: "SKU-R",
            name: "Renumber Item",
            rate: 100,
            qty: 1,
            position: 0,
          },
        ],
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    expect(updated.invoice.number).toBe("99");
    expect(updated.invoice.invoiceIdPerPeriod).toBe(99);
    expect(getNextPurchaseInvoiceNumber(db)).toBe("100");
  });

  it("requires invoice date for draft and posted saves", () => {
    const db = freshDb();

    try {
      saveInvoice(
        {
          number: "9001",
          supplierName: "Supplier Date",
          total: 100,
          items: [
            {
              code: "SKU-9",
              name: "Item 9",
              rate: 100,
              qty: 1,
              position: 0,
            },
          ],
          status: "draft",
        } as any,
        db,
        TEST_KEY,
      );
      throw new Error("Expected missing invoice date to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.INVALID_INPUT);
    }

    try {
      saveSaleInvoice(
        {
          number: "9002",
          customerName: "Customer Date",
          total: 100,
          items: [
            {
              code: "SKU-9",
              name: "Item 9",
              rate: 100,
              qty: 1,
              position: 0,
            },
          ],
          status: "posted",
        } as any,
        db,
        TEST_KEY,
      );
      throw new Error("Expected missing invoice date to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.INVALID_INPUT);
    }
  });

  it("trusts payload total over computed items total", () => {
    const db = freshDb();

    const purchase = saveInvoice(
      {
        number: "9501",
        supplierName: "Supplier Total",
        total: 999,
        invoiceDate: getActiveInvoiceDate(db),
        items: [
          {
            code: "SKU-TOTAL",
            name: "Item Total",
            rate: 100,
            qty: 1,
            position: 0,
          },
        ],
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    expect(purchase.invoice.total).toBe(999);
  });

  it("sets invoiceIdPerPeriod to sequential number per period", () => {
    const db = freshDb();

    const p1 = createPurchaseInvoice(db);
    const p2 = createPurchaseInvoice(db);
    const s1 = createSaleInvoice(db);
    const s2 = createSaleInvoice(db);

    expect(p1.invoice.invoiceIdPerPeriod).toBe(1);
    expect(p2.invoice.invoiceIdPerPeriod).toBe(2);
    expect(s1.invoice.invoiceIdPerPeriod).toBe(1);
    expect(s2.invoice.invoiceIdPerPeriod).toBe(2);
  });

  it("persists client invoiceIdPerPeriod overrides on creates", () => {
    const db = freshDb();

    const purchase = saveInvoice(
      {
        number: "stale-client-number",
        invoiceIdPerPeriod: 44,
        supplierName: "Supplier Override",
        total: 100,
        invoiceDate: getActiveInvoiceDate(db),
        items: [
          {
            code: "SKU-OVERRIDE",
            name: "Override Item",
            rate: 100,
            qty: 1,
            position: 0,
          },
        ],
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    const sale = saveSaleInvoice(
      {
        number: "stale-client-number",
        invoiceIdPerPeriod: 91,
        customerName: "Customer Override",
        total: 100,
        invoiceDate: getActiveInvoiceDate(db),
        items: [
          {
            code: "SKU-SALE-OVERRIDE",
            name: "Sale Override Item",
            rate: 100,
            qty: 1,
            position: 0,
          },
        ],
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    expect(purchase.invoice.number).toBe("44");
    expect(purchase.invoice.invoiceIdPerPeriod).toBe(44);
    expect(sale.invoice.number).toBe("91");
    expect(sale.invoice.invoiceIdPerPeriod).toBe(91);
    expect(getNextPurchaseInvoiceNumber(db)).toBe("45");
    expect(getNextSaleInvoiceNumber(db)).toBe("92");
  });

  it("resets invoiceIdPerPeriod to 1 in a new period", () => {
    const db = freshDb();

    const p1 = createPurchaseInvoice(db);
    const p2 = createPurchaseInvoice(db);

    expect(p1.invoice.invoiceIdPerPeriod).toBe(1);
    expect(p2.invoice.invoiceIdPerPeriod).toBe(2);

    const active = getActivePeriod(db);
    if (!active) throw new Error("Expected active period before close");

    const closeResult = closePeriod({ periodId: active.id }, db);
    if (!closeResult.activePeriod) {
      throw new Error("Expected next active period after close");
    }

    const p3 = saveInvoice(
      {
        number: "ignored-by-managed-numbering",
        supplierName: "Supplier New Period",
        total: 100,
        invoiceDate: closeResult.activePeriod.startDate,
        periodId: closeResult.activePeriod.id,
        items: [
          {
            code: "SKU-NEW",
            name: "Item New Period",
            rate: 100,
            qty: 1,
            position: 0,
          },
        ],
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    expect(p3.invoice.invoiceIdPerPeriod).toBe(1);
  });

  it("persists invoiceIdPerPeriod changes for existing records", () => {
    const db = freshDb();

    const created = createPurchaseInvoice(db);

    const updated = saveInvoice(
      {
        id: created.invoice.id,
        number: "9",
        invoiceIdPerPeriod: 9,
        supplierName: created.invoice.supplierName,
        total: created.invoice.total,
        invoiceDate: getActiveInvoiceDate(db),
        items: created.items,
        status: "draft",
      },
      db,
      TEST_KEY,
    );

    expect(updated.invoice.number).toBe("9");
    expect(updated.invoice.invoiceIdPerPeriod).toBe(9);
    expect(getNextPurchaseInvoiceNumber(db)).toBe("10");
  });

  it("repairs corrupted managed invoiceSequence values and counters", () => {
    const db = freshDb();
    const periodId = getActivePeriodId(db);

    const first = createPurchaseInvoice(db);
    const second = createPurchaseInvoice(db);
    const sale = createSaleInvoice(db);

    db.prepare(
      `UPDATE invoices SET invoiceSequence = 44 WHERE id = ?`,
    ).run(first.invoice.id);
    db.prepare(
      `UPDATE sale_invoices SET invoiceSequence = 77 WHERE id = ?`,
    ).run(sale.invoice.id);
    db.prepare(
      `UPDATE invoice_counters SET lastNumber = 44 WHERE kind = 'purchase' AND periodId = ?`,
    ).run(periodId);
    db.prepare(
      `UPDATE invoice_counters SET lastNumber = 77 WHERE kind = 'sale' AND periodId = ?`,
    ).run(periodId);

    ensureSchema(db);

    const purchaseRows = db
      .prepare(
        `SELECT id, invoiceSequence, invoiceIdPerPeriod
         FROM invoices
         ORDER BY id ASC`,
      )
      .all() as Array<{
      id: number;
      invoiceSequence: number | null;
      invoiceIdPerPeriod: number | null;
    }>;
    const saleRow = db
      .prepare(
        `SELECT invoiceSequence, invoiceIdPerPeriod
         FROM sale_invoices
         WHERE id = ?`,
      )
      .get(sale.invoice.id) as {
      invoiceSequence: number | null;
      invoiceIdPerPeriod: number | null;
    };

    expect(purchaseRows).toEqual([
      {
        id: first.invoice.id,
        invoiceSequence: 1,
        invoiceIdPerPeriod: 1,
      },
      {
        id: second.invoice.id,
        invoiceSequence: 2,
        invoiceIdPerPeriod: 2,
      },
    ]);
    expect(saleRow.invoiceSequence).toBe(1);
    expect(saleRow.invoiceIdPerPeriod).toBe(1);
    expect(getNextPurchaseInvoiceNumber(db, periodId)).toBe("3");
    expect(getNextSaleInvoiceNumber(db, periodId)).toBe("2");
  });

  it("lists invoices by descending managed sequence before createdAt fallback", () => {
    const db = freshDb();

    const p1 = createPurchaseInvoice(db);
    const p2 = createPurchaseInvoice(db);
    const p3 = createPurchaseInvoice(db);
    const s1 = createSaleInvoice(db);
    const s2 = createSaleInvoice(db);

    db.prepare(`UPDATE invoices SET createdAt = ? WHERE id = ?`).run(
      "2099-01-01T00:00:00.000Z",
      p1.invoice.id,
    );
    db.prepare(`UPDATE sale_invoices SET createdAt = ? WHERE id = ?`).run(
      "2099-01-01T00:00:00.000Z",
      s1.invoice.id,
    );

    expect(listInvoices(db, TEST_KEY).map((invoice) => invoice.id)).toEqual([
      p3.invoice.id,
      p2.invoice.id,
      p1.invoice.id,
    ]);
    expect(listSaleInvoices(db, TEST_KEY).map((invoice) => invoice.id)).toEqual(
      [s2.invoice.id, s1.invoice.id],
    );
  });

  it("repairs stale high counters before previewing and saving the next invoice ID", () => {
    const db = freshDb();
    const periodId = getActivePeriodId(db);

    for (let index = 0; index < 17; index += 1) {
      createPurchaseInvoice(db, "ignored-by-managed-numbering", `Supplier ${index}`);
    }

    db.prepare(
      `UPDATE invoice_counters
       SET lastNumber = 39
       WHERE kind = 'purchase' AND periodId = ?`,
    ).run(periodId);

    expect(getNextPurchaseInvoiceNumber(db, periodId)).toBe("18");

    const created = createPurchaseInvoice(db, "ignored-by-managed-numbering", "Supplier 18");

    expect(created.invoice.number).toBe("18");
    expect(created.invoice.invoiceIdPerPeriod).toBe(18);
    expect(getNextPurchaseInvoiceNumber(db, periodId)).toBe("19");
  });

  it("uses visible invoice IDs instead of stale hidden sequences for the next ID", () => {
    const db = freshDb();
    const periodId = getActivePeriodId(db);

    for (let index = 0; index < 17; index += 1) {
      createPurchaseInvoice(db, "ignored-by-managed-numbering", `Supplier ${index}`);
    }

    db.prepare(
      `UPDATE invoices
       SET invoiceSequence = 39
       WHERE invoiceIdPerPeriod = 17`,
    ).run();
    db.prepare(
      `UPDATE invoice_counters
       SET lastNumber = 39
       WHERE kind = 'purchase' AND periodId = ?`,
    ).run(periodId);

    expect(getNextPurchaseInvoiceNumber(db, periodId)).toBe("18");

    ensureSchema(db);

    const repaired = db
      .prepare(
        `SELECT invoiceNumber, invoiceSequence, invoiceIdPerPeriod
         FROM invoices
         WHERE invoiceIdPerPeriod = 17`,
      )
      .get() as {
      invoiceNumber: string | null;
      invoiceSequence: number | null;
      invoiceIdPerPeriod: number | null;
    };

    expect(repaired).toEqual({
      invoiceNumber: "17",
      invoiceSequence: 17,
      invoiceIdPerPeriod: 17,
    });
    expect(getNextPurchaseInvoiceNumber(db, periodId)).toBe("18");
  });

  it("does not reuse deleted invoice numbers", () => {
    const db = freshDb();

    const p1 = createPurchaseInvoice(db);
    const p2 = createPurchaseInvoice(db);
    const p3 = createPurchaseInvoice(db);

    expect(p1.invoice.number).toBe("1");
    expect(p2.invoice.number).toBe("2");
    expect(p3.invoice.number).toBe("3");

    deleteInvoice(p2.invoice.id, db, TEST_KEY);

    expect(getNextPurchaseInvoiceNumber(db)).toBe("4");

    const p4 = createPurchaseInvoice(db);
    expect(p4.invoice.number).toBe("4");
    expect(getNextPurchaseInvoiceNumber(db)).toBe("5");
  });

  it("prevents deletion of posted invoices", () => {
    const db = freshDb();

    const created = createPurchaseInvoice(db);
    const postedInvoice = saveInvoice(
      {
        id: created.invoice.id,
        number: created.invoice.number,
        supplierName: created.invoice.supplierName,
        total: created.invoice.total,
        invoiceDate: getActiveInvoiceDate(db),
        items: created.items,
        status: "posted",
      },
      db,
      TEST_KEY,
    );

    expect(postedInvoice.invoice.status).toBe("posted");

    try {
      deleteInvoice(postedInvoice.invoice.id, db, TEST_KEY);
      throw new Error("Expected deletion of posted invoice to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.INVALID_INPUT);
      expect((error as AppError).message).toContain("Cannot delete posted");
    }
  });

  it("enforces UNIQUE constraint on invoice number per period", () => {
    const db = freshDb();
    const periodId = getActivePeriodId(db);

    const p1 = createPurchaseInvoice(db);
    expect(p1.invoice.number).toBe("1");

    try {
      const stmt = db.prepare(`
        INSERT INTO invoices (
          invoiceNumber,
          invoiceSequence,
          supplierName,
          total,
          totalQty,
          createdAt,
          invoiceDate,
          status,
          periodId
        ) VALUES (
          @invoiceNumber,
          @invoiceSequence,
          @supplierName,
          @total,
          @totalQty,
          @createdAt,
          @invoiceDate,
          @status,
          @periodId
        )
      `);
      stmt.run({
        invoiceNumber: "1",
        invoiceSequence: null,
        supplierName: "Duplicate Supplier",
        total: "100",
        totalQty: 1,
        createdAt: new Date().toISOString(),
        invoiceDate: getActiveInvoiceDate(db),
        status: "draft",
        periodId,
      });
      throw new Error(
        "Expected UNIQUE constraint to prevent duplicate invoice number"
      );
    } catch (error) {
      const errorMsg = String((error as any)?.message || "");
      expect(errorMsg).toContain("UNIQUE");
    }
  });
});
