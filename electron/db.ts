import Database from 'better-sqlite3';
import {AppError, ErrorCodes} from './errors';
import {normalizeCode} from './utils';
import {encryptionService} from './encryption';

// Fields to encrypt
const ENCRYPTED_INVOICE_FIELDS = [
  'supplierName',
  'address',
  'contactNo',
] as const;
const ENCRYPTED_SALE_INVOICE_FIELDS = [
  'customerName',
  'address',
  'contactNo',
] as const;
const ENCRYPTED_LEDGER_FIELDS = ['customerName', 'contactNo'] as const;

export type NewPurchaseInvoice = {
  supplierName: string;
  total: number;
  number: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
};

export type NewSaleInvoice = {
  customerName: string;
  total: number;
  number: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
};

export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
  status: 'draft' | 'posted';
  periodId?: number;
  periodStatus?: PeriodStatus;
};

export type SaleInvoice = {
  id: number;
  number: string;
  customerName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
  status: 'draft' | 'posted';
  periodId?: number;
  periodStatus?: PeriodStatus;
};

export type PeriodStatus = 'active' | 'closed';

export type Period = {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePeriodInput = {
  label?: string;
  startDate: string;
  endDate: string;
  status?: PeriodStatus;
};

export type ClosePeriodInput = {
  periodId: number;
  nextPeriodId?: number;
  nextPeriod?: {
    label?: string;
    startDate: string;
    endDate: string;
  };
};

export type ClosePeriodResult = {
  closedPeriod: Period;
  activePeriod: Period;
  snapshotId: number;
};

export type NewStockItem = {
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
};
export type StockItem = NewStockItem & {id: number; createdAt: string};

export type NewInvoiceItem = {
  code: string;
  name: string;
  rate: number;
  qty: number;
  position: number;
};
export type InvoiceItem = NewInvoiceItem & {id: number; invoiceId: number};
export type InvoiceWithItems = {invoice: Invoice; items: InvoiceItem[]};

export type LedgerSavePayload = {
  id?: number;
  customerName: string;
  contactNo?: string;
  totals: {
    debit: number;
    credit: number;
    net: number;
  };
  rows: {
    id?: number;
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    crDr: 'CR' | 'DR';
    position: number;
  }[];
};

// ✅ Encryption helpers
function encryptNumber(value: number, key?: Buffer): string {
  return encryptionService.encrypt(String(value), key);
}

function decryptNumber(encrypted: string, key?: Buffer): number {
  if (!encryptionService.isEncrypted(encrypted)) {
    return Number(encrypted) || 0;
  }
  return Number(encryptionService.decrypt(encrypted, key)) || 0;
}

function decrypt(value: string | null | undefined, key: Buffer): string {
  if (!value) return '';
  if (!encryptionService.isEncrypted(value)) {
    return value;
  }
  try {
    return encryptionService.decrypt(value, key);
  } catch {
    return value;
  }
}

type InvoiceTable = 'invoices' | 'sale_invoices';

function toIsoDate(value: string): string {
  return value.slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const base = new Date(`${dateIso}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function endOfMonth(dateIso: string): string {
  const [yearText, monthText] = dateIso.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  return date.toISOString().slice(0, 10);
}

function defaultPeriodLabel(startDate: string, endDate: string): string {
  return `${startDate} to ${endDate}`;
}

function normalizeInvoiceDate(
  invoiceDate?: string,
  createdAt?: string,
): string {
  if (invoiceDate && invoiceDate.trim()) {
    return toIsoDate(invoiceDate.trim());
  }
  if (createdAt && createdAt.trim()) {
    return toIsoDate(createdAt.trim());
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizeRequiredInvoiceDate(invoiceDate?: string): string {
  const trimmed = String(invoiceDate ?? '').trim();
  if (!trimmed) {
    throw new AppError('Invoice date is required.', ErrorCodes.INVALID_INPUT);
  }

  if (Number.isNaN(Date.parse(trimmed))) {
    throw new AppError('Invoice date is invalid.', ErrorCodes.INVALID_INPUT);
  }

  return toIsoDate(trimmed);
}

const NEXT_INVOICE_NUMBER_SQL: Record<InvoiceTable, string> = {
  invoices: `
    SELECT COALESCE(MAX(CAST(TRIM(invoiceNumber) AS INTEGER)), 0) AS maxNumber
    FROM invoices
    WHERE invoiceNumber IS NOT NULL
      AND TRIM(invoiceNumber) <> ''
      AND TRIM(invoiceNumber) GLOB '[0-9]*'
      AND TRIM(invoiceNumber) NOT GLOB '*[^0-9]*'
  `,
  sale_invoices: `
    SELECT COALESCE(MAX(CAST(TRIM(invoiceNumber) AS INTEGER)), 0) AS maxNumber
    FROM sale_invoices
    WHERE invoiceNumber IS NOT NULL
      AND TRIM(invoiceNumber) <> ''
      AND TRIM(invoiceNumber) GLOB '[0-9]*'
      AND TRIM(invoiceNumber) NOT GLOB '*[^0-9]*'
  `,
};

const DUPLICATE_INVOICE_NUMBER_SQL: Record<InvoiceTable, string> = {
  invoices: `
    SELECT id
    FROM invoices
    WHERE invoiceNumber = @invoiceNumber
      AND (@invoiceId IS NULL OR id != @invoiceId)
    LIMIT 1
  `,
  sale_invoices: `
    SELECT id
    FROM sale_invoices
    WHERE invoiceNumber = @invoiceNumber
      AND (@invoiceId IS NULL OR id != @invoiceId)
    LIMIT 1
  `,
};

function getNextInvoiceNumberByTable(
  db: Database.Database,
  table: InvoiceTable,
): string {
  const row = db.prepare(NEXT_INVOICE_NUMBER_SQL[table]).get() as
    | {maxNumber?: number}
    | undefined;
  const maxNumber = Number(row?.maxNumber ?? 0);
  return String(maxNumber + 1);
}

function assertUniqueInvoiceNumber(
  db: Database.Database,
  table: InvoiceTable,
  invoiceNumber: string,
  invoiceId?: number,
): void {
  const trimmedNumber = invoiceNumber.trim();
  if (!trimmedNumber) {
    throw new AppError('Invoice number is required.', ErrorCodes.INVALID_INPUT);
  }

  const duplicate = db.prepare(DUPLICATE_INVOICE_NUMBER_SQL[table]).get({
    invoiceNumber: trimmedNumber,
    invoiceId: invoiceId ?? null,
  }) as {id: number} | undefined;

  if (duplicate) {
    throw new AppError(
      `Invoice number "${trimmedNumber}" already exists. Please use a unique invoice number.`,
      ErrorCodes.DUPLICATE_INVOICE_NUMBER,
    );
  }
}

function normalizeInvoiceStatus(status?: string): 'draft' | 'posted' {
  if (!status) return 'posted';
  if (status === 'draft' || status === 'posted') return status;
  throw new AppError('Invoice status is invalid.', ErrorCodes.INVALID_INPUT);
}

function normalizeInvoiceItems(items: NewInvoiceItem[]): NewInvoiceItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(
      'At least one invoice item is required.',
      ErrorCodes.INVALID_INPUT,
    );
  }

  return items.map((raw, index) => {
    const code = String(raw?.code ?? '')
      .trim()
      .toUpperCase();
    const name = String(raw?.name ?? '').trim();
    const rate = Number(raw?.rate);
    const qty = Number(raw?.qty);
    const positionRaw = Number(raw?.position);

    if (!code) {
      throw new AppError(
        `Item ${index + 1}: code is required.`,
        ErrorCodes.INVALID_INPUT,
      );
    }
    if (!name) {
      throw new AppError(
        `Item ${index + 1}: name is required.`,
        ErrorCodes.INVALID_INPUT,
      );
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new AppError(
        `Item ${index + 1}: rate must be greater than 0.`,
        ErrorCodes.INVALID_INPUT,
      );
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new AppError(
        `Item ${index + 1}: qty must be greater than 0.`,
        ErrorCodes.INVALID_INPUT,
      );
    }

    return {
      code,
      name,
      rate,
      qty,
      position: Number.isFinite(positionRaw) ? positionRaw : index,
    };
  });
}

export function getNextPurchaseInvoiceNumber(db: Database.Database): string {
  return getNextInvoiceNumberByTable(db, 'invoices');
}

export function getNextSaleInvoiceNumber(db: Database.Database): string {
  return getNextInvoiceNumberByTable(db, 'sale_invoices');
}

type InvoiceFilters = {
  startDate?: string;
  endDate?: string;
  periodId?: number;
};

function mapPeriodRow(row: any): Period {
  return {
    id: row.id,
    label: row.label,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    closedAt: row.closedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isPeriodOverlapError(error: unknown): boolean {
  return String((error as {message?: string})?.message ?? '').includes(
    'PERIOD_OVERLAP',
  );
}

function isSingleActivePeriodError(error: unknown): boolean {
  return String((error as {message?: string})?.message ?? '').includes(
    'idx_periods_single_active',
  );
}

function periodsOverlap(a: Period, b: Period): boolean {
  return !(a.endDate < b.startDate || a.startDate > b.endDate);
}

function getPeriodById(
  db: Database.Database,
  periodId: number,
): Period | undefined {
  const row = db
    .prepare(
      `SELECT id, label, startDate, endDate, status, closedAt, createdAt, updatedAt
       FROM periods
       WHERE id = ?
       LIMIT 1`,
    )
    .get(periodId) as any;

  return row ? mapPeriodRow(row) : undefined;
}

function getPeriodForDate(
  db: Database.Database,
  dateIso: string,
): Period | undefined {
  const row = db
    .prepare(
      `SELECT id, label, startDate, endDate, status, closedAt, createdAt, updatedAt
       FROM periods
       WHERE startDate <= @dateIso AND endDate >= @dateIso
       ORDER BY startDate DESC
       LIMIT 1`,
    )
    .get({dateIso}) as any;

  return row ? mapPeriodRow(row) : undefined;
}

function getPeriodByDateRange(
  db: Database.Database,
  startDate: string,
  endDate: string,
): Period | undefined {
  const row = db
    .prepare(
      `SELECT id, label, startDate, endDate, status, closedAt, createdAt, updatedAt
       FROM periods
       WHERE startDate = @startDate AND endDate = @endDate
       LIMIT 1`,
    )
    .get({startDate, endDate}) as any;

  return row ? mapPeriodRow(row) : undefined;
}

function buildFallbackActivePeriod(): {
  label: string;
  startDate: string;
  endDate: string;
} {
  const nowIso = new Date().toISOString().slice(0, 10);
  const [year, month] = nowIso.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = endOfMonth(startDate);
  return {
    label: defaultPeriodLabel(startDate, endDate),
    startDate,
    endDate,
  };
}

function ensureActivePeriod(db: Database.Database): number {
  const active = db
    .prepare(
      `SELECT id
       FROM periods
       WHERE status = 'active'
       LIMIT 1`,
    )
    .get() as {id: number} | undefined;
  if (active?.id) return active.id;

  const latest = db
    .prepare(
      `SELECT endDate
       FROM periods
       ORDER BY endDate DESC
       LIMIT 1`,
    )
    .get() as {endDate?: string} | undefined;

  let seed = buildFallbackActivePeriod();
  if (latest?.endDate) {
    const startDate = addDays(toIsoDate(latest.endDate), 1);
    const endDate = endOfMonth(startDate);
    seed = {
      label: defaultPeriodLabel(startDate, endDate),
      startDate,
      endDate,
    };
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO periods (label, startDate, endDate, status, createdAt, updatedAt)
       VALUES (@label, @startDate, @endDate, 'active', @now, @now)`,
    )
    .run({...seed, now});

  return Number(result.lastInsertRowid);
}

function resolveInvoicePeriodId(
  db: Database.Database,
  invoiceDate: string | undefined,
  createdAt?: string,
  allowClosedOverride = false,
): number {
  const normalizedDate = normalizeInvoiceDate(invoiceDate, createdAt);
  const matchingPeriod = getPeriodForDate(db, normalizedDate);
  if (matchingPeriod?.status === 'active') {
    return matchingPeriod.id;
  }

  if (matchingPeriod?.status === 'closed') {
    if (allowClosedOverride) {
      return matchingPeriod.id;
    }

    throw new AppError(
      'Invoice date belongs to a closed period and is read-only.',
      ErrorCodes.PERIOD_CLOSED_READONLY,
    );
  }

  const active = getActivePeriod(db);
  if (!active) {
    return ensureActivePeriod(db);
  }

  return active.id;
}

function assertInvoicePeriodMutable(
  db: Database.Database,
  table: InvoiceTable,
  invoiceId: number,
  allowClosedOverride = false,
): void {
  const row = db
    .prepare(
      `SELECT p.status AS periodStatus
       FROM ${table} i
       LEFT JOIN periods p ON p.id = i.periodId
       WHERE i.id = ?
       LIMIT 1`,
    )
    .get(invoiceId) as {periodStatus?: PeriodStatus} | undefined;

  if (row?.periodStatus === 'closed' && !allowClosedOverride) {
    throw new AppError(
      'This invoice belongs to a closed period and is read-only.',
      ErrorCodes.PERIOD_CLOSED_READONLY,
    );
  }
}

function assertPeriodCanAcceptMutations(
  db: Database.Database,
  periodId: number,
): void {
  const period = getPeriodById(db, periodId);
  if (!period) {
    throw new AppError('Period not found.', ErrorCodes.PERIOD_NOT_FOUND);
  }
  if (period.status === 'closed') {
    throw new AppError(
      'This period is closed and read-only.',
      ErrorCodes.PERIOD_CLOSED_READONLY,
    );
  }
}

function upsertStockSnapshotForPeriod(
  db: Database.Database,
  periodId: number,
): number {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO stock_snapshots (periodId, capturedAt, createdAt, updatedAt)
     VALUES (@periodId, @capturedAt, @capturedAt, @capturedAt)
     ON CONFLICT(periodId)
     DO UPDATE SET
       capturedAt = excluded.capturedAt,
       updatedAt = excluded.updatedAt`,
  ).run({periodId, capturedAt: now});

  const snapshot = db
    .prepare(`SELECT id FROM stock_snapshots WHERE periodId = ? LIMIT 1`)
    .get(periodId) as {id: number} | undefined;

  if (!snapshot) {
    throw new AppError(
      'Failed to create stock snapshot for period.',
      ErrorCodes.INTERNAL_ERROR,
    );
  }

  db.prepare(`DELETE FROM stock_snapshot_items WHERE snapshotId = ?`).run(
    snapshot.id,
  );

  const stocks = db
    .prepare(
      `SELECT code, name, purchaseRate, purchaseQty, saleRate, saleQty
       FROM stock
       ORDER BY id ASC`,
    )
    .all() as Array<{
    code: string;
    name: string;
    purchaseRate: string;
    purchaseQty: number;
    saleRate: string;
    saleQty: number;
  }>;

  const insertSnapshotItem = db.prepare(
    `INSERT INTO stock_snapshot_items (
      snapshotId,
      stockCode,
      stockName,
      purchaseRate,
      purchaseQty,
      saleRate,
      saleQty,
      onHandQty,
      createdAt
    ) VALUES (
      @snapshotId,
      @stockCode,
      @stockName,
      @purchaseRate,
      @purchaseQty,
      @saleRate,
      @saleQty,
      @onHandQty,
      @createdAt
    )`,
  );

  for (const stock of stocks) {
    insertSnapshotItem.run({
      snapshotId: snapshot.id,
      stockCode: stock.code,
      stockName: stock.name,
      purchaseRate: stock.purchaseRate,
      purchaseQty: stock.purchaseQty,
      saleRate: stock.saleRate,
      saleQty: stock.saleQty,
      onHandQty: stock.purchaseQty - stock.saleQty,
      createdAt: now,
    });
  }

  return snapshot.id;
}

function listStockSnapshotItems(
  db: Database.Database,
  encryptionKey: Buffer,
  periodId: number,
): StockItem[] {
  const rows = db
    .prepare(
      `SELECT
        ssi.id,
        ssi.stockCode AS code,
        ssi.stockName AS name,
        ssi.purchaseRate,
        ssi.purchaseQty,
        ssi.saleRate,
        ssi.saleQty,
        ss.capturedAt AS createdAt
       FROM stock_snapshot_items ssi
       INNER JOIN stock_snapshots ss ON ss.id = ssi.snapshotId
       WHERE ss.periodId = ?
       ORDER BY ssi.stockCode ASC`,
    )
    .all(periodId) as any[];

  return rows.map((item) => ({
    ...item,
    purchaseRate: decryptNumber(String(item.purchaseRate), encryptionKey),
    saleRate: decryptNumber(String(item.saleRate), encryptionKey),
  }));
}

export function listPeriods(db: Database.Database): Period[] {
  const rows = db
    .prepare(
      `SELECT id, label, startDate, endDate, status, closedAt, createdAt, updatedAt
       FROM periods
       ORDER BY startDate DESC, id DESC`,
    )
    .all() as any[];

  return rows.map(mapPeriodRow);
}

export function getActivePeriod(db: Database.Database): Period | undefined {
  const row = db
    .prepare(
      `SELECT id, label, startDate, endDate, status, closedAt, createdAt, updatedAt
       FROM periods
       WHERE status = 'active'
       LIMIT 1`,
    )
    .get() as any;

  return row ? mapPeriodRow(row) : undefined;
}

export function createPeriod(
  input: CreatePeriodInput,
  db: Database.Database,
): Period {
  const startDate = toIsoDate(input.startDate);
  const endDate = toIsoDate(input.endDate);

  if (startDate > endDate) {
    throw new AppError(
      'Period start date must be before or equal to end date.',
      ErrorCodes.INVALID_PERIOD_RANGE,
    );
  }

  const status: PeriodStatus = input.status ?? 'closed';
  const label =
    (input.label && input.label.trim()) ||
    defaultPeriodLabel(startDate, endDate);
  const now = new Date().toISOString();

  try {
    const info = db
      .prepare(
        `INSERT INTO periods (label, startDate, endDate, status, closedAt, createdAt, updatedAt)
         VALUES (@label, @startDate, @endDate, @status, @closedAt, @createdAt, @updatedAt)`,
      )
      .run({
        label,
        startDate,
        endDate,
        status,
        closedAt: status === 'closed' ? now : null,
        createdAt: now,
        updatedAt: now,
      });

    const created = getPeriodById(db, Number(info.lastInsertRowid));
    if (!created) {
      throw new AppError('Failed to create period.', ErrorCodes.INTERNAL_ERROR);
    }
    return created;
  } catch (error) {
    if (isPeriodOverlapError(error)) {
      throw new AppError(
        'Period dates overlap with an existing period.',
        ErrorCodes.PERIOD_OVERLAP,
      );
    }
    if (isSingleActivePeriodError(error)) {
      throw new AppError(
        'Only one active period is allowed at a time.',
        ErrorCodes.PERIOD_ACTIVE_EXISTS,
      );
    }
    throw error;
  }
}

export function closePeriod(
  input: ClosePeriodInput,
  db: Database.Database,
): ClosePeriodResult {
  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    const target = getPeriodById(db, input.periodId);
    if (!target) {
      throw new AppError('Period not found.', ErrorCodes.PERIOD_NOT_FOUND);
    }
    if (target.status !== 'active') {
      throw new AppError(
        'Only the active period can be closed.',
        ErrorCodes.PERIOD_NOT_ACTIVE,
      );
    }

    const snapshotId = upsertStockSnapshotForPeriod(db, target.id);

    let nextActiveId = input.nextPeriodId;
    if (!nextActiveId && input.nextPeriod) {
      const nextStartDate = toIsoDate(input.nextPeriod.startDate);
      const nextEndDate = toIsoDate(input.nextPeriod.endDate);

      const existingExactRange = getPeriodByDateRange(
        db,
        nextStartDate,
        nextEndDate,
      );

      if (existingExactRange) {
        nextActiveId = existingExactRange.id;
      } else {
        const created = createPeriod(
          {
            ...input.nextPeriod,
            startDate: nextStartDate,
            endDate: nextEndDate,
            status: 'closed',
          },
          db,
        );
        nextActiveId = created.id;
      }
    }

    if (!nextActiveId) {
      throw new AppError(
        'Closing a period requires the next active period.',
        ErrorCodes.NEXT_ACTIVE_PERIOD_REQUIRED,
      );
    }

    if (nextActiveId === target.id) {
      throw new AppError(
        'Next active period must be different from the closed period.',
        ErrorCodes.NEXT_ACTIVE_PERIOD_REQUIRED,
      );
    }

    const nextPeriod = getPeriodById(db, nextActiveId);
    if (!nextPeriod) {
      throw new AppError('Next period not found.', ErrorCodes.PERIOD_NOT_FOUND);
    }

    if (periodsOverlap(nextPeriod, target)) {
      throw new AppError(
        'Next active period overlaps the closing period.',
        ErrorCodes.PERIOD_OVERLAP,
      );
    }

    db.prepare(
      `UPDATE periods
       SET status = 'closed',
           closedAt = @now,
           updatedAt = @now
       WHERE id = @id`,
    ).run({id: target.id, now});

    db.prepare(
      `UPDATE periods
       SET status = 'active',
           closedAt = NULL,
           updatedAt = @now
       WHERE id = @id`,
    ).run({id: nextActiveId, now});

    const closedPeriod = getPeriodById(db, target.id);
    const activePeriod = getPeriodById(db, nextActiveId);
    if (!closedPeriod || !activePeriod) {
      throw new AppError(
        'Failed to finalize period closeout.',
        ErrorCodes.INTERNAL_ERROR,
      );
    }

    return {
      closedPeriod,
      activePeriod,
      snapshotId,
    };
  });

  return tx();
}

export function reopenPeriod(periodId: number, db: Database.Database): Period {
  const tx = db.transaction(() => {
    const period = getPeriodById(db, periodId);
    if (!period) {
      throw new AppError('Period not found.', ErrorCodes.PERIOD_NOT_FOUND);
    }

    const otherActive = db
      .prepare(
        `SELECT id
         FROM periods
         WHERE status = 'active' AND id != @periodId
         LIMIT 1`,
      )
      .get({periodId}) as {id: number} | undefined;

    if (otherActive) {
      throw new AppError(
        'Cannot reopen while another active period exists.',
        ErrorCodes.PERIOD_ACTIVE_EXISTS,
      );
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE periods
       SET status = 'active',
           closedAt = NULL,
           updatedAt = @now
       WHERE id = @periodId`,
    ).run({periodId, now});

    const reopened = getPeriodById(db, periodId);
    if (!reopened) {
      throw new AppError('Failed to reopen period.', ErrorCodes.INTERNAL_ERROR);
    }

    return reopened;
  });

  return tx();
}

