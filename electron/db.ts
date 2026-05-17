import Database from "better-sqlite3";
import { AppError, ErrorCodes } from "./errors";
import { normalizeCode } from "./utils";
import { encryptionService } from "./encryption";

// Fields to encrypt
const ENCRYPTED_INVOICE_FIELDS = [
  "supplierName",
  "address",
  "contactNo",
] as const;
const ENCRYPTED_SALE_INVOICE_FIELDS = [
  "customerName",
  "address",
  "contactNo",
] as const;
const ENCRYPTED_LEDGER_FIELDS = ["customerName", "contactNo"] as const;

type Invoice = {
  id: number;
  number: string;
  invoiceSequence?: number | null;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
  status: "draft" | "posted";
  periodId?: number;
  periodStatus?: PeriodStatus;
};

type SaleInvoice = {
  id: number;
  number: string;
  invoiceSequence?: number | null;
  customerName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  contactNo?: string;
  status: "draft" | "posted";
  periodId?: number;
  periodStatus?: PeriodStatus;
};

type PeriodStatus = "active" | "closed";

type Period = {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClosePeriodInput = {
  periodId: number;
  startDate?: string;
  endDate?: string;
  label?: string;
};

type ClosePeriodResult = {
  closedPeriod: Period;
  activePeriod: Period | null;
  snapshotId: number;
};

export type ReopenContext = {
  activePeriodId: number;
  returnPeriodId: number;
};

const META_REOPEN_ACTIVE_PERIOD_ID = "period.reopen.activePeriodId";
const META_REOPEN_RETURN_PERIOD_ID = "period.reopen.returnPeriodId";

export type NewStockItem = {
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
};
type StockItem = NewStockItem & { id: number; createdAt: string };

export type NewInvoiceItem = {
  code: string;
  name: string;
  rate: number;
  qty: number;
  position: number;
};
type InvoiceItem = NewInvoiceItem & { id: number; invoiceId: number };
type InvoiceWithItems = { invoice: Invoice; items: InvoiceItem[] };

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
    crDr: "CR" | "DR";
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
  if (!value) return "";
  if (!encryptionService.isEncrypted(value)) {
    return value;
  }
  try {
    return encryptionService.decrypt(value, key);
  } catch {
    return value;
  }
}

type InvoiceTable = "invoices" | "sale_invoices";

function toIsoDate(value: string): string {
  return value.slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const base = new Date(`${dateIso}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function endOfMonth(dateIso: string): string {
  const [yearText, monthText] = dateIso.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  return date.toISOString().slice(0, 10);
}

function formatDateShort(dateIso: string): string {
  const [yearText, monthText, dayText] = toIsoDate(dateIso).split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthIndex = Math.max(0, Math.min(11, Number(monthText) - 1));
  const month = months[monthIndex] || "Jan";
  return `${dayText}-${month}-${yearText.slice(-2)}`;
}

function defaultPeriodLabel(startDate: string): string {
  return formatDateShort(startDate);
}

function monthName(dateIso: string): string {
  const date = new Date(`${toIsoDate(dateIso)}T00:00:00.000Z`);
  return date.toLocaleString("en-US", { month: "short" });
}

function defaultClosedPeriodLabel(startDate: string, endDate: string): string {
  const start = monthName(startDate);
  const end = monthName(endDate);
  const year = toIsoDate(endDate).slice(0, 4);
  return start === end ? `${start} ${year}` : `${start}-${end} ${year}`;
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
  const trimmed = String(invoiceDate ?? "").trim();
  if (!trimmed) {
    throw new AppError("Invoice date is required.", ErrorCodes.INVALID_INPUT);
  }

  if (Number.isNaN(Date.parse(trimmed))) {
    throw new AppError("Invoice date is invalid.", ErrorCodes.INVALID_INPUT);
  }

  return toIsoDate(trimmed);
}

type InvoiceCounterKind = "purchase" | "sale";

const INVOICE_COUNTER_KIND_BY_TABLE: Record<InvoiceTable, InvoiceCounterKind> =
  {
    invoices: "purchase",
    sale_invoices: "sale",
  };

const DUPLICATE_INVOICE_NUMBER_SQL: Record<InvoiceTable, string> = {
  invoices: `
    SELECT id
    FROM invoices
    WHERE invoiceNumber = @invoiceNumber
      AND ((@periodId IS NULL AND periodId IS NULL) OR periodId = @periodId)
      AND (@invoiceId IS NULL OR id != @invoiceId)
    LIMIT 1
  `,
  sale_invoices: `
    SELECT id
    FROM sale_invoices
    WHERE invoiceNumber = @invoiceNumber
      AND ((@periodId IS NULL AND periodId IS NULL) OR periodId = @periodId)
      AND (@invoiceId IS NULL OR id != @invoiceId)
    LIMIT 1
  `,
};

function parseManagedInvoiceSequence(invoiceNumber: string): number | null {
  const trimmed = invoiceNumber.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getCounterLastNumber(
  db: Database.Database,
  table: InvoiceTable,
  periodId: number,
): number {
  const row = db
    .prepare(
      `SELECT lastNumber
       FROM invoice_counters
       WHERE kind = @kind AND periodId = @periodId
       LIMIT 1`,
    )
    .get({
      kind: INVOICE_COUNTER_KIND_BY_TABLE[table],
      periodId,
    }) as { lastNumber?: number } | undefined;

  const lastNumber = Number(row?.lastNumber ?? 0);
  if (!Number.isFinite(lastNumber) || lastNumber < 0) {
    return 0;
  }

  return lastNumber;
}

function getMaxPeriodSequenceFromInvoices(
  db: Database.Database,
  table: InvoiceTable,
  periodId: number,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(
          MAX(
            CASE
              WHEN invoiceSequence IS NOT NULL AND invoiceSequence > 0 THEN invoiceSequence
              WHEN invoiceNumber IS NOT NULL
                   AND TRIM(invoiceNumber) <> ''
                   AND TRIM(invoiceNumber) GLOB '[0-9]*'
                   AND TRIM(invoiceNumber) NOT GLOB '*[^0-9]*'
                   AND CAST(TRIM(invoiceNumber) AS INTEGER) > 0
                THEN CAST(TRIM(invoiceNumber) AS INTEGER)
              ELSE NULL
            END
          ),
          0
        ) AS maxSequence
       FROM ${table}
       WHERE periodId = @periodId`,
    )
    .get({ periodId }) as { maxSequence?: number } | undefined;

  const maxSequence = Number(row?.maxSequence ?? 0);
  if (!Number.isFinite(maxSequence) || maxSequence < 0) {
    return 0;
  }

  return maxSequence;
}

