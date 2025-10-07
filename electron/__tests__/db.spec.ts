import {describe, it, expect} from 'vitest';
import {makeMemoryDb} from './test-utils';
import {
  createInvoice,
  getInvoice,
  saveInvoice,
  listInvoices,
  createStock,
  updateStock,
} from '../db';
import Database from 'better-sqlite3';
import {AppError, ErrorCodes} from '../errors';
import type {InvoiceWithItems} from '../db';

function mkInvoiceInput(n = 'INV-001') {
  return {
    number: n,
    supplierName: 'Supplier',
    total: 123.45,
    address: 'Addr',
    invoiceDate: '2024-01-01',
    items: [
      {code: 'A1', name: 'Item A', rate: 10, qty: 2, position: 0},
      {code: 'B2', name: 'Item B', rate: 5, qty: 3, position: 1},
    ],
  };
}

describe('db.ts', () => {
  let db: InstanceType<typeof Database>;

  it('creates and lists invoices', () => {
    db = makeMemoryDb();
    const created = createInvoice(mkInvoiceInput(), db); // returns the invoice object
    expect(created.id).toBeGreaterThan(0);
    const list = listInvoices(db);
    expect(list.length).toBe(1);
    const fetched = getInvoice(created.id, db);
    expect(fetched?.items.length).toBe(2);
  });

  it('updates invoice items via saveInvoice', () => {
    const inv = createInvoice(mkInvoiceInput('INV-002'), db);
    const upd = saveInvoice(
      {
        id: inv.id,
        number: 'INV-002',
        supplierName: 'Supplier X',
        total: 200,
        address: 'New',
        invoiceDate: '2024-02-02',
        items: [{code: 'C3', name: 'Item C', rate: 20, qty: 2, position: 0}],
      },
      db
    ) as InvoiceWithItems;
    expect(upd.items.length).toBe(1);
    expect(upd.invoice.supplierName).toBe('Supplier X');
  });

  it('enforces unique stock code with error code', () => {
    createStock(
      {
        code: 'SKU1',
        name: 'Thing',
        purchaseRate: 1,
        purchaseQty: 1,
        saleRate: 2,
        saleQty: 0,
      },
      db
    );
    let err: any;
    try {
      createStock(
        {
          code: 'sku1',
          name: 'Thing2',
          purchaseRate: 1,
          purchaseQty: 1,
          saleRate: 2,
          saleQty: 0,
        },
        db
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCodes.STOCK_CODE_EXISTS);
  });

  it('updates stock', () => {
    const updated = updateStock(
      1,
      {
        code: 'SKU1',
        name: 'Thing-upd',
        purchaseRate: 2,
        purchaseQty: 5,
        saleRate: 3,
        saleQty: 1,
      },
      db
    );
    expect(updated.name).toBe('Thing-upd');
  });
});