// ==================== INVOICES ====================

export function listInvoices(
  db: Database.Database,
  encryptionKey: Buffer,
  filters: InvoiceFilters = {},
): Invoice[] {
  let sql = `
    SELECT
      i.id,
      i.invoiceNumber,
      i.invoiceDate,
      i.supplierName,
      i.total,
      i.totalQty,
      i.status,
      i.periodId,
      p.status AS periodStatus,
      i.createdAt,
      i.updatedAt
    FROM invoices i
    LEFT JOIN periods p ON p.id = i.periodId
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (typeof filters.periodId === 'number') {
    conditions.push(`i.periodId = ?`);
    params.push(filters.periodId);
  }

  if (filters.startDate) {
    conditions.push(`COALESCE(i.invoiceDate, substr(i.createdAt, 1, 10)) >= ?`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`COALESCE(i.invoiceDate, substr(i.createdAt, 1, 10)) <= ?`);
    params.push(filters.endDate);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY i.createdAt DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    number: row.invoiceNumber || '',
    invoiceDate: row.invoiceDate,
    supplierName: decrypt(row.supplierName, encryptionKey),
    total: decryptNumber(String(row.total), encryptionKey),
    totalQty: row.totalQty || 0,
    status: row.status || 'draft',
    periodId: row.periodId ?? undefined,
    periodStatus: row.periodStatus ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function createInvoice(
  input: NewPurchaseInvoice,
  db: Database.Database,
  encryptionKey: Buffer,
) {
  const invoiceNumber = String(input.number ?? '').trim();
  assertUniqueInvoiceNumber(db, 'invoices', invoiceNumber);

  const createdAt = new Date().toISOString();

  const encrypted = encryptionService.encryptFields(
    {
      supplierName: input.supplierName,
      address: input.address,
      contactNo: input.contactNo,
    },
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey,
  );

  const periodId = resolveInvoicePeriodId(db, input.invoiceDate, createdAt);
  assertPeriodCanAcceptMutations(db, periodId);

  const stmt = db.prepare(
    `INSERT INTO invoices (
      invoiceNumber,
      supplierName,
      total,
      createdAt,
      address,
      invoiceDate,
      contactNo,
      status,
      periodId
    )
     VALUES (
      @invoiceNumber,
      @supplierName,
      @total,
      @createdAt,
      @address,
      @invoiceDate,
      @contactNo,
      @status,
      @periodId
    )`,
  );
  const info = stmt.run({
    invoiceNumber,
    supplierName: encrypted.supplierName,
    total: encryptNumber(input.total, encryptionKey),
    createdAt,
    address: encrypted.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
    contactNo: encrypted.contactNo ?? '',
    status: 'draft',
    periodId,
  });

  return {
    id: Number(info.lastInsertRowid),
    number: invoiceNumber,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? '',
    invoiceDate: input.invoiceDate ?? null,
    contactNo: input.contactNo ?? '',
    status: 'draft',
    periodId,
    periodStatus: 'active',
  } as const;
}

export function deleteInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer,
): void {
  assertInvoicePeriodMutable(db, 'invoices', id);
  db.prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}

export function getInvoice(
  id: number,
  db: Database.Database,
  encryptionKey: Buffer,
): InvoiceWithItems | undefined {
  const inv = db
    .prepare(
      `SELECT
        i.id,
        i.invoiceNumber,
        i.supplierName,
        i.total,
        i.createdAt,
        i.address,
        i.invoiceDate,
        i.contactNo,
        i.status,
        i.periodId,
        p.status AS periodStatus
       FROM invoices i
       LEFT JOIN periods p ON p.id = i.periodId
       WHERE i.id = ?`,
    )
    .get(id) as any;

  if (!inv) return undefined;

  const decrypted = encryptionService.decryptFields(
    inv,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey,
  );

  const items = db
    .prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`,
    )
    .all(id) as any[];

  const decryptedItems = items.map((item) => ({
    ...item,
    rate: decryptNumber(String(item.rate), encryptionKey),
  }));

  return {
    invoice: {
      ...decrypted,
      number: inv.invoiceNumber || '',
      total: decryptNumber(String(inv.total), encryptionKey),
      status: inv.status || 'posted',
      periodId: inv.periodId ?? undefined,
      periodStatus: inv.periodStatus ?? undefined,
    } as any,
    items: decryptedItems,
  };
}