function syncInvoiceCounterAtLeast(
  db: Database.Database,
  table: InvoiceTable,
  periodId: number,
  minimum: number,
): void {
  const normalizedMinimum = Number.isFinite(minimum)
    ? Math.max(0, Math.floor(minimum))
    : 0;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO invoice_counters (kind, periodId, lastNumber, createdAt, updatedAt)
     VALUES (@kind, @periodId, @lastNumber, @now, @now)
     ON CONFLICT(kind, periodId)
     DO UPDATE SET
       lastNumber = CASE
         WHEN invoice_counters.lastNumber < excluded.lastNumber
           THEN excluded.lastNumber
         ELSE invoice_counters.lastNumber
       END,
       updatedAt = excluded.updatedAt`,
  ).run({
    kind: INVOICE_COUNTER_KIND_BY_TABLE[table],
    periodId,
    lastNumber: normalizedMinimum,
    now,
  });
}

function reserveNextInvoiceSequence(
  db: Database.Database,
  table: InvoiceTable,
  periodId: number,
): number {
  const currentMax = getMaxPeriodSequenceFromInvoices(db, table, periodId);
  syncInvoiceCounterAtLeast(db, table, periodId, currentMax);

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE invoice_counters
     SET lastNumber = lastNumber + 1,
         updatedAt = @now
     WHERE kind = @kind AND periodId = @periodId`,
  ).run({
    kind: INVOICE_COUNTER_KIND_BY_TABLE[table],
    periodId,
    now,
  });

  const row = db
    .prepare(
      `SELECT lastNumber
       FROM invoice_counters
       WHERE kind = @kind AND periodId = @periodId
       LIMIT 1`,
    )
    .get({
      kind: INVOICE_COUNTER_KIND_BY_TABLE[table],
      periodId,
    }) as { lastNumber?: number } | undefined;

  const next = Number(row?.lastNumber ?? 0);
  if (!Number.isFinite(next) || next <= 0) {
    throw new AppError(
      "Failed to allocate invoice number.",
      ErrorCodes.INTERNAL_ERROR,
    );
  }

  return next;
}

function getNextInvoiceNumberByTable(
  db: Database.Database,
  table: InvoiceTable,
  periodId?: number,
): string {
  const resolvedPeriodId =
    typeof periodId === "number" && Number.isFinite(periodId) && periodId > 0
      ? periodId
      : ensureActivePeriod(db);
  const counterMax = getCounterLastNumber(db, table, resolvedPeriodId);
  const rowMax = getMaxPeriodSequenceFromInvoices(db, table, resolvedPeriodId);
  return String(Math.max(counterMax, rowMax) + 1);
}

function assertUniqueInvoiceNumber(
  db: Database.Database,
  table: InvoiceTable,
  invoiceNumber: string,
  periodId: number | null,
  invoiceId?: number,
): void {
  const trimmedNumber = invoiceNumber.trim();
  if (!trimmedNumber) {
    throw new AppError("Invoice number is required.", ErrorCodes.INVALID_INPUT);
  }

  const duplicate = db.prepare(DUPLICATE_INVOICE_NUMBER_SQL[table]).get({
    invoiceNumber: trimmedNumber,
    periodId,
    invoiceId: invoiceId ?? null,
  }) as { id: number } | undefined;

  if (duplicate) {
    throw new AppError(
      `Invoice number "${trimmedNumber}" already exists in this period. Please use a unique invoice number.`,
      ErrorCodes.DUPLICATE_INVOICE_NUMBER,
    );
  }
}

function normalizeInvoiceStatus(status?: string): "draft" | "posted" {
  if (!status) return "posted";
  if (status === "draft" || status === "posted") return status;
  throw new AppError("Invoice status is invalid.", ErrorCodes.INVALID_INPUT);
}

