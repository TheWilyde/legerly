import {afterEach, describe, expect, it, vi} from 'vitest';
import type Database from 'better-sqlite3';
import {
  closeReopenedPeriod,
  closePeriod,
  createStock,
  deleteInvoice,
  getActivePeriod,
  getReopenContext,
  listInvoices,
  listPeriods,
  listSaleInvoices,
  listStock,
  reopenPeriod,
  saveInvoice,
  saveSaleInvoice,
} from '../db';
import {AppError, ErrorCodes} from '../errors';
import {makeMemoryDb} from './test-utils';

const TEST_KEY = Buffer.alloc(32, 9);

function nextDay(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
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

  it('honors explicit period overrides for purchase and sale invoices', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const closed = closePeriod({periodId: active.id}, db);

    const purchase = saveInvoice(
      {
        number: '1002',
        supplierName: 'Supplier Override',
        total: 100,
        invoiceDate: closed.closedPeriod.startDate,
        periodId: closed.closedPeriod.id,
        items: [
          {
            code: 'SKU-OVR-1',
            name: 'Item Override',
            rate: 100,
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

    const sale = saveSaleInvoice(
      {
        number: '2002',
        customerName: 'Customer Override',
        total: 120,
        invoiceDate: closed.closedPeriod.startDate,
        periodId: closed.closedPeriod.id,
        items: [
          {
            code: 'SKU-OVR-2',
            name: 'Item Override 2',
            rate: 120,
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

    expect(purchase.invoice.periodId).toBe(closed.closedPeriod.id);
    expect(sale.invoice.periodId).toBe(closed.closedPeriod.id);
  });

  it('lists purchase invoices by periodId even when invoiceDate is outside date filters', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const closed = closePeriod({periodId: active.id}, db);
    const outsideDate = addDays(closed.closedPeriod.endDate, 5);

    saveInvoice(
      {
        number: '1003',
        supplierName: 'Supplier Date Drift',
        total: 250,
        invoiceDate: outsideDate,
        periodId: closed.closedPeriod.id,
        items: [
          {
            code: 'SKU-DRIFT-P',
            name: 'Purchase Drift',
            rate: 250,
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

    const listed = listInvoices(db, TEST_KEY, {
      periodId: closed.closedPeriod.id,
      startDate: closed.closedPeriod.startDate,
      endDate: closed.closedPeriod.endDate,
    });

    expect(listed.length).toBe(1);
    expect(listed[0]?.number).toBe('1003');
    expect(listed[0]?.periodId).toBe(closed.closedPeriod.id);
  });

  it('lists sale invoices by periodId even when invoiceDate is outside date filters', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const closed = closePeriod({periodId: active.id}, db);
    const outsideDate = addDays(closed.closedPeriod.endDate, 7);

    saveSaleInvoice(
      {
        number: '2003',
        customerName: 'Customer Date Drift',
        total: 300,
        invoiceDate: outsideDate,
        periodId: closed.closedPeriod.id,
        items: [
          {
            code: 'SKU-DRIFT-S',
            name: 'Sale Drift',
            rate: 300,
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

    const listed = listSaleInvoices(db, TEST_KEY, {
      periodId: closed.closedPeriod.id,
      startDate: closed.closedPeriod.startDate,
      endDate: closed.closedPeriod.endDate,
    });

    expect(listed.length).toBe(1);
    expect(listed[0]?.number).toBe('2003');
    expect(listed[0]?.periodId).toBe(closed.closedPeriod.id);
  });

  it('applies custom start and end dates when closing a period', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const result = closePeriod(
      {
        periodId: active.id,
        startDate: '2026-04-05',
        endDate: '2026-04-20',
      },
      db,
    );

    expect(result.closedPeriod.startDate).toBe('2026-04-05');
    expect(result.closedPeriod.endDate).toBe('2026-04-20');
    expect(result.closedPeriod.status).toBe('closed');
  });

  it('uses the provided period label when closing a period', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const result = closePeriod(
      {
        periodId: active.id,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        label: 'February 2026',
      },
      db,
    );

    expect(result.closedPeriod.label).toBe('February 2026');
  });

  it('captures stock snapshot when closing an active period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    try {
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

      const closeDate = '2026-04-17';
      const nextStart = nextDay(closeDate);
      const closeResult = closePeriod(
        {
          periodId: active.id,
        },
        db,
      );

      expect(closeResult.closedPeriod.status).toBe('closed');
      expect(closeResult.activePeriod.status).toBe('active');
      expect(closeResult.closedPeriod.endDate).toBe(closeDate);
      expect(closeResult.activePeriod.startDate).toBe(nextStart);
      expect(closeResult.activePeriod.label).toBe('18-Apr-26');

      const snapshotStock = listStock(db, TEST_KEY, {
        periodId: closeResult.closedPeriod.id,
      });

      expect(snapshotStock.some((item) => item.code === 'SKU-2001')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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

  it('reopens a closed period and closes the current active period', () => {
    const db = freshDb();
    const initialActive = getActivePeriod(db);
    if (!initialActive) throw new Error('Expected active period');

    const nextStart = nextDay(initialActive.endDate);
    const nextEnd = endOfMonth(nextStart);

    const firstClose = closePeriod(
      {
        periodId: initialActive.id,
      },
      db,
    );

    const reopened = reopenPeriod(firstClose.closedPeriod.id, db);
    const activeAfterReopen = getActivePeriod(db);
    const periods = listPeriods(db);
    const previouslyActive = periods.find(
      (period) => period.id === firstClose.activePeriod.id,
    );

    expect(reopened.id).toBe(firstClose.closedPeriod.id);
    expect(reopened.status).toBe('active');
    expect(activeAfterReopen?.id).toBe(reopened.id);
    expect(previouslyActive?.status).toBe('closed');
    expect(previouslyActive?.closedAt).toBeTruthy();
  });

  it('rejects reopening a period that is already active', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    try {
      reopenPeriod(active.id, db);
      throw new Error('Expected reopen of active period to fail');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCodes.PERIOD_NOT_ACTIVE);
    }
  });

  it('closes reopened period back to previous active period', () => {
    const db = freshDb();
    const firstActive = getActivePeriod(db);
    if (!firstActive) throw new Error('Expected active period');

    const secondStart = nextDay(firstActive.endDate);
    const firstClose = closePeriod(
      {
        periodId: firstActive.id,
      },
      db,
    );

    const thirdStart = nextDay(firstClose.activePeriod.endDate);
    const secondClose = closePeriod(
      {
        periodId: firstClose.activePeriod.id,
      },
      db,
    );

    reopenPeriod(firstClose.closedPeriod.id, db);

    const reopenContext = getReopenContext(db);
    expect(reopenContext?.activePeriodId).toBe(firstClose.closedPeriod.id);
    expect(reopenContext?.returnPeriodId).toBe(secondClose.activePeriod.id);

    const closeReopenedResult = closeReopenedPeriod(db);
    const activeAfterCloseReopened = getActivePeriod(db);
    const periods = listPeriods(db);
    const middlePeriod = periods.find(
      (period) => period.id === firstClose.activePeriod.id,
    );

    expect(closeReopenedResult.activePeriod.id).toBe(
      secondClose.activePeriod.id,
    );
    expect(activeAfterCloseReopened?.id).toBe(secondClose.activePeriod.id);
    expect(middlePeriod?.status).toBe('closed');
    expect(getReopenContext(db)).toBeNull();
  });

  it('fails reopening closed period when snapshot is missing', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const startDate = nextDay(active.endDate);
    const endDate = endOfMonth(startDate);
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO periods (label, startDate, endDate, status, closedAt, createdAt, updatedAt)
         VALUES (@label, @startDate, @endDate, 'closed', @now, @now, @now)`,
      )
      .run({
        label: `${startDate} to ${endDate}`,
        startDate,
        endDate,
        now,
      });

    const insertedPeriodId = Number(info.lastInsertRowid);

    try {
      reopenPeriod(insertedPeriodId, db);
      throw new Error('Expected reopen to fail when snapshot is missing');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCodes.INTERNAL_ERROR);
    }

    expect(getActivePeriod(db)?.id).toBe(active.id);
    expect(getReopenContext(db)).toBeNull();
  });

  it('rejects invoices dated outside any defined period', () => {
    const db = freshDb();
    const active = getActivePeriod(db);
    if (!active) throw new Error('Expected active period');

    const distantStart = addDays(active.endDate, 10);
    closePeriod(
      {
        periodId: active.id,
      },
      db,
    );

    const gapDate = addDays(active.endDate, 2);

    try {
      saveInvoice(
        {
          number: '7001',
          supplierName: 'Gap Supplier',
          total: 50,
          invoiceDate: gapDate,
          items: [
            {
              code: 'SKU-GAP',
              name: 'Gap Item',
              rate: 50,
              qty: 1,
              position: 0,
            },
          ],
          status: 'posted',
        },
        db,
        TEST_KEY,
      );
      throw new Error('Expected invoice in period gap to fail');
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCodes.PERIOD_NOT_FOUND);
    }
  });

  it('restores stock snapshot when reopening an older closed period', () => {
    const db = freshDb();
    const initialActive = getActivePeriod(db);
    if (!initialActive) throw new Error('Expected active period');

    createStock(
      {
        code: 'SKU-OLD',
        name: 'Old Item',
        purchaseRate: 100,
        purchaseQty: 5,
        saleRate: 120,
        saleQty: 0,
      },
      db,
      TEST_KEY,
    );

    const nextStart = nextDay(initialActive.endDate);
    const firstClose = closePeriod(
      {
        periodId: initialActive.id,
      },
      db,
    );

    createStock(
      {
        code: 'SKU-NEW',
        name: 'New Item',
        purchaseRate: 200,
        purchaseQty: 3,
        saleRate: 250,
        saleQty: 0,
      },
      db,
      TEST_KEY,
    );

    const stockBeforeReopen = listStock(db, TEST_KEY);
    expect(stockBeforeReopen.some((item) => item.code === 'SKU-NEW')).toBe(
      true,
    );

    reopenPeriod(firstClose.closedPeriod.id, db);

    const stockAfterReopen = listStock(db, TEST_KEY);
    expect(stockAfterReopen.some((item) => item.code === 'SKU-OLD')).toBe(true);
    expect(stockAfterReopen.some((item) => item.code === 'SKU-NEW')).toBe(
      false,
    );

    const nowClosedSnapshot = listStock(db, TEST_KEY, {
      periodId: firstClose.activePeriod.id,
    });
    expect(nowClosedSnapshot.some((item) => item.code === 'SKU-NEW')).toBe(
      true,
    );
  });
});