export type SavePurchaseInvoicePayload = {
  id?: number;
  number: string;
  supplierName: string;
  total: number;
  address?: string;
  invoiceDate: string;
  contactNo?: string;
  items: NewInvoiceItem[];
  status?: 'draft' | 'posted';
  overrideClosedPeriod?: boolean;
};

export function saveInvoice(
  payload: SavePurchaseInvoicePayload,
  db: Database.Database,
  encryptionKey: Buffer,
): InvoiceWithItems {
  const p = payload;
  const invoiceNumber = String(p.number ?? '').trim();
  const supplierName = String(p.supplierName ?? '').trim();
  const address = String(p.address ?? '').trim();
  const contactNo = String(p.contactNo ?? '').trim();
  const total = Number(p.total);
  const items = normalizeInvoiceItems(p.items ?? []);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const newStatus = normalizeInvoiceStatus(p.status);
  const overrideClosedPeriod = Boolean(p.id && p.overrideClosedPeriod);

  if (!supplierName) {
    throw new AppError('Supplier name is required.', ErrorCodes.INVALID_INPUT);
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new AppError('Invoice total is invalid.', ErrorCodes.INVALID_INPUT);
  }

  assertUniqueInvoiceNumber(db, 'invoices', invoiceNumber, p.id);

  const finalInvoiceDate = normalizeRequiredInvoiceDate(p.invoiceDate);

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: 'draft' | 'posted' | undefined;
  let periodId: number | undefined;

  const tx = db.transaction(() => {
    if (p.id) {
      assertInvoicePeriodMutable(db, 'invoices', p.id, overrideClosedPeriod);

      const prevInvoice = db
        .prepare(
          'SELECT status, periodId, createdAt FROM invoices WHERE id = ?',
        )
        .get(p.id) as any;
      previousStatus = prevInvoice?.status || 'posted';
      periodId = Number(prevInvoice?.periodId ?? 0) || undefined;

      if (!periodId) {
        periodId = resolveInvoicePeriodId(
          db,
          finalInvoiceDate,
          prevInvoice?.createdAt,
          overrideClosedPeriod,
        );
      }

      if (periodId) {
        if (overrideClosedPeriod) {
          const period = getPeriodById(db, periodId);
          if (!period) {
            throw new AppError(
              'Period not found.',
              ErrorCodes.PERIOD_NOT_FOUND,
            );
          }
        } else {
          assertPeriodCanAcceptMutations(db, periodId);
        }
      }

      const prevRaw = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ?`,
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rate: decryptNumber(String(item.rate), encryptionKey),
      }));

      db.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);

      const enc = encryptionService.encryptFields(
        {
          supplierName,
          address,
          contactNo,
        },
        ENCRYPTED_INVOICE_FIELDS,
        encryptionKey,
      );

      db.prepare(
        `UPDATE invoices 
         SET invoiceNumber = @invoiceNumber, supplierName = @supplierName, total = @total,
             totalQty = @totalQty,
             address = @address, invoiceDate = @invoiceDate, contactNo = @contactNo,
             status = @status, periodId = @periodId
         WHERE id = @id`,
      ).run({
        id: p.id,
        invoiceNumber,
        supplierName: enc.supplierName,
        total: encryptNumber(total, encryptionKey),
        totalQty,
        address: enc.address || null,
        invoiceDate: finalInvoiceDate || null,
        contactNo: enc.contactNo || null,
        status: newStatus,
        periodId: periodId ?? null,
      });
    } else {
      periodId = resolveInvoicePeriodId(db, finalInvoiceDate);
      assertPeriodCanAcceptMutations(db, periodId);

      const enc = encryptionService.encryptFields(
        {
          supplierName,
          address,
          contactNo,
        },
        ENCRYPTED_INVOICE_FIELDS,
        encryptionKey,
      );
      const info = db
        .prepare(
          `INSERT INTO invoices (
            invoiceNumber,
            supplierName,
            total,
            totalQty,
            createdAt,
            address,
            invoiceDate,
            contactNo,
            status,
            periodId
          )
           VALUES (
            @invoiceNumber,
            @supplierName,
            @total,
            @totalQty,
            @createdAt,
            @address,
            @invoiceDate,
            @contactNo,
            @status,
            @periodId
          )`,
        )
        .run({
          invoiceNumber,
          supplierName: enc.supplierName,
          total: encryptNumber(total, encryptionKey),
          totalQty,
          createdAt: new Date().toISOString(),
          address: enc.address || null,
          invoiceDate: finalInvoiceDate || null,
          contactNo: enc.contactNo || null,
          status: newStatus,
          periodId,
        });
      invoiceId = Number(info.lastInsertRowid);
    }

    const insertItem = db.prepare(
      `INSERT INTO invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`,
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        qty: it.qty,
        position: it.position,
      });
    }

    updateStockOnPurchase(
      db,
      items,
      newStatus,
      previousItems,
      previousStatus,
      encryptionKey,
    );
  });

  tx();
  return getInvoice(invoiceId!, db, encryptionKey)!;
}

// ==================== STOCK ====================

export function listStock(
  db: Database.Database,
  encryptionKey: Buffer,
  filters: {periodId?: number} = {},
): StockItem[] {
  if (typeof filters.periodId === 'number') {
    const selectedPeriod = getPeriodById(db, filters.periodId);
    if (selectedPeriod?.status === 'closed') {
      return listStockSnapshotItems(db, encryptionKey, selectedPeriod.id);
    }
  }

  const results = db
    .prepare(
      `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt
       FROM stock ORDER BY id DESC`,
    )
    .all() as any[];

  return results.map((item) => ({
    ...item,
    purchaseRate: decryptNumber(String(item.purchaseRate), encryptionKey),
    saleRate: decryptNumber(String(item.saleRate), encryptionKey),
  }));
}

export function createStock(
  input: NewStockItem,
  db: Database.Database,
  encryptionKey: Buffer,
): StockItem {
  const code = normalizeCode(input.code);
  const name = String(input.name ?? '').trim();

  try {
    const stmt = db.prepare(`
      INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
      VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))
    `);
    const info = stmt.run({
      code,
      name,
      purchaseRate: encryptNumber(+input.purchaseRate || 0, encryptionKey),
      purchaseQty: +input.purchaseQty || 0,
      saleRate: encryptNumber(+input.saleRate || 0, encryptionKey),
      saleQty: +input.saleQty || 0,
    });

    const result = db
      .prepare(`SELECT * FROM stock WHERE id=@id`)
      .get({id: info.lastInsertRowid}) as any;

    return {
      ...result,
      purchaseRate: decryptNumber(String(result.purchaseRate), encryptionKey),
      saleRate: decryptNumber(String(result.saleRate), encryptionKey),
    };
  } catch (e: any) {
    if (
      String(e?.message || '').includes('UNIQUE') &&
      String(e?.message || '').includes('code')
    ) {
      throw new AppError(
        `Code "${code}" already exists. Please use a unique code.`,
        ErrorCodes.DUPLICATE_CODE,
      );
    }
    throw e;
  }
}

export function updateStock(
  id: number,
  input: NewStockItem,
  db: Database.Database,
  encryptionKey: Buffer,
): StockItem {
  const code = normalizeCode(input.code);
  const name = String(input.name ?? '').trim();

  try {
    db.prepare(
      `UPDATE stock
       SET code=@code, name=@name, purchaseRate=@purchaseRate, purchaseQty=@purchaseQty,
           saleRate=@saleRate, saleQty=@saleQty
       WHERE id=@id`,
    ).run({
      id,
      code,
      name,
      purchaseRate: encryptNumber(+input.purchaseRate || 0, encryptionKey),
      purchaseQty: +input.purchaseQty || 0,
      saleRate: encryptNumber(+input.saleRate || 0, encryptionKey),
      saleQty: +input.saleQty || 0,
    });

    const result = db
      .prepare(`SELECT * FROM stock WHERE id=@id`)
      .get({id}) as any;

    return {
      ...result,
      purchaseRate: decryptNumber(String(result.purchaseRate), encryptionKey),
      saleRate: decryptNumber(String(result.saleRate), encryptionKey),
    };
  } catch (e: any) {
    if (
      String(e?.message || '').includes('UNIQUE') &&
      String(e?.message || '').includes('code')
    ) {
      throw new AppError(
        `Code "${code}" already exists. Please use a unique code.`,
        ErrorCodes.DUPLICATE_CODE,
      );
    }
    throw e;
  }
}

export function deleteStock(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer,
): void {
  db.prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}

// ==================== STOCK UPDATE HELPERS ====================

function updateStockOnPurchase(
  db: Database.Database,
  items: NewInvoiceItem[],
  newStatus: 'draft' | 'posted',
  previousItems: InvoiceItem[] | undefined,
  previousStatus: 'draft' | 'posted' | undefined,
  encryptionKey: Buffer,
) {
  if (previousItems && previousStatus === 'posted') {
    for (const item of previousItems) {
      const stock = db
        .prepare(`SELECT purchaseQty, purchaseRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        const newQty = stock.purchaseQty - item.qty;
        db.prepare(
          `UPDATE stock SET purchaseQty = @qty WHERE code = @code`,
        ).run({
          code: item.code,
          qty: newQty,
        });
      }
    }
  }

  if (newStatus === 'posted') {
    for (const item of items) {
      const stock = db
        .prepare(`SELECT purchaseQty, purchaseRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET purchaseQty = purchaseQty + @qty,
               purchaseRate = @rate,
               name = @name
           WHERE code = @code`,
        ).run({
          code: item.code,
          qty: item.qty,
          rate: encryptNumber(item.rate, encryptionKey),
          name: item.name,
        });
      } else {
        db.prepare(
          `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
           VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))`,
        ).run({
          code: item.code,
          name: item.name,
          purchaseRate: encryptNumber(item.rate, encryptionKey),
          purchaseQty: item.qty,
          saleRate: encryptNumber(0, encryptionKey),
          saleQty: 0,
        });
      }
    }
  }
}