function normalizeInvoiceItems(items: NewInvoiceItem[]): NewInvoiceItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(
      "At least one invoice item is required.",
      ErrorCodes.INVALID_INPUT,
    );
  }

  return items.map((raw, index) => {
    const code = String(raw?.code ?? "")
      .trim()
      .toUpperCase();
    const name = String(raw?.name ?? "").trim();
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

export function getNextPurchaseInvoiceNumber(
  db: Database.Database,
  periodId?: number,
): string {
  return getNextInvoiceNumberByTable(db, "invoices", periodId);
}

export function getNextSaleInvoiceNumber(
  db: Database.Database,
  periodId?: number,
): string {
  return getNextInvoiceNumberByTable(db, "sale_invoices", periodId);
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
    .get({ dateIso }) as any;

  return row ? mapPeriodRow(row) : undefined;
}

function buildFallbackActivePeriod(): {
  label: string;
  startDate: string;
  endDate: string;
} {
  const nowIso = new Date().toISOString().slice(0, 10);
  const [year, month] = nowIso.split("-");
  const startDate = `${year}-${month}-01`;
  const endDate = endOfMonth(startDate);
  return {
    label: defaultPeriodLabel(startDate),
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
    .get() as { id: number } | undefined;
  if (active?.id) return active.id;

  const latest = db
    .prepare(
      `SELECT endDate
       FROM periods
       ORDER BY endDate DESC
       LIMIT 1`,
    )
    .get() as { endDate?: string } | undefined;

  let seed = buildFallbackActivePeriod();
  if (latest?.endDate) {
    const startDate = addDays(toIsoDate(latest.endDate), 1);
    const endDate = endOfMonth(startDate);
    seed = {
      label: defaultPeriodLabel(startDate),
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
    .run({ ...seed, now });

  return Number(result.lastInsertRowid);
}

function setMetaValue(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value)
     VALUES (@key, @value)
     ON CONFLICT(key)
     DO UPDATE SET value = excluded.value`,
  ).run({ key, value });
}

function getMetaValue(db: Database.Database, key: string): string | null {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key = ? LIMIT 1`)
    .get(key) as { value?: string } | undefined;
  return typeof row?.value === "string" ? row.value : null;
}

function deleteMetaValue(db: Database.Database, key: string): void {
  db.prepare(`DELETE FROM meta WHERE key = ?`).run(key);
}

function clearReopenContext(db: Database.Database): void {
  deleteMetaValue(db, META_REOPEN_ACTIVE_PERIOD_ID);
  deleteMetaValue(db, META_REOPEN_RETURN_PERIOD_ID);
}

function setReopenContext(
  db: Database.Database,
  activePeriodId: number,
  returnPeriodId: number,
): void {
  setMetaValue(db, META_REOPEN_ACTIVE_PERIOD_ID, String(activePeriodId));
  setMetaValue(db, META_REOPEN_RETURN_PERIOD_ID, String(returnPeriodId));
}

export function getReopenContext(db: Database.Database): ReopenContext | null {
  const activePeriodIdRaw = getMetaValue(db, META_REOPEN_ACTIVE_PERIOD_ID);
  const returnPeriodIdRaw = getMetaValue(db, META_REOPEN_RETURN_PERIOD_ID);

  if (!activePeriodIdRaw && !returnPeriodIdRaw) {
    return null;
  }

  const activePeriodId = Number(activePeriodIdRaw ?? 0);
  const returnPeriodId = Number(returnPeriodIdRaw ?? 0);

  if (
    !Number.isFinite(activePeriodId) ||
    !Number.isFinite(returnPeriodId) ||
    activePeriodId <= 0 ||
    returnPeriodId <= 0
  ) {
    clearReopenContext(db);
    return null;
  }

  return {
    activePeriodId,
    returnPeriodId,
  };
}

function resolveInvoicePeriodId(
  db: Database.Database,
  invoiceDate: string | undefined,
  createdAt?: string,
  allowClosedOverride = false,
): number {
  const normalizedDate = normalizeInvoiceDate(invoiceDate, createdAt);
  const matchingPeriod = getPeriodForDate(db, normalizedDate);
  if (matchingPeriod?.status === "active") {
    return matchingPeriod.id;
  }

  if (matchingPeriod?.status === "closed") {
    if (allowClosedOverride) {
      return matchingPeriod.id;
    }

    throw new AppError(
      "Invoice date belongs to a closed period and is read-only.",
      ErrorCodes.PERIOD_CLOSED_READONLY,
    );
  }

  throw new AppError(
    "Invoice date does not belong to any defined period.",
    ErrorCodes.PERIOD_NOT_FOUND,
  );
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
    .get(invoiceId) as { periodStatus?: PeriodStatus } | undefined;

  if (row?.periodStatus === "closed" && !allowClosedOverride) {
    throw new AppError(
      "This invoice belongs to a closed period and is read-only.",
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
    throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
  }
  if (period.status === "closed") {
    throw new AppError(
      "This period is closed and read-only.",
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
  ).run({ periodId, capturedAt: now });

  const snapshot = db
    .prepare(`SELECT id FROM stock_snapshots WHERE periodId = ? LIMIT 1`)
    .get(periodId) as { id: number } | undefined;

  if (!snapshot) {
    throw new AppError(
      "Failed to create stock snapshot for period.",
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

function restoreStockFromSnapshotForPeriod(
  db: Database.Database,
  periodId: number,
): void {
  const snapshot = db
    .prepare(`SELECT id FROM stock_snapshots WHERE periodId = ? LIMIT 1`)
    .get(periodId) as { id: number } | undefined;

  if (!snapshot) {
    throw new AppError(
      "Selected period has no stock snapshot to restore.",
      ErrorCodes.INTERNAL_ERROR,
    );
  }

  const rows = db
    .prepare(
      `SELECT
        stockCode AS code,
        stockName AS name,
        purchaseRate,
        purchaseQty,
        saleRate,
        saleQty
       FROM stock_snapshot_items
       WHERE snapshotId = ?
       ORDER BY id ASC`,
    )
    .all(snapshot.id) as Array<{
    code: string;
    name: string;
    purchaseRate: string;
    purchaseQty: number;
    saleRate: string;
    saleQty: number;
  }>;

  db.prepare(`DELETE FROM stock`).run();

  const now = new Date().toISOString();
  const insertStock = db.prepare(
    `INSERT INTO stock (
      code,
      name,
      purchaseRate,
      purchaseQty,
      saleRate,
      saleQty,
      createdAt,
      updatedAt
    ) VALUES (
      @code,
      @name,
      @purchaseRate,
      @purchaseQty,
      @saleRate,
      @saleQty,
      @now,
      @now
    )`,
  );

  for (const row of rows) {
    insertStock.run({
      code: row.code,
      name: row.name,
      purchaseRate: row.purchaseRate,
      purchaseQty: row.purchaseQty,
      saleRate: row.saleRate,
      saleQty: row.saleQty,
      now,
    });
  }
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

export function closePeriod(
  input: ClosePeriodInput,
  db: Database.Database,
): ClosePeriodResult {
  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    const closeDate = toIsoDate(now);
    const target = getPeriodById(db, input.periodId);
    if (!target) {
      throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
    }
    if (target.status !== "active") {
      throw new AppError(
        "Only the active period can be closed.",
        ErrorCodes.PERIOD_NOT_ACTIVE,
      );
    }

    const targetStartDate = input.startDate
      ? toIsoDate(input.startDate)
      : target.startDate;
    const targetEndDate = input.endDate
      ? toIsoDate(input.endDate)
      : target.endDate;
    const targetLabel =
      String(input.label ?? "").trim() ||
      defaultClosedPeriodLabel(targetStartDate, targetEndDate);
    if (targetStartDate > targetEndDate) {
      throw new AppError(
        "Period start date cannot be after the end date.",
        ErrorCodes.INVALID_INPUT,
      );
    }

    const targetEndDateAtClose =
      closeDate < target.startDate
        ? targetStartDate
        : closeDate < targetEndDate
          ? closeDate
          : targetEndDate;
    const snapshotId = upsertStockSnapshotForPeriod(db, target.id);
    if (target.status === "active") {
      db.prepare(
        `UPDATE periods
         SET status = 'closed',
             label = @label,
             startDate = COALESCE(@startDate, startDate),
             endDate = @endDate,
             closedAt = @now,
             updatedAt = @now
         WHERE id = @id`,
      ).run({
        id: target.id,
        label: targetLabel,
        startDate: input.startDate ?? null,
        endDate: targetEndDateAtClose,
        now,
      });
    } else {
      db.prepare(
        `UPDATE periods
         SET endDate = @endDate,
             label = @label,
             startDate = COALESCE(@startDate, startDate),
             updatedAt = @now
         WHERE id = @id`,
      ).run({
        id: target.id,
        label: targetLabel,
        startDate: input.startDate ?? null,
        endDate: targetEndDateAtClose,
        now,
      });
    }

    clearReopenContext(db);

    const closedPeriod = getPeriodById(db, target.id);
    const activePeriod =
      getActivePeriod(db) ?? getPeriodById(db, ensureActivePeriod(db)) ?? null;
    if (!closedPeriod) {
      throw new AppError(
        "Failed to finalize period closeout.",
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
      throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
    }
    if (period.status !== "closed") {
      throw new AppError(
        "Only closed periods can be reopened.",
        ErrorCodes.PERIOD_NOT_ACTIVE,
      );
    }

    const currentActive = getActivePeriod(db);
    if (currentActive && currentActive.id !== periodId) {
      upsertStockSnapshotForPeriod(db, currentActive.id);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE periods
       SET status = 'closed',
           closedAt = COALESCE(closedAt, @now),
           updatedAt = @now
       WHERE status = 'active' AND id != @periodId`,
    ).run({ periodId, now });

    db.prepare(
      `UPDATE periods
       SET status = 'active',
           closedAt = NULL,
           updatedAt = @now
       WHERE id = @periodId`,
    ).run({ periodId, now });

    restoreStockFromSnapshotForPeriod(db, period.id);

    if (currentActive && currentActive.id !== periodId) {
      setReopenContext(db, period.id, currentActive.id);
    } else {
      clearReopenContext(db);
    }

    const reopened = getPeriodById(db, periodId);
    if (!reopened) {
      throw new AppError("Failed to reopen period.", ErrorCodes.INTERNAL_ERROR);
    }

    return reopened;
  });

  return tx();
}

export function closeReopenedPeriod(db: Database.Database): ClosePeriodResult {
  const tx = db.transaction(() => {
    const context = getReopenContext(db);
    if (!context) {
      throw new AppError(
        "No reopened period is currently active.",
        ErrorCodes.PERIOD_NOT_ACTIVE,
      );
    }

    const activePeriod = getActivePeriod(db);
    if (!activePeriod) {
      clearReopenContext(db);
      throw new AppError(
        "Active period not found.",
        ErrorCodes.PERIOD_NOT_FOUND,
      );
    }

    if (activePeriod.id !== context.activePeriodId) {
      clearReopenContext(db);
      throw new AppError(
        "Reopened period context is no longer valid.",
        ErrorCodes.PERIOD_NOT_ACTIVE,
      );
    }

    const returnPeriod = getPeriodById(db, context.returnPeriodId);
    if (!returnPeriod) {
      clearReopenContext(db);
      throw new AppError(
        "Return period not found.",
        ErrorCodes.PERIOD_NOT_FOUND,
      );
    }

    if (periodsOverlap(returnPeriod, activePeriod)) {
      throw new AppError(
        "Return period overlaps the period being closed.",
        ErrorCodes.PERIOD_OVERLAP,
      );
    }

    const now = new Date().toISOString();
    const snapshotId = upsertStockSnapshotForPeriod(db, activePeriod.id);

    db.prepare(
      `UPDATE periods
       SET status = 'closed',
           closedAt = @now,
           updatedAt = @now
       WHERE id = @id`,
    ).run({ id: activePeriod.id, now });

    db.prepare(
      `UPDATE periods
       SET status = 'active',
           closedAt = NULL,
           updatedAt = @now
       WHERE id = @id`,
    ).run({ id: returnPeriod.id, now });

    if (returnPeriod.status === "closed") {
      restoreStockFromSnapshotForPeriod(db, returnPeriod.id);
    }

    clearReopenContext(db);

    const closedPeriod = getPeriodById(db, activePeriod.id);
    const resumedActivePeriod = getPeriodById(db, returnPeriod.id);
    if (!closedPeriod || !resumedActivePeriod) {
      throw new AppError(
        "Failed to close reopened period.",
        ErrorCodes.INTERNAL_ERROR,
      );
    }

    return {
      closedPeriod,
      activePeriod: resumedActivePeriod,
      snapshotId,
    };
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
      i.invoiceSequence,
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

  if (typeof filters.periodId === "number") {
    conditions.push(`i.periodId = ?`);
    params.push(filters.periodId);
  } else {
    if (filters.startDate) {
      conditions.push(
        `COALESCE(i.invoiceDate, substr(i.createdAt, 1, 10)) >= ?`,
      );
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(
        `COALESCE(i.invoiceDate, substr(i.createdAt, 1, 10)) <= ?`,
      );
      params.push(filters.endDate);
    }
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  sql += ` ORDER BY i.createdAt DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    number: row.invoiceNumber || "",
    invoiceSequence:
      typeof row.invoiceSequence === "number"
        ? row.invoiceSequence
        : row.invoiceSequence != null
          ? Number(row.invoiceSequence)
          : null,
    invoiceDate: row.invoiceDate,
    supplierName: decrypt(row.supplierName, encryptionKey),
    total: decryptNumber(String(row.total), encryptionKey),
    totalQty: row.totalQty || 0,
    status: row.status || "draft",
    periodId: row.periodId ?? undefined,
    periodStatus: row.periodStatus ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function deleteInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer,
): void {
  assertInvoicePeriodMutable(db, "invoices", id);
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
        i.invoiceSequence,
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
      number: inv.invoiceNumber || "",
      invoiceSequence:
        typeof inv.invoiceSequence === "number"
          ? inv.invoiceSequence
          : inv.invoiceSequence != null
            ? Number(inv.invoiceSequence)
            : null,
      total: decryptNumber(String(inv.total), encryptionKey),
      status: inv.status || "posted",
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
  status?: "draft" | "posted";
  overrideClosedPeriod?: boolean;
  periodId?: number;
};

export function saveInvoice(
  payload: SavePurchaseInvoicePayload,
  db: Database.Database,
  encryptionKey: Buffer,
): InvoiceWithItems {
  const p = payload;
  const requestedInvoiceNumber = String(p.number ?? "").trim();
  const supplierName = String(p.supplierName ?? "").trim();
  const address = String(p.address ?? "").trim();
  const contactNo = String(p.contactNo ?? "").trim();
  const total = Number(p.total);
  const items = normalizeInvoiceItems(p.items ?? []);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const newStatus = normalizeInvoiceStatus(p.status);
  const overrideClosedPeriod = Boolean(p.overrideClosedPeriod);

  if (!supplierName) {
    throw new AppError("Supplier name is required.", ErrorCodes.INVALID_INPUT);
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new AppError("Invoice total is invalid.", ErrorCodes.INVALID_INPUT);
  }

  const finalInvoiceDate = normalizeRequiredInvoiceDate(p.invoiceDate);

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: "draft" | "posted" | undefined;
  let periodId: number | undefined;

  const tx = db.transaction(() => {
    if (p.id) {
      assertInvoicePeriodMutable(db, "invoices", p.id, overrideClosedPeriod);

      const prevInvoice = db
        .prepare(
          "SELECT status, periodId, createdAt, invoiceSequence FROM invoices WHERE id = ?",
        )
        .get(p.id) as
        | {
            status?: "draft" | "posted";
            periodId?: number | null;
            createdAt?: string;
            invoiceSequence?: number | null;
          }
        | undefined;

      previousStatus = prevInvoice?.status || "posted";
      const originalPeriodId = Number(prevInvoice?.periodId ?? 0) || undefined;
      periodId = originalPeriodId;

      // If caller provided explicit periodId override, prefer it (allows editing a historical period)
      if (typeof p.periodId === "number") {
        periodId = p.periodId || undefined;
      }

      if (!periodId) {
        periodId = resolveInvoicePeriodId(
          db,
          finalInvoiceDate,
          prevInvoice?.createdAt,
          overrideClosedPeriod,
        );
      }

      if (overrideClosedPeriod) {
        const period = getPeriodById(db, periodId);
        if (!period) {
          throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
        }
      } else {
        assertPeriodCanAcceptMutations(db, periodId);
      }

      const existingSequence =
        Number(prevInvoice?.invoiceSequence ?? 0) || null;
      let finalInvoiceNumber = requestedInvoiceNumber;
      let finalInvoiceSequence: number | null = existingSequence;

      if (existingSequence !== null) {
        const parsedRequested = parseManagedInvoiceSequence(
          requestedInvoiceNumber,
        );
        if (parsedRequested !== existingSequence) {
          throw new AppError(
            "Invoice number is system-managed for this record and cannot be changed.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        if (originalPeriodId && periodId !== originalPeriodId) {
          throw new AppError(
            "System-managed invoice numbering does not allow moving invoice across periods.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        finalInvoiceNumber = String(existingSequence);
      } else {
        if (!finalInvoiceNumber) {
          throw new AppError(
            "Invoice number is required.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        assertUniqueInvoiceNumber(
          db,
          "invoices",
          finalInvoiceNumber,
          periodId ?? null,
          p.id,
        );

        finalInvoiceSequence = null;
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
         SET invoiceNumber = @invoiceNumber,
             invoiceSequence = @invoiceSequence,
             supplierName = @supplierName,
             total = @total,
             totalQty = @totalQty,
             address = @address,
             invoiceDate = @invoiceDate,
             contactNo = @contactNo,
             status = @status,
             periodId = @periodId
         WHERE id = @id`,
      ).run({
        id: p.id,
        invoiceNumber: finalInvoiceNumber,
        invoiceSequence: finalInvoiceSequence,
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
      if (typeof p.periodId === "number") {
        periodId = p.periodId;
      } else {
        periodId = resolveInvoicePeriodId(db, finalInvoiceDate);
      }

      if (overrideClosedPeriod) {
        const period = getPeriodById(db, periodId);
        if (!period) {
          throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
        }
      } else {
        assertPeriodCanAcceptMutations(db, periodId);
      }

      const reservedSequence = reserveNextInvoiceSequence(
        db,
        "invoices",
        periodId,
      );
      const finalInvoiceNumber = String(reservedSequence);

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
            invoiceSequence,
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
            @invoiceSequence,
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
          invoiceNumber: finalInvoiceNumber,
          invoiceSequence: reservedSequence,
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
  filters: { periodId?: number } = {},
): StockItem[] {
  if (typeof filters.periodId === "number") {
    const selectedPeriod = getPeriodById(db, filters.periodId);
    if (selectedPeriod?.status === "closed") {
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
  const name = String(input.name ?? "").trim();

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
      .get({ id: info.lastInsertRowid }) as any;

    return {
      ...result,
      purchaseRate: decryptNumber(String(result.purchaseRate), encryptionKey),
      saleRate: decryptNumber(String(result.saleRate), encryptionKey),
    };
  } catch (e: any) {
    if (
      String(e?.message || "").includes("UNIQUE") &&
      String(e?.message || "").includes("code")
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
  const name = String(input.name ?? "").trim();

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
      .get({ id }) as any;

    return {
      ...result,
      purchaseRate: decryptNumber(String(result.purchaseRate), encryptionKey),
      saleRate: decryptNumber(String(result.saleRate), encryptionKey),
    };
  } catch (e: any) {
    if (
      String(e?.message || "").includes("UNIQUE") &&
      String(e?.message || "").includes("code")
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
  newStatus: "draft" | "posted",
  previousItems: InvoiceItem[] | undefined,
  previousStatus: "draft" | "posted" | undefined,
  encryptionKey: Buffer,
) {
  if (previousItems && previousStatus === "posted") {
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

  if (newStatus === "posted") {
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
  newStatus: "draft" | "posted",
  previousItems: InvoiceItem[] | undefined,
  previousStatus: "draft" | "posted" | undefined,
  encryptionKey: Buffer,
) {
  if (previousItems && previousStatus === "posted") {
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

  if (newStatus === "posted") {
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
      s.invoiceSequence,
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

  if (typeof filters.periodId === "number") {
    conditions.push(`s.periodId = ?`);
    params.push(filters.periodId);
  } else {
    if (filters.startDate) {
      conditions.push(
        `COALESCE(s.invoiceDate, substr(s.createdAt, 1, 10)) >= ?`,
      );
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(
        `COALESCE(s.invoiceDate, substr(s.createdAt, 1, 10)) <= ?`,
      );
      params.push(filters.endDate);
    }
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  sql += ` ORDER BY s.createdAt DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    number: row.invoiceNumber || "",
    invoiceSequence:
      typeof row.invoiceSequence === "number"
        ? row.invoiceSequence
        : row.invoiceSequence != null
          ? Number(row.invoiceSequence)
          : null,
    invoiceDate: row.invoiceDate,
    customerName: decrypt(row.customerName, encryptionKey),
    total: decryptNumber(String(row.total), encryptionKey),
    totalQty: row.totalQty || 0,
    status: row.status || "draft",
    periodId: row.periodId ?? undefined,
    periodStatus: row.periodStatus ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function deleteSaleInvoice(
  id: number,
  db: Database.Database,
  _encryptionKey: Buffer,
): void {
  assertInvoicePeriodMutable(db, "sale_invoices", id);
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
        s.invoiceSequence,
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
      number: invoice.invoiceNumber || "",
      invoiceSequence:
        typeof invoice.invoiceSequence === "number"
          ? invoice.invoiceSequence
          : invoice.invoiceSequence != null
            ? Number(invoice.invoiceSequence)
            : null,
      total: decryptNumber(String(invoice.total), encryptionKey),
      status: invoice.status || "posted",
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
  status?: "draft" | "posted";
  overrideClosedPeriod?: boolean;
  periodId?: number;
};

export function saveSaleInvoice(
  payload: SaveSaleInvoicePayload,
  db: Database.Database,
  encryptionKey: Buffer,
): InvoiceWithItems {
  const p = payload;
  const requestedInvoiceNumber = String(p.number ?? "").trim();
  const customerName = String(p.customerName ?? "").trim();
  const address = String(p.address ?? "").trim();
  const contactNo = String(p.contactNo ?? "").trim();
  const total = Number(p.total);
  const items = normalizeInvoiceItems(p.items ?? []);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const newStatus = normalizeInvoiceStatus(p.status);
  const overrideClosedPeriod = Boolean(p.overrideClosedPeriod);

  if (!customerName) {
    throw new AppError("Customer name is required.", ErrorCodes.INVALID_INPUT);
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new AppError("Invoice total is invalid.", ErrorCodes.INVALID_INPUT);
  }

  const finalInvoiceDate = normalizeRequiredInvoiceDate(p.invoiceDate);

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: "draft" | "posted" | undefined;
  let periodId: number | undefined;

  const tx = db.transaction(() => {
    if (p.id) {
      assertInvoicePeriodMutable(
        db,
        "sale_invoices",
        p.id,
        overrideClosedPeriod,
      );

      const prevInvoice = db
        .prepare(
          "SELECT status, periodId, createdAt, invoiceSequence FROM sale_invoices WHERE id = ?",
        )
        .get(p.id) as
        | {
            status?: "draft" | "posted";
            periodId?: number | null;
            createdAt?: string;
            invoiceSequence?: number | null;
          }
        | undefined;

      previousStatus = prevInvoice?.status || "posted";
      const originalPeriodId = Number(prevInvoice?.periodId ?? 0) || undefined;
      periodId = originalPeriodId;

      // If caller provided explicit periodId override, prefer it (allows editing a historical period)
      if (typeof p.periodId === "number") {
        periodId = p.periodId || undefined;
      }

      if (!periodId) {
        periodId = resolveInvoicePeriodId(
          db,
          finalInvoiceDate,
          prevInvoice?.createdAt,
          overrideClosedPeriod,
        );
      }

      if (overrideClosedPeriod) {
        const period = getPeriodById(db, periodId);
        if (!period) {
          throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
        }
      } else {
        assertPeriodCanAcceptMutations(db, periodId);
      }

      const existingSequence =
        Number(prevInvoice?.invoiceSequence ?? 0) || null;
      let finalInvoiceNumber = requestedInvoiceNumber;
      let finalInvoiceSequence: number | null = existingSequence;

      if (existingSequence !== null) {
        const parsedRequested = parseManagedInvoiceSequence(
          requestedInvoiceNumber,
        );
        if (parsedRequested !== existingSequence) {
          throw new AppError(
            "Invoice number is system-managed for this record and cannot be changed.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        if (originalPeriodId && periodId !== originalPeriodId) {
          throw new AppError(
            "System-managed invoice numbering does not allow moving invoice across periods.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        finalInvoiceNumber = String(existingSequence);
      } else {
        if (!finalInvoiceNumber) {
          throw new AppError(
            "Invoice number is required.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        assertUniqueInvoiceNumber(
          db,
          "sale_invoices",
          finalInvoiceNumber,
          periodId ?? null,
          p.id,
        );

        finalInvoiceSequence = null;
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
         SET invoiceNumber = @invoiceNumber,
             invoiceSequence = @invoiceSequence,
             customerName = @customerName,
             total = @total,
             totalQty = @totalQty,
             address = @address,
             invoiceDate = @invoiceDate,
             contactNo = @contactNo,
             status = @status,
             periodId = @periodId
         WHERE id = @id`,
      ).run({
        id: p.id,
        invoiceNumber: finalInvoiceNumber,
        invoiceSequence: finalInvoiceSequence,
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
      if (typeof p.periodId === "number") {
        periodId = p.periodId;
      } else {
        periodId = resolveInvoicePeriodId(db, finalInvoiceDate);
      }

      if (overrideClosedPeriod) {
        const period = getPeriodById(db, periodId);
        if (!period) {
          throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
        }
      } else {
        assertPeriodCanAcceptMutations(db, periodId);
      }

      const reservedSequence = reserveNextInvoiceSequence(
        db,
        "sale_invoices",
        periodId,
      );
      const finalInvoiceNumber = String(reservedSequence);

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
            invoiceSequence,
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
            @invoiceSequence,
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
          invoiceNumber: finalInvoiceNumber,
          invoiceSequence: reservedSequence,
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
  const { id, customerName, contactNo, totals, rows } = payload;

  const transaction = db.transaction(() => {
    let ledgerId = id;

    const encryptedCustomerName = encryptionService.encrypt(
      customerName,
      encryptionKey,
    );
    const encryptedContactNo = contactNo
      ? encryptionService.encrypt(contactNo, encryptionKey)
      : "";

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

      db.prepare("DELETE FROM ledger_rows WHERE ledgerId = ?").run(ledgerId);
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
        : "";

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
    return { id: newId };
  } catch (error: any) {
    console.error("Ledger save failed:", error);
    return { error: error.message };
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
        if (val === row.particulars && row.particulars.includes(":")) {
          particulars = "";
        } else {
          particulars = val;
        }
      } catch {
        particulars = "";
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
      ["customerName"] as const,
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
      invoiceSequence INTEGER,
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
      invoiceSequence INTEGER,
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

    CREATE TABLE IF NOT EXISTS invoice_counters (
      kind TEXT NOT NULL CHECK(kind IN ('purchase', 'sale')),
      periodId INTEGER NOT NULL,
      lastNumber INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (kind, periodId),
      FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE
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

  const hasColumn = (table: string, column: string): boolean => {
    return getColumns(table).includes(column);
  };

  let transactionOpen = false;

  try {
    db.exec("BEGIN");
    transactionOpen = true;

    // Migration: Add status column to invoices
    const invoiceCols = getColumns("invoices");
    if (invoiceCols.length > 0 && !invoiceCols.includes("status")) {
      db.exec(`ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'draft'`);
    }

    if (invoiceCols.length > 0 && !invoiceCols.includes("periodId")) {
      db.exec(`ALTER TABLE invoices ADD COLUMN periodId INTEGER`);
    }

    // Migration: Add status column to sale_invoices
    const saleInvoiceCols = getColumns("sale_invoices");
    if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes("status")) {
      db.exec(
        `ALTER TABLE sale_invoices ADD COLUMN status TEXT DEFAULT 'draft'`,
      );
    }

    if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes("periodId")) {
      db.exec(`ALTER TABLE sale_invoices ADD COLUMN periodId INTEGER`);
    }

    // Migration: Add totalQty to invoices
    if (invoiceCols.length > 0 && !invoiceCols.includes("totalQty")) {
      db.exec(`ALTER TABLE invoices ADD COLUMN totalQty INTEGER DEFAULT 0`);
    }

    // Migration: Add totalQty to sale_invoices
    if (saleInvoiceCols.length > 0 && !saleInvoiceCols.includes("totalQty")) {
      db.exec(
        `ALTER TABLE sale_invoices ADD COLUMN totalQty INTEGER DEFAULT 0`,
      );
    }

    // Migration: Rename ledger to ledgers if needed
    if (!tableExists("ledgers") && tableExists("ledger")) {
      db.exec(`ALTER TABLE ledger RENAME TO ledgers`);
    }

    // Migration: Add columns to ledgers
    const ledgerCols = getColumns("ledgers");
    if (ledgerCols.length > 0) {
      if (!ledgerCols.includes("totalDebit")) {
        db.exec(`ALTER TABLE ledgers ADD COLUMN totalDebit TEXT DEFAULT '0'`);
      }
      if (!ledgerCols.includes("totalCredit")) {
        db.exec(`ALTER TABLE ledgers ADD COLUMN totalCredit TEXT DEFAULT '0'`);
      }
      if (!ledgerCols.includes("netBalance")) {
        db.exec(`ALTER TABLE ledgers ADD COLUMN netBalance TEXT DEFAULT '0'`);
      }
    }

    // Migration: Rename ledger_entries to ledger_rows if needed
    if (!tableExists("ledger_rows") && tableExists("ledger_entries")) {
      db.exec(`ALTER TABLE ledger_entries RENAME TO ledger_rows`);
    }

    // Migration: Legacy stock_snapshots table had a different shape; rebuild it.
    const snapshotCols = getColumns("stock_snapshots");
    if (snapshotCols.length > 0 && !snapshotCols.includes("periodId")) {
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

    if (tableExists("periods")) {
      db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_periods_single_active
        ON periods(status)
        WHERE status = 'active';
    `);
    }

    if (
      tableExists("stock_snapshot_items") &&
      hasColumn("stock_snapshot_items", "snapshotId") &&
      hasColumn("stock_snapshot_items", "stockCode")
    ) {
      db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_snapshot_items_unique_code
        ON stock_snapshot_items(snapshotId, stockCode);
    `);
    }

    if (
      tableExists("stock_snapshots") &&
      hasColumn("stock_snapshots", "periodId")
    ) {
      db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stock_snapshots_period_id
        ON stock_snapshots(periodId);
    `);
    }

    if (tableExists("invoices") && hasColumn("invoices", "periodId")) {
      db.exec(`
      CREATE INDEX IF NOT EXISTS idx_invoices_period_id
        ON invoices(periodId);
    `);
    }

    if (
      tableExists("sale_invoices") &&
      hasColumn("sale_invoices", "periodId")
    ) {
      db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sale_invoices_period_id
        ON sale_invoices(periodId);
    `);
    }

    if (tableExists("invoices") && !hasColumn("invoices", "invoiceSequence")) {
      db.exec(`ALTER TABLE invoices ADD COLUMN invoiceSequence INTEGER`);
    }

    if (
      tableExists("sale_invoices") &&
      !hasColumn("sale_invoices", "invoiceSequence")
    ) {
      db.exec(`ALTER TABLE sale_invoices ADD COLUMN invoiceSequence INTEGER`);
    }

    if (!tableExists("invoice_counters")) {
      db.exec(`
      CREATE TABLE invoice_counters (
        kind TEXT NOT NULL CHECK(kind IN ('purchase', 'sale')),
        periodId INTEGER NOT NULL,
        lastNumber INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kind, periodId),
        FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE
      );
    `);
    }

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
      if (!hasColumn(table, "periodId")) {
        return;
      }

      const tableColumns = getColumns(table);
      const selectDateColumns = [
        tableColumns.includes("invoiceDate")
          ? "invoiceDate"
          : "NULL AS invoiceDate",
        tableColumns.includes("createdAt") ? "createdAt" : "NULL AS createdAt",
      ].join(",\n         ");

      const rows = db
        .prepare(
          `SELECT id,
         ${selectDateColumns}
         FROM ${table}
         WHERE periodId IS NULL`,
        )
        .all() as Array<{
        id: number;
        invoiceDate?: string | null;
        createdAt?: string | null;
      }>;

      const updateStmt = db.prepare(
        `UPDATE ${table}
         SET periodId = @periodId
         WHERE id = @id`,
      );

      for (const row of rows) {
        const day = normalizeInvoiceDate(
          row.invoiceDate ?? undefined,
          row.createdAt ?? undefined,
        );
        const matched = pickPeriodByDate.get({ day }) as
          | { id?: number }
          | undefined;
        const periodId = Number(matched?.id ?? 0) || activePeriodId;
        updateStmt.run({ id: row.id, periodId });
      }
    };

    backfillPeriodIds("invoices");
    backfillPeriodIds("sale_invoices");

    const backfillInvoiceSequences = (table: InvoiceTable) => {
      if (
        !hasColumn(table, "periodId") ||
        !hasColumn(table, "invoiceSequence")
      ) {
        return;
      }

      const rows = db
        .prepare(
          `SELECT id, periodId, invoiceNumber, invoiceSequence
           FROM ${table}
           ORDER BY id ASC`,
        )
        .all() as Array<{
        id: number;
        periodId?: number | null;
        invoiceNumber?: string | null;
        invoiceSequence?: number | null;
      }>;

      const usedManagedByPeriod = new Map<number, Set<number>>();
      const maxByPeriod = new Map<number, number>();

      const getManagedUsed = (periodId: number): Set<number> => {
        const existing = usedManagedByPeriod.get(periodId);
        if (existing) return existing;
        const created = new Set<number>();
        usedManagedByPeriod.set(periodId, created);
        return created;
      };

      const getMax = (periodId: number): number =>
        maxByPeriod.get(periodId) ?? 0;

      const setMax = (periodId: number, value: number): void => {
        const current = getMax(periodId);
        if (value > current) {
          maxByPeriod.set(periodId, value);
        } else if (!maxByPeriod.has(periodId)) {
          maxByPeriod.set(periodId, current);
        }
      };

      const updateManagedStmt = db.prepare(
        `UPDATE ${table}
         SET invoiceNumber = @invoiceNumber,
             invoiceSequence = @invoiceSequence
         WHERE id = @id`,
      );

      for (const row of rows) {
        const periodId = Number(row.periodId ?? 0);
        if (!Number.isFinite(periodId) || periodId <= 0) {
          continue;
        }

        const existingSequenceRaw = Number(row.invoiceSequence ?? 0);
        const existingSequence =
          Number.isInteger(existingSequenceRaw) && existingSequenceRaw > 0
            ? existingSequenceRaw
            : null;

        const parsedNumber = parseManagedInvoiceSequence(
          String(row.invoiceNumber ?? ""),
        );

        if (existingSequence === null) {
          // Legacy rows stay untouched for backward compatibility.
          if (parsedNumber) {
            setMax(periodId, parsedNumber);
          } else {
            setMax(periodId, getMax(periodId));
          }
          continue;
        }

        const managedUsed = getManagedUsed(periodId);

        let assigned = existingSequence;
        if (managedUsed.has(assigned)) {
          let next = Math.max(getMax(periodId), assigned);
          do {
            next += 1;
          } while (managedUsed.has(next));
          assigned = next;
        }

        managedUsed.add(assigned);
        setMax(periodId, assigned);

        const desiredNumber = String(assigned);
        const currentNumber = String(row.invoiceNumber ?? "").trim();

        if (existingSequence !== assigned || currentNumber !== desiredNumber) {
          updateManagedStmt.run({
            id: row.id,
            invoiceNumber: desiredNumber,
            invoiceSequence: assigned,
          });
        }
      }

      for (const [periodId, lastNumber] of maxByPeriod.entries()) {
        syncInvoiceCounterAtLeast(db, table, periodId, lastNumber);
      }
    };

    backfillInvoiceSequences("invoices");
    backfillInvoiceSequences("sale_invoices");

    if (
      tableExists("invoices") &&
      hasColumn("invoices", "periodId") &&
      hasColumn("invoices", "invoiceSequence")
    ) {
      db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_period_sequence_unique
        ON invoices(periodId, invoiceSequence)
        WHERE invoiceSequence IS NOT NULL;
    `);
    }

    if (
      tableExists("sale_invoices") &&
      hasColumn("sale_invoices", "periodId") &&
      hasColumn("sale_invoices", "invoiceSequence")
    ) {
      db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_invoices_period_sequence_unique
        ON sale_invoices(periodId, invoiceSequence)
        WHERE invoiceSequence IS NOT NULL;
    `);
    }

    db.exec("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // no-op: a failed rollback should not mask the original migration error
      }
    }
    throw error;
  }
}
