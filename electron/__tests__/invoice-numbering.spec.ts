import {afterEach, describe, expect, it} from 'vitest';
import type Database from 'better-sqlite3';
import {
  getNextPurchaseInvoiceNumber,
  getNextSaleInvoiceNumber,
  saveInvoice,
  saveSaleInvoice,
} from '../db';
import {AppError, ErrorCodes} from '../errors';
import {makeMemoryDb} from './test-utils';

const TEST_KEY = Buffer.alloc(32, 7);

function createPurchaseInvoice(
  db: Database.Database,
  number: string,
  supplierName = 'Supplier A',
) {
  return saveInvoice(
    {
      number,
      supplierName,
      total: 100,
      items: [
        {
          code: 'SKU-1',
          name: 'Item 1',
          rate: 100,
          qty: 1,
          position: 0,
        },
      ],
      status: 'draft',
    },
    db,
    TEST_KEY,
  );
}

function createSaleInvoice(
  db: Database.Database,
  number: string,
  customerName = 'Customer A',
) {
  return saveSaleInvoice(
    {
      number,
      customerName,
      total: 100,
      items: [
        {
          code: 'SKU-1',
          name: 'Item 1',
          rate: 100,
          qty: 1,
          position: 0,
        },
      ],
      status: 'draft',
    },
    db,
    TEST_KEY,
  );
}

describe('invoice numbering', () => {
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

  it('returns 1 for empty purchase and sale tables', () => {
    const db = freshDb();

    expect(getNextPurchaseInvoiceNumber(db)).toBe('1');
    expect(getNextSaleInvoiceNumber(db)).toBe('1');
  });

  it('uses max numeric purchase number + 1 and ignores non-numeric values', () => {
    const db = freshDb();

    createPurchaseInvoice(db, '1');
    createPurchaseInvoice(db, '3');
    createPurchaseInvoice(db, '10');
    createPurchaseInvoice(db, 'INV-99');

    expect(getNextPurchaseInvoiceNumber(db)).toBe('11');
  });

  it('uses max numeric sale number + 1 and does not fill gaps', () => {
    const db = freshDb();

    createSaleInvoice(db, '2');
    createSaleInvoice(db, '7');
    createSaleInvoice(db, '15');

    expect(getNextSaleInvoiceNumber(db)).toBe('16');
  });

  it('rejects duplicate purchase number on create and on edit', () => {
    const db = freshDb();

    const first = createPurchaseInvoice(db, '12');
    const second = createPurchaseInvoice(db, '13');

    expect(() => createPurchaseInvoice(db, '12', 'Supplier B')).toThrowError(
      AppError,
    );

    try {
      saveInvoice(
        {
          id: second.invoice.id,
          number: '12',
          supplierName: 'Supplier B',
          total: 200,
          items: [
            {
              code: 'SKU-2',
              name: 'Item 2',
              rate: 200,
              qty: 1,
              position: 0,
            },
          ],
          status: 'draft',
        },
        db,
        TEST_KEY,
      );
      throw new Error('Expected duplicate invoice number error');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.DUPLICATE_INVOICE_NUMBER);
    }

    expect(first.invoice.number).toBe('12');
  });

  it('rejects duplicate sale number on create and on edit', () => {
    const db = freshDb();

    const first = createSaleInvoice(db, '22');
    const second = createSaleInvoice(db, '23');

    expect(() => createSaleInvoice(db, '22', 'Customer B')).toThrowError(
      AppError,
    );

    try {
      saveSaleInvoice(
        {
          id: second.invoice.id,
          number: '22',
          customerName: 'Customer B',
          total: 200,
          items: [
            {
              code: 'SKU-2',
              name: 'Item 2',
              rate: 200,
              qty: 1,
              position: 0,
            },
          ],
          status: 'draft',
        },
        db,
        TEST_KEY,
      );
      throw new Error('Expected duplicate invoice number error');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.DUPLICATE_INVOICE_NUMBER);
    }

    expect(first.invoice.number).toBe('22');
  });
});