function updateStockOnSale(
  db: Database.Database,
  items: NewInvoiceItem[],
  newStatus: 'draft' | 'posted',
  previousItems: InvoiceItem[] | undefined,
  previousStatus: 'draft' | 'posted' | undefined,
  encryptionKey: Buffer,
) {
  if (previousItems && previousStatus === 'posted') {
    for (const item of previousItems) {
      const stock = db
        .prepare(`SELECT saleQty, saleRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        const newQty = stock.saleQty - item.qty;
        db.prepare(`UPDATE stock SET saleQty = @qty WHERE code = @code`).run({
          code: item.code,
          qty: newQty,
        });
      }
    }
  }

  if (newStatus === 'posted') {
    for (const item of items) {
      const stock = db
        .prepare(`SELECT saleQty, saleRate FROM stock WHERE code = ?`)
        .get(item.code) as any;

      if (stock) {
        db.prepare(
          `UPDATE stock
           SET saleQty = saleQty + @qty,
               saleRate = @rate,
               name = @name
           WHERE code = @code`,
        ).run({
          code: item.code,
          qty: item.qty,
          rate: encryptNumber(item.rate, encryptionKey),
          name: item.name,
        });
      } else {
        db.prepare(
          `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
           VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))`,
        ).run({
          code: item.code,
          name: item.name,
          purchaseRate: encryptNumber(0, encryptionKey),
          purchaseQty: 0,
          saleRate: encryptNumber(item.rate, encryptionKey),
          saleQty: item.qty,
        });
      }
    }
  }
}

// ==================== SALE INVOICES ====================

export function listSaleInvoices(
  db: Database.Database,
  encryptionKey: Buffer,
  filters: InvoiceFilters = {},
): SaleInvoice[] {
  let sql = `
    SELECT
      s.id,
      s.invoiceNumber,
      s.invoiceDate,
      s.customerName,
      s.total,
      s.totalQty,
      s.status,
      s.periodId,
      p.status AS periodStatus,
      s.createdAt,
      s.updatedAt
    FROM sale_invoices s
    LEFT JOIN periods p ON p.id = s.periodId
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (typeof filters.periodId === 'number') {
    conditions.push(`s.periodId = ?`);
    params.push(filters.periodId);
  }

  if (filters.startDate) {
    conditions.push(`COALESCE(s.invoiceDate, substr(s.createdAt, 1, 10)) >= ?`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`COALESCE(s.invoiceDate, substr(s.createdAt, 1, 10)) <= ?`);
    params.push(filters.endDate);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY s.createdAt DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    number: row.invoiceNumber || '',
    invoiceDate: row.invoiceDate,
    customerName: decrypt(row.customerName, encryptionKey),
    total: decryptNumber(String(row.total), encryptionKey),
    totalQty: row.totalQty || 0,
    status: row.status || 'draft',
    periodId: row.periodId ?? undefined,
    periodStatus: row.periodStatus ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function createSaleInvoice(
  input: NewSaleInvoice,
  db: Database.Database,
  encryptionKey: Buffer,
) {
  const p = input;
  const invoiceNumber = String(p.number ?? '').trim();
  assertUniqueInvoiceNumber(db, 'sale_invoices', invoiceNumber);

  const enc = encryptionService.encryptFields(
    {
      customerName: p.customerName,
      address: p.address ?? '',
      contactNo: p.contactNo ?? '',
    },
    ENCRYPTED_SALE_INVOICE_FIELDS,
    encryptionKey,
  );
  const createdAt = new Date().toISOString();
  const periodId = resolveInvoicePeriodId(db, p.invoiceDate, createdAt);
  assertPeriodCanAcceptMutations(db, periodId);

  const info = db
    .prepare(
      `INSERT INTO sale_invoices (
        invoiceNumber,
        customerName,
        total,
        createdAt,
        address,
        invoiceDate,
        contactNo,
        status,
        periodId
      )
       VALUES (
        @invoiceNumber,
        @customerName,
        @total,
        @createdAt,
        @address,
        @invoiceDate,
        @contactNo,
        @status,
        @periodId
      )`,
    )
    .run({
      invoiceNumber,
      customerName: enc.customerName,
      total: encryptNumber(p.total, encryptionKey),
      createdAt,
      address: enc.address || null,
      invoiceDate: p.invoiceDate ?? null,
      contactNo: enc.contactNo || null,
      status: 'draft',
      periodId,
    });
  const id = Number(info.lastInsertRowid);
  return getSaleInvoice(id, db, encryptionKey)!;
}

export function deleteSaleInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer,
): void {
  assertInvoicePeriodMutable(db, 'sale_invoices', id);
  db.prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}

export function getSaleInvoice(
  id: number,
  db: Database.Database,
  encryptionKey: Buffer,
): InvoiceWithItems | undefined {
  const invoice = db
    .prepare(
      `SELECT
        s.id,
        s.invoiceNumber,
        s.customerName,
        s.total,
        s.createdAt,
        s.address,
        s.invoiceDate,
        s.contactNo,
        s.status,
        s.periodId,
        p.status AS periodStatus
       FROM sale_invoices s
       LEFT JOIN periods p ON p.id = s.periodId
       WHERE s.id = ?`,
    )
    .get(id) as any;
  if (!invoice) return undefined;

  const decryptedInvoice = encryptionService.decryptFields(
    invoice,
    ENCRYPTED_SALE_INVOICE_FIELDS,
    encryptionKey,
  );
  const itemsOut = db
    .prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`,
    )
    .all(id) as any[];
  const decryptedItems = itemsOut.map((item) => ({
    ...item,
    rate: decryptNumber(String(item.rate), encryptionKey),
  }));
  return {
    invoice: {
      ...decryptedInvoice,
      number: invoice.invoiceNumber || '',
      total: decryptNumber(String(invoice.total), encryptionKey),
      status: invoice.status || 'posted',
      periodId: invoice.periodId ?? undefined,
      periodStatus: invoice.periodStatus ?? undefined,
    } as any,
    items: decryptedItems as any,
  };
}

export type SaveSaleInvoicePayload = {
  id?: number;
  number: string;
  customerName: string;
  total: number;
  address?: string;
  invoiceDate: string;
  contactNo?: string;
  items: NewInvoiceItem[];
  status?: 'draft' | 'posted';
  overrideClosedPeriod?: boolean;
};

export function saveSaleInvoice(
  payload: SaveSaleInvoicePayload,
  db: Database.Database,
  encryptionKey: Buffer,
): InvoiceWithItems {
  const p = payload;
  const invoiceNumber = String(p.number ?? '').trim();
  const customerName = String(p.customerName ?? '').trim();
  const address = String(p.address ?? '').trim();
  const contactNo = String(p.contactNo ?? '').trim();
  const total = Number(p.total);
  const items = normalizeInvoiceItems(p.items ?? []);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const newStatus = normalizeInvoiceStatus(p.status);
  const overrideClosedPeriod = Boolean(p.id && p.overrideClosedPeriod);

  if (!customerName) {
    throw new AppError('Customer name is required.', ErrorCodes.INVALID_INPUT);
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new AppError('Invoice total is invalid.', ErrorCodes.INVALID_INPUT);
  }

  assertUniqueInvoiceNumber(db, 'sale_invoices', invoiceNumber, p.id);

  const finalInvoiceDate = normalizeRequiredInvoiceDate(p.invoiceDate);

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: 'draft' | 'posted' | undefined;
  let periodId: number | undefined;

  const tx = db.transaction(() => {
    if (p.id) {
      assertInvoicePeriodMutable(
        db,
        'sale_invoices',
        p.id,
        overrideClosedPeriod,
      );

      const prevInvoice = db
        .prepare(
          'SELECT status, periodId, createdAt FROM sale_invoices WHERE id = ?',
        )
        .get(p.id) as any;
      previousStatus = prevInvoice?.status || 'posted';
      periodId = Number(prevInvoice?.periodId ?? 0) || undefined;

      if (!periodId) {
        periodId = resolveInvoicePeriodId(
          db,
          finalInvoiceDate,
          prevInvoice?.createdAt,
          overrideClosedPeriod,
        );
      }

      if (periodId) {
        if (overrideClosedPeriod) {
          const period = getPeriodById(db, periodId);
          if (!period) {
            throw new AppError(
              'Period not found.',
              ErrorCodes.PERIOD_NOT_FOUND,
            );
          }
        } else {
          assertPeriodCanAcceptMutations(db, periodId);
        }
      }

      const prevRaw = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, qty, position
           FROM sale_invoice_items WHERE invoiceId = ?`,
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rate: decryptNumber(String(item.rate), encryptionKey),
      }));

      db.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(
        p.id,
      );

      const enc = encryptionService.encryptFields(
        {
          customerName,
          address,
          contactNo,
        },
        ENCRYPTED_SALE_INVOICE_FIELDS,
        encryptionKey,
      );

      db.prepare(
        `UPDATE sale_invoices
         SET invoiceNumber = @invoiceNumber, customerName = @customerName, total = @total,
             totalQty = @totalQty,
             address = @address, invoiceDate = @invoiceDate, contactNo = @contactNo,
             status = @status, periodId = @periodId
         WHERE id = @id`,
      ).run({
        id: p.id,
        invoiceNumber,
        customerName: enc.customerName,
        total: encryptNumber(total, encryptionKey),
        totalQty,
        address: enc.address || null,
        invoiceDate: finalInvoiceDate || null,
        contactNo: enc.contactNo || null,
        status: newStatus,
        periodId: periodId ?? null,
      });
    } else {
      periodId = resolveInvoicePeriodId(db, finalInvoiceDate);
      assertPeriodCanAcceptMutations(db, periodId);

      const enc = encryptionService.encryptFields(
        {
          customerName,
          address,
          contactNo,
        },
        ENCRYPTED_SALE_INVOICE_FIELDS,
        encryptionKey,
      );
      const info = db
        .prepare(
          `INSERT INTO sale_invoices (
            invoiceNumber,
            customerName,
            total,
            totalQty,
            createdAt,
            address,
            invoiceDate,
            contactNo,
            status,
            periodId
          )
           VALUES (
            @invoiceNumber,
            @customerName,
            @total,
            @totalQty,
            @createdAt,
            @address,
            @invoiceDate,
            @contactNo,
            @status,
            @periodId
          )`,
        )
        .run({
          invoiceNumber,
          customerName: enc.customerName,
          total: encryptNumber(total, encryptionKey),
          totalQty,
          createdAt: new Date().toISOString(),
          address: enc.address || null,
          invoiceDate: finalInvoiceDate || null,
          contactNo: enc.contactNo || null,
          status: newStatus,
          periodId,
        });
      invoiceId = Number(info.lastInsertRowid);
    }

    const insertItem = db.prepare(
      `INSERT INTO sale_invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`,
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        qty: it.qty,
        position: it.position,
      });
    }

    updateStockOnSale(
      db,
      items,
      newStatus,
      previousItems,
      previousStatus,
      encryptionKey,
    );
  });

  tx();
  return getSaleInvoice(invoiceId!, db, encryptionKey)!;
}

