import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  closePeriod,
  getActivePeriod,
  getNextPurchaseInvoiceNumber,
  getNextSaleInvoiceNumber,
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

  it("allocates sequential purchase and sale numbers per active period and ignores provided number", () => {
    const db = freshDb();

    const p1 = createPurchaseInvoice(db, "12345");
    const p2 = createPurchaseInvoice(db, "INV-99");
    const s1 = createSaleInvoice(db, "777");

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
        number: "9999",
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

  it("rejects manual renumbering attempts for system-managed records", () => {
    const db = freshDb();

    const created = createPurchaseInvoice(db);

    try {
      saveInvoice(
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
      throw new Error("Expected renumber attempt to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.INVALID_INPUT);
    }
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
        number: "9999",
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
});
