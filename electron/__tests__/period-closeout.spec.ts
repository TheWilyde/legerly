import {afterEach, describe, expect, it} from 'vitest';
import type Database from 'better-sqlite3';
import {
  closePeriod,
  deleteInvoice,
  getActivePeriod,
  listStock,
  reopenPeriod,
  saveInvoice,
} from '../db';
import {AppError, ErrorCodes} from '../errors';
import {makeMemoryDb} from './test-utils';

const TEST_KEY = Buffer.alloc(32, 9);

function nextDay(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function endOfMonth(dateIso: string): string {
  const [yearText, monthText] = dateIso.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

describe('period closeout', () => {
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

  it('seeds a default active period and assigns new invoices to it', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    expect(active).toBeDefined();

    const invoice = saveInvoice(
      {
        number: '1001',
        supplierName: 'Supplier A',
        total: 100,
        invoiceDate: active.startDate,
        items: [
          {
            code: 'SKU-1001',
            name: 'Item 1001',
            rate: 100,
            qty: 1,
            position: 0,
          },
        ],
        status: 'posted',
      },
      db,
      TEST_KEY,
    );

    expect(invoice.invoice.periodId).toBe(active?.id);
    expect(invoice.invoice.periodStatus).toBe('active');
  });

  it('captures stock snapshot when closing an active period', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    saveInvoice(
      {
        number: '2001',
        supplierName: 'Supplier B',
        total: 150,
        invoiceDate: active.startDate,
        items: [
          {
            code: 'SKU-2001',
            name: 'Item 2001',
            rate: 150,
            qty: 3,
            position: 0,
          },
        ],
        status: 'posted',
      },
      db,
      TEST_KEY,
    );

    const nextStart = nextDay(active.endDate);
    const closeResult = closePeriod(
      {
        periodId: active.id,
        nextPeriod: {
          startDate: nextStart,
          endDate: endOfMonth(nextStart),
        },
      },
      db,
    );

    expect(closeResult.closedPeriod.status).toBe('closed');
    expect(closeResult.activePeriod.status).toBe('active');

    const snapshotStock = listStock(db, TEST_KEY, {
      periodId: closeResult.closedPeriod.id,
    });

    expect(snapshotStock.some((item) => item.code === 'SKU-2001')).toBe(true);
  });

  it('rejects edits and deletes for invoices from closed periods', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const created = saveInvoice(
      {
        number: '3001',
        supplierName: 'Supplier C',
        total: 120,
        invoiceDate: active.startDate,
        items: [
          {
            code: 'SKU-3001',
            name: 'Item 3001',
            rate: 120,
            qty: 1,
            position: 0,
          },
        ],
        status: 'posted',
      },
      db,
      TEST_KEY,
    );

    const nextStart = nextDay(active.endDate);
    closePeriod(
      {
        periodId: active.id,
        nextPeriod: {
          startDate: nextStart,
          endDate: endOfMonth(nextStart),
        },
      },
      db,
    );

    expect(() =>
      saveInvoice(
        {
          id: created.invoice.id,
          number: created.invoice.number,
          supplierName: 'Supplier C Updated',
          total: 150,
          invoiceDate: active.startDate,
          items: [
            {
              code: 'SKU-3001',
              name: 'Item 3001',
              rate: 150,
              qty: 1,
              position: 0,
            },
          ],
          status: 'posted',
        },
        db,
        TEST_KEY,
      ),
    ).toThrowError(AppError);

    const updated = saveInvoice(
      {
        id: created.invoice.id,
        number: created.invoice.number,
        supplierName: 'Supplier C Override',
        total: 150,
        invoiceDate: active.startDate,
        items: [
          {
            code: 'SKU-3001',
            name: 'Item 3001',
            rate: 150,
            qty: 1,
            position: 0,
          },
        ],
        status: 'posted',
        overrideClosedPeriod: true,
      },
      db,
      TEST_KEY,
    );

    expect(updated.invoice.supplierName).toBe('Supplier C Override');

    try {
      deleteInvoice(created.invoice.id, db, TEST_KEY);
      throw new Error('Expected closed period delete to fail');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCodes.PERIOD_CLOSED_READONLY);
    }
  });

  it('rejects reopening while another active period exists', () => {
    const db = freshDb();
    const initialActive = getActivePeriod(db);
    if (!initialActive) throw new Error('Expected active period');

    const nextStart = nextDay(initialActive.endDate);
    const nextEnd = endOfMonth(nextStart);

    const firstClose = closePeriod(
      {
        periodId: initialActive.id,
        nextPeriod: {
          startDate: nextStart,
          endDate: nextEnd,
        },
      },
      db,
    );

    try {
      reopenPeriod(firstClose.closedPeriod.id, db);
      throw new Error('Expected reopen to fail with active period present');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCodes.PERIOD_ACTIVE_EXISTS);
    }
  });
});