// ==================== LEDGER ====================

export function ledgerSave(
  payload: LedgerSavePayload,
  db: Database.Database,
  encryptionKey: Buffer,
): {
  id?: number;
  error?: string;
} {
  const {id, customerName, contactNo, totals, rows} = payload;

  const transaction = db.transaction(() => {
    let ledgerId = id;

    const encryptedCustomerName = encryptionService.encrypt(
      customerName,
      encryptionKey,
    );
    const encryptedContactNo = contactNo
      ? encryptionService.encrypt(contactNo, encryptionKey)
      : '';

    if (ledgerId) {
      // ✅ FIX: Use ledgers table (consistent naming)
      db.prepare(
        `UPDATE ledgers SET
         customerName = @customerName,
         contactNo = @contactNo,
         totalDebit = @totalDebit,
         totalCredit = @totalCredit,
         netBalance = @netBalance
         WHERE id = @id`,
      ).run({
        id: ledgerId,
        customerName: encryptedCustomerName,
        contactNo: encryptedContactNo,
        totalDebit: encryptNumber(totals.debit, encryptionKey),
        totalCredit: encryptNumber(totals.credit, encryptionKey),
        netBalance: encryptNumber(totals.net, encryptionKey),
      });

      db.prepare('DELETE FROM ledger_rows WHERE ledgerId = ?').run(ledgerId);
    } else {
      // ✅ FIX: Use ledgers table
      const info = db
        .prepare(
          `INSERT INTO ledgers (customerName, contactNo, totalDebit, totalCredit, netBalance, createdAt)
           VALUES (@customerName, @contactNo, @totalDebit, @totalCredit, @netBalance, datetime('now'))`,
        )
        .run({
          customerName: encryptedCustomerName,
          contactNo: encryptedContactNo,
          totalDebit: encryptNumber(totals.debit, encryptionKey),
          totalCredit: encryptNumber(totals.credit, encryptionKey),
          netBalance: encryptNumber(totals.net, encryptionKey),
        });
      ledgerId = Number(info.lastInsertRowid);
    }

    const insertRow = db.prepare(
      `INSERT INTO ledger_rows (ledgerId, date, particulars, debit, credit, crDr, position)
       VALUES (@ledgerId, @date, @particulars, @debit, @credit, @crDr, @position)`,
    );

    rows.forEach((row, index) => {
      const particulars = row.particulars?.trim()
        ? encryptionService.encrypt(row.particulars, encryptionKey)
        : '';

      insertRow.run({
        ledgerId,
        date: row.date,
        particulars,
        debit: encryptNumber(row.debit || 0, encryptionKey),
        credit: encryptNumber(row.credit || 0, encryptionKey),
        crDr: row.crDr,
        position: index,
      });
    });

    return ledgerId;
  });

  try {
    const newId = transaction();
    return {id: newId};
  } catch (error: any) {
    console.error('Ledger save failed:', error);
    return {error: error.message};
  }
}

export function getLedger(
  id: number,
  db: Database.Database,
  encryptionKey: Buffer,
) {
  // ✅ FIX: Use ledgers table
  const ledger = db
    .prepare(
      `SELECT
        id,
        customerName,
        contactNo,
        totalDebit,
        totalCredit,
        netBalance
       FROM ledgers WHERE id = ?`,
    )
    .get(id) as any;

  if (!ledger) return undefined;

  const decryptedLedger = encryptionService.decryptFields(
    ledger,
    ENCRYPTED_LEDGER_FIELDS,
    encryptionKey,
  );

  const rows = db
    .prepare(
      `SELECT id, ledgerId, date, particulars, debit, credit, crDr, position
       FROM ledger_rows WHERE ledgerId = ? ORDER BY position ASC`,
    )
    .all(id) as any[];

  const decryptedRows = rows.map((row) => {
    let particulars = row.particulars;
    if (encryptionService.isEncrypted(row.particulars)) {
      try {
        const val = encryptionService.decrypt(row.particulars, encryptionKey);
        if (val === row.particulars && row.particulars.includes(':')) {
          particulars = '';
        } else {
          particulars = val;
        }
      } catch {
        particulars = '';
      }
    }

    return {
      ...row,
      particulars,
      debit: decryptNumber(String(row.debit), encryptionKey),
      credit: decryptNumber(String(row.credit), encryptionKey),
    };
  });

  return {
    ledger: {
      ...decryptedLedger,
      totalDebit: decryptNumber(String(ledger.totalDebit), encryptionKey),
      totalCredit: decryptNumber(String(ledger.totalCredit), encryptionKey),
      netBalance: decryptNumber(String(ledger.netBalance), encryptionKey),
    },
    rows: decryptedRows,
  };
}

export function listLedgers(db: Database.Database, encryptionKey: Buffer) {
  // ✅ FIX: Use ledgers table
  const results = db
    .prepare(
      `SELECT
        id,
        customerName,
        totalDebit,
        totalCredit,
        netBalance
       FROM ledgers
       ORDER BY id DESC`,
    )
    .all() as any[];

  return results.map((ledger) => {
    const decrypted = encryptionService.decryptFields(
      ledger,
      ['customerName'] as const,
      encryptionKey,
    );
    return {
      ...decrypted,
      totals: {
        debit: decryptNumber(String(ledger.totalDebit), encryptionKey),
        credit: decryptNumber(String(ledger.totalCredit), encryptionKey),
        net: decryptNumber(String(ledger.netBalance), encryptionKey),
      },
    };
  });
}

export function deleteLedger(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer,
): void {
  // ✅ FIX: Use ledgers table
  db.prepare(`DELETE FROM ledgers WHERE id = ?`).run(id);
}

// ==================== SCHEMA ====================

export function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT,
      invoiceDate TEXT,
      supplierName TEXT,
      total TEXT DEFAULT '0',
      totalQty INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      periodId INTEGER,
      address TEXT,
      contactNo TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (periodId) REFERENCES periods(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER,
      code TEXT,
      name TEXT,
      rate TEXT DEFAULT '0',
      qty INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sale_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT,
      invoiceDate TEXT,
      customerName TEXT,
      total TEXT DEFAULT '0',
      totalQty INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      periodId INTEGER,
      address TEXT,
      contactNo TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (periodId) REFERENCES periods(id)
    );

    CREATE TABLE IF NOT EXISTS sale_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER,
      code TEXT,
      name TEXT,
      rate TEXT DEFAULT '0',
      qty INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES sale_invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT,
      purchaseRate TEXT DEFAULT '0',
      purchaseQty INTEGER DEFAULT 0,
      saleRate TEXT DEFAULT '0',
      saleQty INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      contactNo TEXT,
      totalDebit TEXT DEFAULT '0',
      totalCredit TEXT DEFAULT '0',
      netBalance TEXT DEFAULT '0',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ledger_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledgerId INTEGER,
      date TEXT,
      particulars TEXT,
      debit TEXT DEFAULT '0',
      credit TEXT DEFAULT '0',
      crDr TEXT DEFAULT 'DR',
      position INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ledgerId) REFERENCES ledgers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
      closedAt TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      CHECK(startDate <= endDate)
    );

    CREATE TABLE IF NOT EXISTS stock_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodId INTEGER NOT NULL UNIQUE,
      capturedAt TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock_snapshot_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshotId INTEGER NOT NULL,
      stockCode TEXT NOT NULL,
      stockName TEXT,
      purchaseRate TEXT DEFAULT '0',
      purchaseQty INTEGER DEFAULT 0,
      saleRate TEXT DEFAULT '0',
      saleQty INTEGER DEFAULT 0,
      onHandQty INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (snapshotId) REFERENCES stock_snapshots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_periods_single_active
      ON periods(status)
      WHERE status = 'active';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_snapshot_items_unique_code
      ON stock_snapshot_items(snapshotId, stockCode);

    CREATE INDEX IF NOT EXISTS idx_stock_snapshots_period_id
      ON stock_snapshots(periodId);
  `);

  createPeriodOverlapTriggers(db);

  runMigrations(db);
}

function createPeriodOverlapTriggers(db: Database.Database) {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS periods_no_overlap_insert
    BEFORE INSERT ON periods
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM periods p
          WHERE NOT (NEW.endDate < p.startDate OR NEW.startDate > p.endDate)
        )
        THEN RAISE(ABORT, 'PERIOD_OVERLAP')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS periods_no_overlap_update
    BEFORE UPDATE OF startDate, endDate ON periods
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM periods p
          WHERE p.id != NEW.id
            AND NOT (NEW.endDate < p.startDate OR NEW.startDate > p.endDate)
        )
        THEN RAISE(ABORT, 'PERIOD_OVERLAP')
      END;
    END;
  `);
}

function runMigrations(db: Database.Database) {
  const getColumns = (table: string): string[] => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      return cols.map((c) => c.name);
    } catch {
      return [];
    }
  };

  const tableExists = (table: string): boolean => {
    try {
      const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table);
      return !!result;
    } catch {
      return false;
    }
  };

  // Migration: Add status column to invoices
  const invoiceCols = getColumns('invoices');
  if (invoiceCols.length > 0 && !invoiceCols.includes('status')) {
    db.exec(`ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'draft'`);
  }

  if (invoiceCols.length > 0 && !invoiceCols.includes('periodId')) {
    db.exec(`ALTER TABLE invoices ADD COLUMN periodId INTEGER`);
  }

  // Migration: Add status column to sale_invoices
  const saleInvoiceCols = getColumns('sale_invoices');
  if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes('status')) {
    db.exec(`ALTER TABLE sale_invoices ADD COLUMN status TEXT DEFAULT 'draft'`);
  }

  if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes('periodId')) {
    db.exec(`ALTER TABLE sale_invoices ADD COLUMN periodId INTEGER`);
  }

  // Migration: Add totalQty to invoices
  if (invoiceCols.length > 0 && !invoiceCols.includes('totalQty')) {
    db.exec(`ALTER TABLE invoices ADD COLUMN totalQty INTEGER DEFAULT 0`);
  }

  // Migration: Add totalQty to sale_invoices
  if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes('totalQty')) {
    db.exec(`ALTER TABLE sale_invoices ADD COLUMN totalQty INTEGER DEFAULT 0`);
  }

  // Migration: Rename ledger to ledgers if needed
  if (!tableExists('ledgers') && tableExists('ledger')) {
    db.exec(`ALTER TABLE ledger RENAME TO ledgers`);
  }

  // Migration: Add columns to ledgers
  const ledgerCols = getColumns('ledgers');
  if (ledgerCols.length > 0) {
    if (!ledgerCols.includes('totalDebit')) {
      db.exec(`ALTER TABLE ledgers ADD COLUMN totalDebit TEXT DEFAULT '0'`);
    }
    if (!ledgerCols.includes('totalCredit')) {
      db.exec(`ALTER TABLE ledgers ADD COLUMN totalCredit TEXT DEFAULT '0'`);
    }
    if (!ledgerCols.includes('netBalance')) {
      db.exec(`ALTER TABLE ledgers ADD COLUMN netBalance TEXT DEFAULT '0'`);
    }
  }

  // Migration: Rename ledger_entries to ledger_rows if needed
  if (!tableExists('ledger_rows') && tableExists('ledger_entries')) {
    db.exec(`ALTER TABLE ledger_entries RENAME TO ledger_rows`);
  }

  // Migration: Legacy stock_snapshots table had a different shape; rebuild it.
  const snapshotCols = getColumns('stock_snapshots');
  if (snapshotCols.length > 0 && !snapshotCols.includes('periodId')) {
    db.exec(`DROP TABLE IF EXISTS stock_snapshot_items`);
    db.exec(`DROP TABLE IF EXISTS stock_snapshots`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        periodId INTEGER NOT NULL UNIQUE,
        capturedAt TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS stock_snapshot_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshotId INTEGER NOT NULL,
        stockCode TEXT NOT NULL,
        stockName TEXT,
        purchaseRate TEXT DEFAULT '0',
        purchaseQty INTEGER DEFAULT 0,
        saleRate TEXT DEFAULT '0',
        saleQty INTEGER DEFAULT 0,
        onHandQty INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (snapshotId) REFERENCES stock_snapshots(id) ON DELETE CASCADE
      );
    `);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_periods_single_active
      ON periods(status)
      WHERE status = 'active';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_snapshot_items_unique_code
      ON stock_snapshot_items(snapshotId, stockCode);

    CREATE INDEX IF NOT EXISTS idx_stock_snapshots_period_id
      ON stock_snapshots(periodId);

    CREATE INDEX IF NOT EXISTS idx_invoices_period_id
      ON invoices(periodId);

    CREATE INDEX IF NOT EXISTS idx_sale_invoices_period_id
      ON sale_invoices(periodId);
  `);

  createPeriodOverlapTriggers(db);

  const activePeriodId = ensureActivePeriod(db);
  const pickPeriodByDate = db.prepare(
    `SELECT id
     FROM periods
     WHERE startDate <= @day AND endDate >= @day
     ORDER BY startDate DESC
     LIMIT 1`,
  );

  const backfillPeriodIds = (table: InvoiceTable) => {
    const rows = db
      .prepare(
        `SELECT id, invoiceDate, createdAt
         FROM ${table}
         WHERE periodId IS NULL`,
      )
      .all() as Array<{id: number; invoiceDate?: string; createdAt?: string}>;

    const updateStmt = db.prepare(
      `UPDATE ${table}
       SET periodId = @periodId
       WHERE id = @id`,
    );

    for (const row of rows) {
      const day = normalizeInvoiceDate(row.invoiceDate, row.createdAt);
      const matched = pickPeriodByDate.get({day}) as {id?: number} | undefined;
      const periodId = Number(matched?.id ?? 0) || activePeriodId;
      updateStmt.run({id: row.id, periodId});
    }
  };

  backfillPeriodIds('invoices');
  backfillPeriodIds('sale_invoices');
}

// ==================== META ====================

export function setMeta(
  db: Database.Database,
  key: string,
  value: string,
): void {
  try {
    db.prepare(
      `INSERT INTO meta (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    ).run({key, value});
  } catch {
    // meta writes are non-critical
  }
}

export function getMeta(
  db: Database.Database,
  key: string,
): string | undefined {
  try {
    const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
      | {value?: string}
      | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}
