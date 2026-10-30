import Database from "better-sqlite3";
import { AppError, ErrorCodes } from "./errors";
import { normalizeCode } from "./utils";
import { encryptionService } from "./encryption";
import { majorToMinor, minorToMajor } from "../src/shared/money";

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
  invoiceIdPerPeriod?: number | null;
  supplierName: string;
  total: number;
  totalMinor: number;
  version: number;
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
  invoiceIdPerPeriod?: number | null;
  customerName: string;
  total: number;
  totalMinor: number;
  version: number;
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

export type PeriodDeleteImpact = {
  periodId: number;
  purchaseInvoiceCount: number;
  saleInvoiceCount: number;
  canDelete: boolean;
  blockedReason: "active" | "not_empty" | "reopen_context" | null;
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
  purchaseRateMinor?: number;
  saleRateMinor?: number;
};
type StockItem = NewStockItem & { id: number; createdAt: string };

export type NewInvoiceItem = {
  code: string;
  name: string;
  rate: number;
  rateMinor?: number;
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

function encryptMinor(value: number, key: Buffer): string {
  if (!Number.isSafeInteger(value)) {
    throw new AppError(
      "Monetary value must be an integer number of minor units.",
      ErrorCodes.INVALID_INPUT,
    );
  }
  return encryptionService.encrypt(String(value), key);
}

function decryptMinor(encrypted: unknown, key: Buffer): number {
  const value = decryptNumber(String(encrypted ?? "0"), key);
  if (!Number.isSafeInteger(value)) {
    throw new AppError(
      "Stored minor-unit monetary value is invalid.",
      ErrorCodes.MIGRATION_FAILED,
    );
  }
  return value;
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

const DUPLICATE_INVOICE_ID_PER_PERIOD_SQL: Record<InvoiceTable, string> = {
  invoices: `
    SELECT id
    FROM invoices
    WHERE invoiceIdPerPeriod = @invoiceIdPerPeriod
      AND ((@periodId IS NULL AND periodId IS NULL) OR periodId = @periodId)
      AND (@invoiceId IS NULL OR id != @invoiceId)
    LIMIT 1
  `,
  sale_invoices: `
    SELECT id
    FROM sale_invoices
    WHERE invoiceIdPerPeriod = @invoiceIdPerPeriod
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
              WHEN invoiceIdPerPeriod IS NOT NULL AND invoiceIdPerPeriod > 0 THEN invoiceIdPerPeriod
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

function syncInvoiceCounterExact(
  db: Database.Database,
  table: InvoiceTable,
  periodId: number,
  value: number,
): void {
  const normalizedValue = Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO invoice_counters (kind, periodId, lastNumber, createdAt, updatedAt)
     VALUES (@kind, @periodId, @lastNumber, @now, @now)
     ON CONFLICT(kind, periodId)
     DO UPDATE SET
       lastNumber = excluded.lastNumber,
       updatedAt = excluded.updatedAt`,
  ).run({
    kind: INVOICE_COUNTER_KIND_BY_TABLE[table],
    periodId,
    lastNumber: normalizedValue,
    now,
  });
}

function syncInvoiceCounterAfterDelete(
  db: Database.Database,
  table: InvoiceTable,
  periodId?: number | null,
): void {
  syncInvoiceCounterToCurrentMax(db, table, periodId);
}

function syncInvoiceCounterToCurrentMax(
  db: Database.Database,
  table: InvoiceTable,
  periodId?: number | null,
): void {
  if (typeof periodId !== "number" || !Number.isFinite(periodId) || periodId <= 0) {
    return;
  }

  const currentMax = getMaxPeriodSequenceFromInvoices(db, table, periodId);
  syncInvoiceCounterExact(db, table, periodId, currentMax);
}

function reserveNextInvoiceSequence(
  db: Database.Database,
  table: InvoiceTable,
  periodId: number,
): number {
  const currentMax = getMaxPeriodSequenceFromInvoices(db, table, periodId);
  syncInvoiceCounterExact(db, table, periodId, currentMax);

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
  const rowMax = getMaxPeriodSequenceFromInvoices(db, table, resolvedPeriodId);
  syncInvoiceCounterExact(db, table, resolvedPeriodId, rowMax);
  return String(rowMax + 1);
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
    throw new AppError("Invoice ID is required.", ErrorCodes.INVALID_INPUT);
  }

  const duplicate = db.prepare(DUPLICATE_INVOICE_NUMBER_SQL[table]).get({
    invoiceNumber: trimmedNumber,
    periodId,
    invoiceId: invoiceId ?? null,
  }) as { id: number } | undefined;

  if (duplicate) {
    throw new AppError(
      `Invoice ID "${trimmedNumber}" already exists in this period. Please use a unique invoice ID.`,
      ErrorCodes.DUPLICATE_INVOICE_NUMBER,
    );
  }
}

function assertUniqueInvoiceIdPerPeriod(
  db: Database.Database,
  table: InvoiceTable,
  invoiceIdPerPeriod: number | null | undefined,
  periodId: number | null,
  invoiceId?: number,
): void {
  if (
    typeof invoiceIdPerPeriod !== "number" ||
    !Number.isFinite(invoiceIdPerPeriod) ||
    invoiceIdPerPeriod <= 0
  ) {
    return;
  }

  const duplicate = db
    .prepare(DUPLICATE_INVOICE_ID_PER_PERIOD_SQL[table])
    .get({
      invoiceIdPerPeriod: Math.floor(invoiceIdPerPeriod),
      periodId,
      invoiceId: invoiceId ?? null,
    }) as { id: number } | undefined;

  if (duplicate) {
    throw new AppError(
      `Invoice ID ${Math.floor(invoiceIdPerPeriod)} already exists in this period.`,
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
    const suppliedMinor = Number(raw?.rateMinor);
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
    const rateMinor = Number.isSafeInteger(suppliedMinor)
      ? suppliedMinor
      : Number.isFinite(rate)
        ? majorToMinor(rate)
        : Number.NaN;
    if (!Number.isSafeInteger(rateMinor) || rateMinor <= 0) {
      throw new AppError(
        `Item ${index + 1}: rate must be greater than 0.`,
        ErrorCodes.INVALID_INPUT,
      );
    }
    if (!Number.isSafeInteger(qty) || qty <= 0) {
      throw new AppError(
        `Item ${index + 1}: qty must be greater than 0.`,
        ErrorCodes.INVALID_INPUT,
      );
    }

    return {
      code,
      name,
      rate: minorToMajor(rateMinor),
      rateMinor,
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
      `SELECT code, name, purchaseRate, purchaseRateMinor, purchaseQty,
              saleRate, saleRateMinor, saleQty
       FROM stock
       ORDER BY id ASC`,
    )
    .all() as Array<{
    code: string;
    name: string;
    purchaseRate: string;
    purchaseRateMinor: string;
    purchaseQty: number;
    saleRate: string;
    saleRateMinor: string;
    saleQty: number;
  }>;

  const insertSnapshotItem = db.prepare(
    `INSERT INTO stock_snapshot_items (
      snapshotId,
      stockCode,
      stockName,
      purchaseRate,
      purchaseRateMinor,
      purchaseQty,
      saleRate,
      saleRateMinor,
      saleQty,
      onHandQty,
      createdAt
    ) VALUES (
      @snapshotId,
      @stockCode,
      @stockName,
      @purchaseRate,
      @purchaseRateMinor,
      @purchaseQty,
      @saleRate,
      @saleRateMinor,
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
      purchaseRateMinor: stock.purchaseRateMinor,
      purchaseQty: stock.purchaseQty,
      saleRate: stock.saleRate,
      saleRateMinor: stock.saleRateMinor,
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
        purchaseRateMinor,
        purchaseQty,
        saleRate,
        saleRateMinor,
        saleQty
       FROM stock_snapshot_items
       WHERE snapshotId = ?
       ORDER BY id ASC`,
    )
    .all(snapshot.id) as Array<{
    code: string;
    name: string;
    purchaseRate: string;
    purchaseRateMinor: string;
    purchaseQty: number;
    saleRate: string;
    saleRateMinor: string;
    saleQty: number;
  }>;

  db.prepare(`DELETE FROM stock`).run();

  const now = new Date().toISOString();
  const insertStock = db.prepare(
    `INSERT INTO stock (
      code,
      name,
      purchaseRate,
      purchaseRateMinor,
      purchaseQty,
      saleRate,
      saleRateMinor,
      saleQty,
      createdAt,
      updatedAt
    ) VALUES (
      @code,
      @name,
      @purchaseRate,
      @purchaseRateMinor,
      @purchaseQty,
      @saleRate,
      @saleRateMinor,
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
      purchaseRateMinor: row.purchaseRateMinor,
      purchaseQty: row.purchaseQty,
      saleRate: row.saleRate,
      saleRateMinor: row.saleRateMinor,
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
        ssi.purchaseRateMinor,
        ssi.purchaseQty,
        ssi.saleRate,
        ssi.saleRateMinor,
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
    purchaseRateMinor: decryptMinor(item.purchaseRateMinor, encryptionKey),
    purchaseRate: minorToMajor(decryptMinor(item.purchaseRateMinor, encryptionKey)),
    saleRateMinor: decryptMinor(item.saleRateMinor, encryptionKey),
    saleRate: minorToMajor(decryptMinor(item.saleRateMinor, encryptionKey)),
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

export function getPeriodDeleteImpact(
  periodId: number,
  db: Database.Database,
): PeriodDeleteImpact {
  const period = getPeriodById(db, periodId);
  if (!period) {
    throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
  }

  const purchaseInvoiceCount = Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS count FROM invoices WHERE periodId = ?`)
        .get(periodId) as { count?: number } | undefined
    )?.count ?? 0,
  );
  const saleInvoiceCount = Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS count FROM sale_invoices WHERE periodId = ?`)
        .get(periodId) as { count?: number } | undefined
    )?.count ?? 0,
  );
  const reopenContext = getReopenContext(db);

  let blockedReason: PeriodDeleteImpact["blockedReason"] = null;
  if (period.status === "active") {
    blockedReason = "active";
  } else if (
    reopenContext &&
    (reopenContext.activePeriodId === periodId ||
      reopenContext.returnPeriodId === periodId)
  ) {
    blockedReason = "reopen_context";
  } else if (purchaseInvoiceCount > 0 || saleInvoiceCount > 0) {
    blockedReason = "not_empty";
  }

  return {
    periodId,
    purchaseInvoiceCount,
    saleInvoiceCount,
    canDelete: blockedReason === null,
    blockedReason,
  };
}

export function deletePeriod(
  periodId: number,
  db: Database.Database,
): { deletedPeriodId: number } {
  return db.transaction(() => {
    const impact = getPeriodDeleteImpact(periodId, db);
    if (impact.blockedReason === "active") {
      throw new AppError(
        "The active period cannot be deleted. Close it first.",
        ErrorCodes.PERIOD_DELETE_ACTIVE,
      );
    }
    if (impact.blockedReason === "reopen_context") {
      throw new AppError(
        "This period is required by the current reopen workflow.",
        ErrorCodes.PERIOD_IN_REOPEN_CONTEXT,
      );
    }
    if (impact.blockedReason === "not_empty") {
      throw new AppError(
        `This period contains ${impact.purchaseInvoiceCount} purchase invoice(s) and ${impact.saleInvoiceCount} sale invoice(s).`,
        ErrorCodes.PERIOD_NOT_EMPTY,
      );
    }

    // Profile connections do not currently enable SQLite foreign-key
    // enforcement, so remove dependent period metadata explicitly.
    db.prepare(
      `DELETE FROM stock_snapshot_items
       WHERE snapshotId IN (
         SELECT id FROM stock_snapshots WHERE periodId = ?
       )`,
    ).run(periodId);
    db.prepare(`DELETE FROM stock_snapshots WHERE periodId = ?`).run(periodId);
    db.prepare(`DELETE FROM invoice_counters WHERE periodId = ?`).run(periodId);
    const result = db.prepare(`DELETE FROM periods WHERE id = ?`).run(periodId);
    if (result.changes !== 1) {
      throw new AppError("Period not found.", ErrorCodes.PERIOD_NOT_FOUND);
    }

    return { deletedPeriodId: periodId };
  })();
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
      i.invoiceIdPerPeriod,
      i.invoiceDate,
      i.supplierName,
      i.total,
      i.totalMinor,
      i.totalQty,
      i.status,
      i.periodId,
      p.status AS periodStatus,
      i.createdAt,
      i.updatedAt
      ,i.version
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

  sql += ` ORDER BY COALESCE(i.invoiceIdPerPeriod, i.invoiceSequence) DESC, i.createdAt DESC`;

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
    invoiceIdPerPeriod:
      typeof row.invoiceIdPerPeriod === "number"
        ? row.invoiceIdPerPeriod
        : row.invoiceIdPerPeriod != null
          ? Number(row.invoiceIdPerPeriod)
          : null,
    invoiceDate: row.invoiceDate,
    supplierName: decrypt(row.supplierName, encryptionKey),
    totalMinor: decryptMinor(row.totalMinor, encryptionKey),
    total: minorToMajor(decryptMinor(row.totalMinor, encryptionKey)),
    version: Number(row.version ?? 1),
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
  encryptionKey: Buffer,
): void {
  assertInvoicePeriodMutable(db, "invoices", id);
  db.transaction(() => {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(id) as
      | {
          status?: "draft" | "posted";
          periodId?: number | null;
          version?: number;
        }
      | undefined;
    if (!invoice) {
      throw new AppError("Invoice not found.", ErrorCodes.NOT_FOUND);
    }

    if (invoice.status === "posted") {
      const items = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, rateMinor, qty, position
           FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`,
        )
        .all(id)
        .map((item: any) => ({
          ...item,
          rateMinor: decryptMinor(item.rateMinor, encryptionKey),
          rate: minorToMajor(decryptMinor(item.rateMinor, encryptionKey)),
        })) as InvoiceItem[];
      const version = Number(invoice.version ?? 1);

      // Keep the final posted state and its compensating stock movements in
      // the audit trail even though the user-facing invoice is removed.
      recordPostedInvoiceRevision(
        db,
        "purchase",
        id,
        version,
        "Invoice deleted",
        invoice,
        items,
        encryptionKey,
      );
      updateStockOnPurchase(db, [], "draft", items, "posted", encryptionKey);
    }

    const result = db.prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
    if (result.changes !== 1) {
      throw new AppError("Invoice not found.", ErrorCodes.NOT_FOUND);
    }
    syncInvoiceCounterAfterDelete(db, "invoices", invoice.periodId);
  })();
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
        i.invoiceIdPerPeriod,
        i.supplierName,
        i.total,
        i.totalMinor,
        i.createdAt,
        i.address,
        i.invoiceDate,
        i.contactNo,
        i.status,
        i.periodId,
        i.version,
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
      `SELECT id, invoiceId, code, name, rate, rateMinor, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`,
    )
    .all(id) as any[];

  const decryptedItems = items.map((item) => ({
    ...item,
    rateMinor: decryptMinor(item.rateMinor, encryptionKey),
    rate: minorToMajor(decryptMinor(item.rateMinor, encryptionKey)),
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
      invoiceIdPerPeriod:
        typeof inv.invoiceIdPerPeriod === "number"
          ? inv.invoiceIdPerPeriod
          : inv.invoiceIdPerPeriod != null
            ? Number(inv.invoiceIdPerPeriod)
            : null,
      totalMinor: decryptMinor(inv.totalMinor, encryptionKey),
      total: minorToMajor(decryptMinor(inv.totalMinor, encryptionKey)),
      version: Number(inv.version ?? 1),
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
  total?: number;
  totalMinor?: number;
  address?: string;
  invoiceDate: string;
  contactNo?: string;
  items: NewInvoiceItem[];
  status?: "draft" | "posted";
  overrideClosedPeriod?: boolean;
  periodId?: number;
  invoiceIdPerPeriod?: number;
  version?: number;
  correctionReason?: string;
};

function recordPostedInvoiceRevision(
  db: Database.Database,
  kind: "purchase" | "sale",
  invoiceId: number,
  revision: number,
  correctionReason: string,
  header: unknown,
  items: InvoiceItem[],
  encryptionKey: Buffer,
): void {
  const reason = correctionReason.trim();
  if (!reason) {
    throw new AppError(
      "A correction reason is required when editing a posted invoice.",
      ErrorCodes.INVALID_INPUT,
    );
  }
  const encryptedSnapshot = encryptionService.encrypt(
    JSON.stringify({ header, items }),
    encryptionKey,
  );
  db.prepare(
    `INSERT INTO invoice_revisions (
      invoiceKind, invoiceId, revision, encryptedSnapshot, correctionReason
    ) VALUES (?, ?, ?, ?, ?)`,
  ).run(kind, invoiceId, revision, encryptedSnapshot, reason);

  const priorMovements = db
    .prepare(
      `SELECT id, linePosition, stockCode, quantityDelta, unitRateMinor, effectiveDate
       FROM stock_movements
       WHERE invoiceKind = ? AND invoiceId = ? AND invoiceRevision = ?
         AND reason = 'posting'`,
    )
    .all(kind, invoiceId, revision) as Array<{
    id: number;
    linePosition: number;
    stockCode: string;
    quantityDelta: number;
    unitRateMinor: string;
    effectiveDate: string;
  }>;
  const reverse = db.prepare(
    `INSERT INTO stock_movements (
      invoiceKind, invoiceId, invoiceRevision, linePosition, stockCode,
      quantityDelta, unitRateMinor, effectiveDate, reason, reversesMovementId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reversal', ?)`,
  );
  for (const movement of priorMovements) {
    reverse.run(
      kind,
      invoiceId,
      revision + 1,
      movement.linePosition,
      movement.stockCode,
      -movement.quantityDelta,
      movement.unitRateMinor,
      movement.effectiveDate,
      movement.id,
    );
  }
}

function appendInvoiceMovements(
  db: Database.Database,
  kind: "purchase" | "sale",
  invoiceId: number,
  revision: number,
  invoiceDate: string,
  items: NewInvoiceItem[],
  encryptionKey: Buffer,
): void {
  const sign = kind === "purchase" ? 1 : -1;
  const insert = db.prepare(
    `INSERT INTO stock_movements (
      invoiceKind, invoiceId, invoiceRevision, linePosition, stockCode,
      quantityDelta, unitRateMinor, effectiveDate, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posting')`,
  );
  for (const item of items) {
    insert.run(
      kind,
      invoiceId,
      revision,
      item.position,
      item.code,
      sign * item.qty,
      encryptMinor(item.rateMinor!, encryptionKey),
      invoiceDate,
    );
  }
}

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
  const items = normalizeInvoiceItems(p.items ?? []);
  const totalMinor = items.reduce(
    (sum, item) => sum + item.rateMinor! * item.qty,
    0,
  );
  const total = minorToMajor(totalMinor);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const newStatus = normalizeInvoiceStatus(p.status);
  const overrideClosedPeriod = Boolean(p.overrideClosedPeriod);
  const requestedInvoiceIdPerPeriod =
    typeof p.invoiceIdPerPeriod === "number" &&
    Number.isFinite(p.invoiceIdPerPeriod) &&
    p.invoiceIdPerPeriod > 0
      ? Math.floor(p.invoiceIdPerPeriod)
      : undefined;
  const requestedInvoiceSequence =
    requestedInvoiceIdPerPeriod ??
    parseManagedInvoiceSequence(requestedInvoiceNumber) ??
    undefined;

  if (!supplierName) {
    throw new AppError("Supplier name is required.", ErrorCodes.INVALID_INPUT);
  }

  const finalInvoiceDate = normalizeRequiredInvoiceDate(p.invoiceDate);

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: "draft" | "posted" | undefined;
  let periodId: number | undefined;
  let resultingVersion = 1;

  const tx = db.transaction(() => {
    if (p.id) {
      assertInvoicePeriodMutable(db, "invoices", p.id, overrideClosedPeriod);

      const prevInvoice = db
        .prepare(
          "SELECT * FROM invoices WHERE id = ?",
        )
        .get(p.id) as
        | {
            status?: "draft" | "posted";
            periodId?: number | null;
            createdAt?: string;
            invoiceSequence?: number | null;
            invoiceIdPerPeriod?: number | null;
            version?: number;
          }
        | undefined;

      previousStatus = prevInvoice?.status || "posted";
      if (!prevInvoice) {
        throw new AppError("Invoice not found.", ErrorCodes.NOT_FOUND);
      }
      const previousVersion = Number(prevInvoice.version ?? 1);
      resultingVersion = previousVersion + 1;
      const expectedVersion = p.version ?? previousVersion;
      if (expectedVersion !== previousVersion) {
        throw new AppError(
          "This invoice was changed elsewhere. Reload it before saving.",
          ErrorCodes.VERSION_CONFLICT,
        );
      }
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
        if (originalPeriodId && periodId !== originalPeriodId) {
          throw new AppError(
            "Invoice numbering does not allow moving invoices across periods.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        finalInvoiceSequence = requestedInvoiceSequence ?? existingSequence;
        finalInvoiceNumber = String(finalInvoiceSequence);
      } else {
        finalInvoiceSequence = requestedInvoiceSequence ?? null;
        if (finalInvoiceSequence !== null) {
          finalInvoiceNumber = String(finalInvoiceSequence);
        }

        if (!finalInvoiceNumber) {
          throw new AppError(
            "Invoice ID is required.",
            ErrorCodes.INVALID_INPUT,
          );
        }
      }

      const prevRaw = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, rateMinor, qty, position FROM invoice_items WHERE invoiceId = ?`,
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rateMinor: decryptMinor(item.rateMinor, encryptionKey),
        rate: minorToMajor(decryptMinor(item.rateMinor, encryptionKey)),
      }));

      if (previousStatus === "posted") {
        recordPostedInvoiceRevision(
          db,
          "purchase",
          p.id,
          previousVersion,
          p.correctionReason ?? (p.version === undefined ? "Legacy internal correction" : ""),
          prevInvoice,
          previousItems,
          encryptionKey,
        );
      }

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

      const finalInvoiceIdPerPeriod =
        finalInvoiceSequence !== null
          ? finalInvoiceSequence
          : (requestedInvoiceIdPerPeriod ??
            prevInvoice?.invoiceIdPerPeriod ??
            null);

      assertUniqueInvoiceNumber(
        db,
        "invoices",
        finalInvoiceNumber,
        periodId ?? null,
        p.id,
      );

      assertUniqueInvoiceIdPerPeriod(
        db,
        "invoices",
        finalInvoiceIdPerPeriod,
        periodId ?? null,
        p.id,
      );

      const updateResult = db.prepare(
        `UPDATE invoices
         SET invoiceNumber = @invoiceNumber,
             invoiceSequence = @invoiceSequence,
             invoiceIdPerPeriod = @invoiceIdPerPeriod,
             supplierName = @supplierName,
             total = @total,
              totalMinor = @totalMinor,
             totalQty = @totalQty,
             address = @address,
             invoiceDate = @invoiceDate,
             contactNo = @contactNo,
             status = @status,
              periodId = @periodId,
              updatedAt = @updatedAt,
              version = version + 1
         WHERE id = @id AND version = @version`,
      ).run({
        id: p.id,
        invoiceNumber: finalInvoiceNumber,
        invoiceSequence: finalInvoiceSequence,
        invoiceIdPerPeriod: finalInvoiceIdPerPeriod,
        supplierName: enc.supplierName,
        total: encryptNumber(total, encryptionKey),
        totalMinor: encryptMinor(totalMinor, encryptionKey),
        totalQty,
        address: enc.address || null,
        invoiceDate: finalInvoiceDate || null,
        contactNo: enc.contactNo || null,
        status: newStatus,
        periodId: periodId ?? null,
        updatedAt: new Date().toISOString(),
        version: previousVersion,
      });
      if (updateResult.changes !== 1) {
        throw new AppError(
          "This invoice was changed elsewhere. Reload it before saving.",
          ErrorCodes.VERSION_CONFLICT,
        );
      }

      syncInvoiceCounterToCurrentMax(db, "invoices", periodId);
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

      const finalInvoiceSequence =
        requestedInvoiceSequence ??
        reserveNextInvoiceSequence(
          db,
          "invoices",
          periodId,
        );
      const finalInvoiceNumber = String(finalInvoiceSequence);
      const finalInvoiceIdPerPeriod = finalInvoiceSequence;

      assertUniqueInvoiceIdPerPeriod(
        db,
        "invoices",
        finalInvoiceIdPerPeriod,
        periodId ?? null,
        undefined,
      );

      // Validate uniqueness of invoice number in period (catches reuse after deletion)
      assertUniqueInvoiceNumber(
        db,
        "invoices",
        finalInvoiceNumber,
        periodId ?? null,
        undefined,
      );

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
            invoiceIdPerPeriod,
            supplierName,
            total,
            totalMinor,
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
            @invoiceIdPerPeriod,
            @supplierName,
            @total,
            @totalMinor,
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
          invoiceSequence: finalInvoiceSequence,
          invoiceIdPerPeriod: finalInvoiceIdPerPeriod,
          supplierName: enc.supplierName,
          total: encryptNumber(total, encryptionKey),
          totalMinor: encryptMinor(totalMinor, encryptionKey),
          totalQty,
          createdAt: new Date().toISOString(),
          address: enc.address || null,
          invoiceDate: finalInvoiceDate || null,
          contactNo: enc.contactNo || null,
          status: newStatus,
          periodId,
        });
      invoiceId = Number(info.lastInsertRowid);
      syncInvoiceCounterToCurrentMax(db, "invoices", periodId);
    }

    const insertItem = db.prepare(
      `INSERT INTO invoice_items (invoiceId, code, name, rate, rateMinor, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @rateMinor, @qty, @position)`,
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        rateMinor: encryptMinor(it.rateMinor!, encryptionKey),
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
    if (newStatus === "posted") {
      appendInvoiceMovements(
        db,
        "purchase",
        invoiceId!,
        resultingVersion,
        finalInvoiceDate,
        items,
        encryptionKey,
      );
    }
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
      `SELECT id, code, name, purchaseRate, purchaseRateMinor, purchaseQty,
              saleRate, saleRateMinor, saleQty, archived, createdAt
       FROM stock WHERE archived = 0 ORDER BY id DESC`,
    )
    .all() as any[];

  return results.map((item) => ({
    ...item,
    purchaseRateMinor: decryptMinor(item.purchaseRateMinor, encryptionKey),
    purchaseRate: minorToMajor(decryptMinor(item.purchaseRateMinor, encryptionKey)),
    saleRateMinor: decryptMinor(item.saleRateMinor, encryptionKey),
    saleRate: minorToMajor(decryptMinor(item.saleRateMinor, encryptionKey)),
  }));
}

export function createStock(
  input: NewStockItem,
  db: Database.Database,
  encryptionKey: Buffer,
): StockItem {
  const code = normalizeCode(input.code);
  const name = String(input.name ?? "").trim();
  const purchaseQty = Number(input.purchaseQty ?? 0);
  const saleQty = Number(input.saleQty ?? 0);
  if (!Number.isSafeInteger(purchaseQty) || !Number.isSafeInteger(saleQty)) {
    throw new AppError("Stock quantities must be whole numbers.", ErrorCodes.INVALID_INPUT);
  }
  const purchaseRateMinor = Number.isSafeInteger(input.purchaseRateMinor)
    ? input.purchaseRateMinor!
    : majorToMinor(input.purchaseRate ?? 0);
  const saleRateMinor = Number.isSafeInteger(input.saleRateMinor)
    ? input.saleRateMinor!
    : majorToMinor(input.saleRate ?? 0);

  try {
    return db.transaction(() => {
      const existing = db
        .prepare(
          `SELECT id, purchaseQty, saleQty, archived
           FROM stock WHERE code = ?`,
        )
        .get(code) as
        | {
            id: number;
            purchaseQty: number;
            saleQty: number;
            archived: number;
          }
        | undefined;

      if (existing && existing.archived !== 1) {
        throw new AppError(
          `Code "${code}" already exists. Please use a unique code.`,
          ErrorCodes.DUPLICATE_CODE,
        );
      }

      if (existing) {
        db.prepare(
          `UPDATE stock
           SET name = @name,
               purchaseRate = @purchaseRate,
               purchaseRateMinor = @purchaseRateMinor,
               purchaseQty = @purchaseQty,
               saleRate = @saleRate,
               saleRateMinor = @saleRateMinor,
               saleQty = @saleQty,
               archived = 0,
               updatedAt = CURRENT_TIMESTAMP
           WHERE id = @id`,
        ).run({
          id: existing.id,
          name,
          purchaseRate: encryptNumber(
            minorToMajor(purchaseRateMinor),
            encryptionKey,
          ),
          purchaseRateMinor: encryptMinor(purchaseRateMinor, encryptionKey),
          purchaseQty,
          saleRate: encryptNumber(minorToMajor(saleRateMinor), encryptionKey),
          saleRateMinor: encryptMinor(saleRateMinor, encryptionKey),
          saleQty,
        });

        const previousOnHand =
          Number(existing.purchaseQty) - Number(existing.saleQty);
        const restoredOnHand = purchaseQty - saleQty;
        const adjustment = restoredOnHand - previousOnHand;
        if (adjustment !== 0) {
          db.prepare(
            `INSERT INTO stock_movements (
              stockCode, quantityDelta, unitRateMinor, effectiveDate, reason
            ) VALUES (?, ?, ?, date('now'), 'adjustment')`,
          ).run(
            code,
            adjustment,
            encryptMinor(purchaseRateMinor, encryptionKey),
          );
        }

        const restored = db
          .prepare(`SELECT * FROM stock WHERE id = ?`)
          .get(existing.id) as any;
        return {
          ...restored,
          purchaseRateMinor,
          purchaseRate: minorToMajor(purchaseRateMinor),
          saleRateMinor,
          saleRate: minorToMajor(saleRateMinor),
        };
      }

      const stmt = db.prepare(`
      INSERT INTO stock (
        code, name, purchaseRate, purchaseRateMinor, purchaseQty,
        saleRate, saleRateMinor, saleQty, createdAt
      ) VALUES (
        @code, @name, @purchaseRate, @purchaseRateMinor, @purchaseQty,
        @saleRate, @saleRateMinor, @saleQty, datetime('now')
      )
    `);
    const info = stmt.run({
      code,
      name,
      purchaseRate: encryptNumber(minorToMajor(purchaseRateMinor), encryptionKey),
      purchaseRateMinor: encryptMinor(purchaseRateMinor, encryptionKey),
      purchaseQty,
      saleRate: encryptNumber(minorToMajor(saleRateMinor), encryptionKey),
      saleRateMinor: encryptMinor(saleRateMinor, encryptionKey),
      saleQty,
    });
    const openingDelta = purchaseQty - saleQty;
    if (openingDelta !== 0) {
      db.prepare(
        `INSERT INTO stock_movements (
          stockCode, quantityDelta, unitRateMinor, effectiveDate, reason
        ) VALUES (?, ?, ?, date('now'), 'adjustment')`,
      ).run(
        code,
        openingDelta,
        encryptMinor(purchaseRateMinor, encryptionKey),
      );
    }

    const result = db
      .prepare(`SELECT * FROM stock WHERE id=@id`)
      .get({ id: info.lastInsertRowid }) as any;

      return {
        ...result,
        purchaseRateMinor,
        purchaseRate: minorToMajor(purchaseRateMinor),
        saleRateMinor,
        saleRate: minorToMajor(saleRateMinor),
      };
    })();
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
  const purchaseQty = Number(input.purchaseQty ?? 0);
  const saleQty = Number(input.saleQty ?? 0);
  if (!Number.isSafeInteger(purchaseQty) || !Number.isSafeInteger(saleQty)) {
    throw new AppError("Stock quantities must be whole numbers.", ErrorCodes.INVALID_INPUT);
  }
  const purchaseRateMinor = Number.isSafeInteger(input.purchaseRateMinor)
    ? input.purchaseRateMinor!
    : majorToMinor(input.purchaseRate ?? 0);
  const saleRateMinor = Number.isSafeInteger(input.saleRateMinor)
    ? input.saleRateMinor!
    : majorToMinor(input.saleRate ?? 0);

  try {
    return db.transaction(() => {
      const previous = db
      .prepare(`SELECT code, purchaseQty, saleQty FROM stock WHERE id = ?`)
      .get(id) as
      | { code: string; purchaseQty: number; saleQty: number }
      | undefined;
    if (!previous) {
      throw new AppError("Stock item not found.", ErrorCodes.NOT_FOUND);
    }
    if (previous.code !== code) {
      const movementCount = Number(
        (
          db
            .prepare(`SELECT COUNT(*) AS count FROM stock_movements WHERE stockCode = ?`)
            .get(previous.code) as { count?: number }
        ).count ?? 0,
      );
      if (movementCount > 0) {
        throw new AppError(
          "Stock codes with movement history cannot be renamed.",
          ErrorCodes.INVALID_INPUT,
        );
      }
    }
    db.prepare(
      `UPDATE stock
       SET code=@code, name=@name, purchaseRate=@purchaseRate,
           purchaseRateMinor=@purchaseRateMinor, purchaseQty=@purchaseQty,
           saleRate=@saleRate, saleRateMinor=@saleRateMinor, saleQty=@saleQty,
           updatedAt=CURRENT_TIMESTAMP
       WHERE id=@id`,
    ).run({
      id,
      code,
      name,
      purchaseRate: encryptNumber(minorToMajor(purchaseRateMinor), encryptionKey),
      purchaseRateMinor: encryptMinor(purchaseRateMinor, encryptionKey),
      purchaseQty,
      saleRate: encryptNumber(minorToMajor(saleRateMinor), encryptionKey),
      saleRateMinor: encryptMinor(saleRateMinor, encryptionKey),
      saleQty,
    });
    const previousOnHand = Number(previous.purchaseQty) - Number(previous.saleQty);
    const newOnHand = purchaseQty - saleQty;
    const delta = newOnHand - previousOnHand;
    if (delta !== 0) {
      db.prepare(
        `INSERT INTO stock_movements (
          stockCode, quantityDelta, unitRateMinor, effectiveDate, reason
        ) VALUES (?, ?, ?, date('now'), 'adjustment')`,
      ).run(
        code,
        delta,
        encryptMinor(purchaseRateMinor, encryptionKey),
      );
    }

    const result = db
      .prepare(`SELECT * FROM stock WHERE id=@id`)
      .get({ id }) as any;

      return {
        ...result,
        purchaseRateMinor,
        purchaseRate: minorToMajor(purchaseRateMinor),
        saleRateMinor,
        saleRate: minorToMajor(saleRateMinor),
      };
    })();
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
  const stock = db.prepare(`SELECT code FROM stock WHERE id = ?`).get(id) as
    | { code: string }
    | undefined;
  if (!stock) {
    throw new AppError("Stock item not found.", ErrorCodes.NOT_FOUND);
  }
  const hasMovements = Boolean(
    db.prepare(`SELECT 1 FROM stock_movements WHERE stockCode = ? LIMIT 1`).get(stock.code),
  );
  const result = hasMovements
    ? db
        .prepare(`UPDATE stock SET archived = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(id)
    : db.prepare(`DELETE FROM stock WHERE id = ?`).run(id);
  if (result.changes !== 1) {
    throw new AppError("Stock item not found.", ErrorCodes.NOT_FOUND);
  }
}

export function rebuildStockFromMovements(
  db: Database.Database,
): { updated: number; discrepancies: Array<{ code: string; before: number; after: number }> } {
  return db.transaction(() => {
    const stocks = db
      .prepare(`SELECT id, code, purchaseQty, saleQty FROM stock`)
      .all() as Array<{
      id: number;
      code: string;
      purchaseQty: number;
      saleQty: number;
    }>;
    const aggregate = db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN invoiceKind = 'purchase' THEN quantityDelta ELSE 0 END), 0) AS purchases,
         COALESCE(SUM(CASE WHEN invoiceKind = 'sale' THEN -quantityDelta ELSE 0 END), 0) AS sales,
         COALESCE(SUM(CASE WHEN invoiceKind IS NULL AND quantityDelta > 0 THEN quantityDelta ELSE 0 END), 0) AS positiveAdjustments,
         COALESCE(SUM(CASE WHEN invoiceKind IS NULL AND quantityDelta < 0 THEN -quantityDelta ELSE 0 END), 0) AS negativeAdjustments
       FROM stock_movements WHERE stockCode = ?`,
    );
    const update = db.prepare(
      `UPDATE stock SET purchaseQty = ?, saleQty = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    );
    const discrepancies: Array<{ code: string; before: number; after: number }> = [];
    for (const stock of stocks) {
      const totals = aggregate.get(stock.code) as {
        purchases: number;
        sales: number;
        positiveAdjustments: number;
        negativeAdjustments: number;
      };
      const purchaseQty = Number(totals.purchases) + Number(totals.positiveAdjustments);
      const saleQty = Number(totals.sales) + Number(totals.negativeAdjustments);
      const before = Number(stock.purchaseQty) - Number(stock.saleQty);
      const after = purchaseQty - saleQty;
      if (before !== after) {
        discrepancies.push({ code: stock.code, before, after });
      }
      update.run(purchaseQty, saleQty, stock.id);
    }
    return { updated: stocks.length, discrepancies };
  })();
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
               purchaseRateMinor = @rateMinor,
               name = @name,
               archived = 0,
               updatedAt = CURRENT_TIMESTAMP
           WHERE code = @code`,
        ).run({
          code: item.code,
          qty: item.qty,
          rate: encryptNumber(item.rate, encryptionKey),
          rateMinor: encryptMinor(item.rateMinor!, encryptionKey),
          name: item.name,
        });
      } else {
        db.prepare(
          `INSERT INTO stock (
            code, name, purchaseRate, purchaseRateMinor, purchaseQty,
            saleRate, saleRateMinor, saleQty, createdAt
           ) VALUES (
            @code, @name, @purchaseRate, @purchaseRateMinor, @purchaseQty,
            @saleRate, @saleRateMinor, @saleQty, datetime('now')
           )`,
        ).run({
          code: item.code,
          name: item.name,
          purchaseRate: encryptNumber(item.rate, encryptionKey),
          purchaseRateMinor: encryptMinor(item.rateMinor!, encryptionKey),
          purchaseQty: item.qty,
          saleRate: encryptNumber(0, encryptionKey),
          saleRateMinor: encryptMinor(0, encryptionKey),
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
               saleRateMinor = @rateMinor,
               name = @name,
               archived = 0,
               updatedAt = CURRENT_TIMESTAMP
           WHERE code = @code`,
        ).run({
          code: item.code,
          qty: item.qty,
          rate: encryptNumber(item.rate, encryptionKey),
          rateMinor: encryptMinor(item.rateMinor!, encryptionKey),
          name: item.name,
        });
      } else {
        db.prepare(
          `INSERT INTO stock (
            code, name, purchaseRate, purchaseRateMinor, purchaseQty,
            saleRate, saleRateMinor, saleQty, createdAt
           ) VALUES (
            @code, @name, @purchaseRate, @purchaseRateMinor, @purchaseQty,
            @saleRate, @saleRateMinor, @saleQty, datetime('now')
           )`,
        ).run({
          code: item.code,
          name: item.name,
          purchaseRate: encryptNumber(0, encryptionKey),
          purchaseRateMinor: encryptMinor(0, encryptionKey),
          purchaseQty: 0,
          saleRate: encryptNumber(item.rate, encryptionKey),
          saleRateMinor: encryptMinor(item.rateMinor!, encryptionKey),
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
      s.invoiceIdPerPeriod,
      s.invoiceDate,
      s.customerName,
      s.total,
      s.totalMinor,
      s.totalQty,
      s.status,
      s.periodId,
      p.status AS periodStatus,
      s.createdAt,
      s.updatedAt
      ,s.version
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

  sql += ` ORDER BY COALESCE(s.invoiceIdPerPeriod, s.invoiceSequence) DESC, s.createdAt DESC`;

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
    invoiceIdPerPeriod:
      typeof row.invoiceIdPerPeriod === "number"
        ? row.invoiceIdPerPeriod
        : row.invoiceIdPerPeriod != null
          ? Number(row.invoiceIdPerPeriod)
          : null,
    invoiceDate: row.invoiceDate,
    customerName: decrypt(row.customerName, encryptionKey),
    totalMinor: decryptMinor(row.totalMinor, encryptionKey),
    total: minorToMajor(decryptMinor(row.totalMinor, encryptionKey)),
    version: Number(row.version ?? 1),
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
  encryptionKey: Buffer,
): void {
  assertInvoicePeriodMutable(db, "sale_invoices", id);
  db.transaction(() => {
    const invoice = db
      .prepare(`SELECT * FROM sale_invoices WHERE id = ?`)
      .get(id) as
      | {
          status?: "draft" | "posted";
          periodId?: number | null;
          version?: number;
        }
      | undefined;
    if (!invoice) {
      throw new AppError("Invoice not found.", ErrorCodes.NOT_FOUND);
    }

    if (invoice.status === "posted") {
      const items = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, rateMinor, qty, position
           FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`,
        )
        .all(id)
        .map((item: any) => ({
          ...item,
          rateMinor: decryptMinor(item.rateMinor, encryptionKey),
          rate: minorToMajor(decryptMinor(item.rateMinor, encryptionKey)),
        })) as InvoiceItem[];
      const version = Number(invoice.version ?? 1);

      recordPostedInvoiceRevision(
        db,
        "sale",
        id,
        version,
        "Invoice deleted",
        invoice,
        items,
        encryptionKey,
      );
      updateStockOnSale(db, [], "draft", items, "posted", encryptionKey);
    }

    const result = db.prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
    if (result.changes !== 1) {
      throw new AppError("Invoice not found.", ErrorCodes.NOT_FOUND);
    }
    syncInvoiceCounterAfterDelete(db, "sale_invoices", invoice.periodId);
  })();
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
        s.invoiceIdPerPeriod,
        s.customerName,
        s.total,
        s.totalMinor,
        s.createdAt,
        s.address,
        s.invoiceDate,
        s.contactNo,
        s.status,
        s.version,
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
      `SELECT id, invoiceId, code, name, rate, rateMinor, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`,
    )
    .all(id) as any[];
  const decryptedItems = itemsOut.map((item) => ({
    ...item,
    rateMinor: decryptMinor(item.rateMinor, encryptionKey),
    rate: minorToMajor(decryptMinor(item.rateMinor, encryptionKey)),
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
      invoiceIdPerPeriod:
        typeof invoice.invoiceIdPerPeriod === "number"
          ? invoice.invoiceIdPerPeriod
          : invoice.invoiceIdPerPeriod != null
            ? Number(invoice.invoiceIdPerPeriod)
            : null,
      totalMinor: decryptMinor(invoice.totalMinor, encryptionKey),
      total: minorToMajor(decryptMinor(invoice.totalMinor, encryptionKey)),
      version: Number(invoice.version ?? 1),
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
  total?: number;
  totalMinor?: number;
  address?: string;
  invoiceDate: string;
  contactNo?: string;
  items: NewInvoiceItem[];
  status?: "draft" | "posted";
  overrideClosedPeriod?: boolean;
  periodId?: number;
  invoiceIdPerPeriod?: number;
  version?: number;
  correctionReason?: string;
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
  const items = normalizeInvoiceItems(p.items ?? []);
  const totalMinor = items.reduce(
    (sum, item) => sum + item.rateMinor! * item.qty,
    0,
  );
  const total = minorToMajor(totalMinor);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const newStatus = normalizeInvoiceStatus(p.status);
  const overrideClosedPeriod = Boolean(p.overrideClosedPeriod);
  const requestedInvoiceIdPerPeriod =
    typeof p.invoiceIdPerPeriod === "number" &&
    Number.isFinite(p.invoiceIdPerPeriod) &&
    p.invoiceIdPerPeriod > 0
      ? Math.floor(p.invoiceIdPerPeriod)
      : undefined;
  const requestedInvoiceSequence =
    requestedInvoiceIdPerPeriod ??
    parseManagedInvoiceSequence(requestedInvoiceNumber) ??
    undefined;

  if (!customerName) {
    throw new AppError("Customer name is required.", ErrorCodes.INVALID_INPUT);
  }

  const finalInvoiceDate = normalizeRequiredInvoiceDate(p.invoiceDate);

  let invoiceId = p.id;
  let previousItems: InvoiceItem[] | undefined;
  let previousStatus: "draft" | "posted" | undefined;
  let periodId: number | undefined;
  let resultingVersion = 1;

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
          "SELECT * FROM sale_invoices WHERE id = ?",
        )
        .get(p.id) as
        | {
            status?: "draft" | "posted";
            periodId?: number | null;
            createdAt?: string;
            invoiceSequence?: number | null;
            invoiceIdPerPeriod?: number | null;
            version?: number;
          }
        | undefined;

      previousStatus = prevInvoice?.status || "posted";
      if (!prevInvoice) {
        throw new AppError("Invoice not found.", ErrorCodes.NOT_FOUND);
      }
      const previousVersion = Number(prevInvoice.version ?? 1);
      resultingVersion = previousVersion + 1;
      const expectedVersion = p.version ?? previousVersion;
      if (expectedVersion !== previousVersion) {
        throw new AppError(
          "This invoice was changed elsewhere. Reload it before saving.",
          ErrorCodes.VERSION_CONFLICT,
        );
      }
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
        if (originalPeriodId && periodId !== originalPeriodId) {
          throw new AppError(
            "Invoice numbering does not allow moving invoices across periods.",
            ErrorCodes.INVALID_INPUT,
          );
        }

        finalInvoiceSequence = requestedInvoiceSequence ?? existingSequence;
        finalInvoiceNumber = String(finalInvoiceSequence);
      } else {
        finalInvoiceSequence = requestedInvoiceSequence ?? null;
        if (finalInvoiceSequence !== null) {
          finalInvoiceNumber = String(finalInvoiceSequence);
        }

        if (!finalInvoiceNumber) {
          throw new AppError(
            "Invoice ID is required.",
            ErrorCodes.INVALID_INPUT,
          );
        }
      }

      const prevRaw = db
        .prepare(
          `SELECT id, invoiceId, code, name, rate, rateMinor, qty, position
           FROM sale_invoice_items WHERE invoiceId = ?`,
        )
        .all(p.id) as any[];
      previousItems = prevRaw.map((item: any) => ({
        ...item,
        rateMinor: decryptMinor(item.rateMinor, encryptionKey),
        rate: minorToMajor(decryptMinor(item.rateMinor, encryptionKey)),
      }));

      if (previousStatus === "posted") {
        recordPostedInvoiceRevision(
          db,
          "sale",
          p.id,
          previousVersion,
          p.correctionReason ?? (p.version === undefined ? "Legacy internal correction" : ""),
          prevInvoice,
          previousItems,
          encryptionKey,
        );
      }

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

      const finalInvoiceIdPerPeriod =
        finalInvoiceSequence !== null
          ? finalInvoiceSequence
          : (requestedInvoiceIdPerPeriod ??
            prevInvoice?.invoiceIdPerPeriod ??
            null);

      assertUniqueInvoiceNumber(
        db,
        "sale_invoices",
        finalInvoiceNumber,
        periodId ?? null,
        p.id,
      );

      assertUniqueInvoiceIdPerPeriod(
        db,
        "sale_invoices",
        finalInvoiceIdPerPeriod,
        periodId ?? null,
        p.id,
      );

      const updateStatement = db.prepare(
        `UPDATE sale_invoices
         SET invoiceNumber = @invoiceNumber,
             invoiceSequence = @invoiceSequence,
             invoiceIdPerPeriod = @invoiceIdPerPeriod,
             customerName = @customerName,
             total = @total,
              totalMinor = @totalMinor,
             totalQty = @totalQty,
             address = @address,
             invoiceDate = @invoiceDate,
             contactNo = @contactNo,
             status = @status,
              periodId = @periodId,
              updatedAt = @updatedAt,
              version = version + 1
         WHERE id = @id AND version = @version`,
      );
      const updateResult = updateStatement.run({
        id: p.id,
        invoiceNumber: finalInvoiceNumber,
        invoiceSequence: finalInvoiceSequence,
        invoiceIdPerPeriod: finalInvoiceIdPerPeriod,
        customerName: enc.customerName,
        total: encryptNumber(total, encryptionKey),
        totalMinor: encryptMinor(totalMinor, encryptionKey),
        totalQty,
        address: enc.address || null,
        invoiceDate: finalInvoiceDate || null,
        contactNo: enc.contactNo || null,
        status: newStatus,
        periodId: periodId ?? null,
        updatedAt: new Date().toISOString(),
        version: previousVersion,
      });
      if (updateResult.changes !== 1) {
        throw new AppError(
          "This invoice was changed elsewhere. Reload it before saving.",
          ErrorCodes.VERSION_CONFLICT,
        );
      }

      syncInvoiceCounterToCurrentMax(db, "sale_invoices", periodId);
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

      const finalInvoiceSequence =
        requestedInvoiceSequence ??
        reserveNextInvoiceSequence(
          db,
          "sale_invoices",
          periodId,
        );
      const finalInvoiceNumber = String(finalInvoiceSequence);
      const finalInvoiceIdPerPeriod = finalInvoiceSequence;

      assertUniqueInvoiceIdPerPeriod(
        db,
        "sale_invoices",
        finalInvoiceIdPerPeriod,
        periodId ?? null,
        undefined,
      );

      // Validate uniqueness of invoice number in period (catches reuse after deletion)
      assertUniqueInvoiceNumber(
        db,
        "sale_invoices",
        finalInvoiceNumber,
        periodId ?? null,
        undefined,
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
      const info = db
        .prepare(
          `INSERT INTO sale_invoices (
            invoiceNumber,
            invoiceSequence,
            invoiceIdPerPeriod,
            customerName,
            total,
            totalMinor,
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
            @invoiceIdPerPeriod,
            @customerName,
            @total,
            @totalMinor,
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
          invoiceSequence: finalInvoiceSequence,
          invoiceIdPerPeriod: finalInvoiceIdPerPeriod,
          customerName: enc.customerName,
          total: encryptNumber(total, encryptionKey),
          totalMinor: encryptMinor(totalMinor, encryptionKey),
          totalQty,
          createdAt: new Date().toISOString(),
          address: enc.address || null,
          invoiceDate: finalInvoiceDate || null,
          contactNo: enc.contactNo || null,
          status: newStatus,
          periodId,
        });
      invoiceId = Number(info.lastInsertRowid);
      syncInvoiceCounterToCurrentMax(db, "sale_invoices", periodId);
    }

    const insertItem = db.prepare(
      `INSERT INTO sale_invoice_items (invoiceId, code, name, rate, rateMinor, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @rateMinor, @qty, @position)`,
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        rateMinor: encryptMinor(it.rateMinor!, encryptionKey),
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
    if (newStatus === "posted") {
      appendInvoiceMovements(
        db,
        "sale",
        invoiceId!,
        resultingVersion,
        finalInvoiceDate,
        items,
        encryptionKey,
      );
    }
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
  const { id, customerName, contactNo, rows } = payload;
  const normalizedRows = rows.map((row) => ({
    ...row,
    debitMinor: majorToMinor(row.debit || 0),
    creditMinor: majorToMinor(row.credit || 0),
  }));
  const totalDebitMinor = normalizedRows.reduce((sum, row) => sum + row.debitMinor, 0);
  const totalCreditMinor = normalizedRows.reduce((sum, row) => sum + row.creditMinor, 0);
  const netBalanceMinor = totalDebitMinor - totalCreditMinor;

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
         totalDebitMinor = @totalDebitMinor,
         totalCredit = @totalCredit,
         totalCreditMinor = @totalCreditMinor,
         netBalance = @netBalance
         ,netBalanceMinor = @netBalanceMinor,
         updatedAt = CURRENT_TIMESTAMP
         WHERE id = @id`,
      ).run({
        id: ledgerId,
        customerName: encryptedCustomerName,
        contactNo: encryptedContactNo,
        totalDebit: encryptNumber(minorToMajor(totalDebitMinor), encryptionKey),
        totalDebitMinor: encryptMinor(totalDebitMinor, encryptionKey),
        totalCredit: encryptNumber(minorToMajor(totalCreditMinor), encryptionKey),
        totalCreditMinor: encryptMinor(totalCreditMinor, encryptionKey),
        netBalance: encryptNumber(minorToMajor(netBalanceMinor), encryptionKey),
        netBalanceMinor: encryptMinor(netBalanceMinor, encryptionKey),
      });

      db.prepare("DELETE FROM ledger_rows WHERE ledgerId = ?").run(ledgerId);
    } else {
      // ✅ FIX: Use ledgers table
      const info = db
        .prepare(
          `INSERT INTO ledgers (
            customerName, contactNo, totalDebit, totalDebitMinor,
            totalCredit, totalCreditMinor, netBalance, netBalanceMinor, createdAt
           ) VALUES (
            @customerName, @contactNo, @totalDebit, @totalDebitMinor,
            @totalCredit, @totalCreditMinor, @netBalance, @netBalanceMinor, datetime('now')
           )`,
        )
        .run({
          customerName: encryptedCustomerName,
          contactNo: encryptedContactNo,
          totalDebit: encryptNumber(minorToMajor(totalDebitMinor), encryptionKey),
          totalDebitMinor: encryptMinor(totalDebitMinor, encryptionKey),
          totalCredit: encryptNumber(minorToMajor(totalCreditMinor), encryptionKey),
          totalCreditMinor: encryptMinor(totalCreditMinor, encryptionKey),
          netBalance: encryptNumber(minorToMajor(netBalanceMinor), encryptionKey),
          netBalanceMinor: encryptMinor(netBalanceMinor, encryptionKey),
        });
      ledgerId = Number(info.lastInsertRowid);
    }

    const insertRow = db.prepare(
      `INSERT INTO ledger_rows (
        ledgerId, date, particulars, debit, debitMinor, credit, creditMinor, crDr, position
       ) VALUES (
        @ledgerId, @date, @particulars, @debit, @debitMinor, @credit, @creditMinor, @crDr, @position
       )`,
    );

    normalizedRows.forEach((row, index) => {
      const particulars = row.particulars?.trim()
        ? encryptionService.encrypt(row.particulars, encryptionKey)
        : "";

      insertRow.run({
        ledgerId,
        date: row.date,
        particulars,
        debit: encryptNumber(minorToMajor(row.debitMinor), encryptionKey),
        debitMinor: encryptMinor(row.debitMinor, encryptionKey),
        credit: encryptNumber(minorToMajor(row.creditMinor), encryptionKey),
        creditMinor: encryptMinor(row.creditMinor, encryptionKey),
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
        totalDebitMinor,
        totalCredit,
        totalCreditMinor,
        netBalance
        ,netBalanceMinor
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
      `SELECT id, ledgerId, date, particulars, debit, debitMinor, credit, creditMinor, crDr, position
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
      debitMinor: decryptMinor(row.debitMinor, encryptionKey),
      debit: minorToMajor(decryptMinor(row.debitMinor, encryptionKey)),
      creditMinor: decryptMinor(row.creditMinor, encryptionKey),
      credit: minorToMajor(decryptMinor(row.creditMinor, encryptionKey)),
    };
  });

  return {
    ledger: {
      ...decryptedLedger,
      totalDebitMinor: decryptMinor(ledger.totalDebitMinor, encryptionKey),
      totalDebit: minorToMajor(decryptMinor(ledger.totalDebitMinor, encryptionKey)),
      totalCreditMinor: decryptMinor(ledger.totalCreditMinor, encryptionKey),
      totalCredit: minorToMajor(decryptMinor(ledger.totalCreditMinor, encryptionKey)),
      netBalanceMinor: decryptMinor(ledger.netBalanceMinor, encryptionKey),
      netBalance: minorToMajor(decryptMinor(ledger.netBalanceMinor, encryptionKey)),
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
        totalDebitMinor,
        totalCredit,
        totalCreditMinor,
        netBalance
        ,netBalanceMinor
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
        debitMinor: decryptMinor(ledger.totalDebitMinor, encryptionKey),
        debit: minorToMajor(decryptMinor(ledger.totalDebitMinor, encryptionKey)),
        creditMinor: decryptMinor(ledger.totalCreditMinor, encryptionKey),
        credit: minorToMajor(decryptMinor(ledger.totalCreditMinor, encryptionKey)),
        netMinor: decryptMinor(ledger.netBalanceMinor, encryptionKey),
        net: minorToMajor(decryptMinor(ledger.netBalanceMinor, encryptionKey)),
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

export function ensureSchema(db: Database.Database, encryptionKey?: Buffer) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT,
      invoiceSequence INTEGER,
      invoiceIdPerPeriod INTEGER,
      invoiceDate TEXT,
      supplierName TEXT,
      total TEXT DEFAULT '0',
      totalMinor TEXT,
      totalQty INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      periodId INTEGER,
      address TEXT,
      contactNo TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (periodId) REFERENCES periods(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER,
      code TEXT,
      name TEXT,
      rate TEXT DEFAULT '0',
      rateMinor TEXT,
      qty INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sale_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT,
      invoiceSequence INTEGER,
      invoiceIdPerPeriod INTEGER,
      invoiceDate TEXT,
      customerName TEXT,
      total TEXT DEFAULT '0',
      totalMinor TEXT,
      totalQty INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      periodId INTEGER,
      address TEXT,
      contactNo TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (periodId) REFERENCES periods(id)
    );

    CREATE TABLE IF NOT EXISTS sale_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER,
      code TEXT,
      name TEXT,
      rate TEXT DEFAULT '0',
      rateMinor TEXT,
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
      purchaseRateMinor TEXT,
      purchaseQty INTEGER DEFAULT 0,
      saleRate TEXT DEFAULT '0',
      saleRateMinor TEXT,
      saleQty INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_schema (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      migratedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS migration_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schemaVersion INTEGER NOT NULL,
      removedPurchaseOrphans INTEGER NOT NULL DEFAULT 0,
      removedSaleOrphans INTEGER NOT NULL DEFAULT 0,
      correctedInvoiceTotals INTEGER NOT NULL DEFAULT 0,
      seededMovements INTEGER NOT NULL DEFAULT 0,
      migrationAdjustments INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceKind TEXT NOT NULL CHECK(invoiceKind IN ('purchase', 'sale')),
      invoiceId INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      encryptedSnapshot TEXT NOT NULL,
      correctionReason TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(invoiceKind, invoiceId, revision)
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

    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      contactNo TEXT,
      totalDebit TEXT DEFAULT '0',
      totalDebitMinor TEXT,
      totalCredit TEXT DEFAULT '0',
      totalCreditMinor TEXT,
      netBalance TEXT DEFAULT '0',
      netBalanceMinor TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ledger_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledgerId INTEGER,
      date TEXT,
      particulars TEXT,
      debit TEXT DEFAULT '0',
      debitMinor TEXT,
      credit TEXT DEFAULT '0',
      creditMinor TEXT,
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
      purchaseRateMinor TEXT,
      purchaseQty INTEGER DEFAULT 0,
      saleRate TEXT DEFAULT '0',
      saleRateMinor TEXT,
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
  runInvoiceIntegrityMigration(db, encryptionKey);
}

const INVOICE_SCHEMA_VERSION = 3;

function runInvoiceIntegrityMigration(
  db: Database.Database,
  encryptionKey?: Buffer,
): void {
  const columns = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    );
  const addColumn = (table: string, name: string, definition: string) => {
    if (!columns(table).includes(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  };

  const current = Number(
    (
      db.prepare(`SELECT version FROM app_schema WHERE id = 1`).get() as
        | { version?: number }
        | undefined
    )?.version ?? 0,
  );
  if (current >= INVOICE_SCHEMA_VERSION) return;

  const migrate = db.transaction(() => {
    addColumn("invoices", "totalMinor", "TEXT");
    addColumn("invoices", "version", "INTEGER NOT NULL DEFAULT 1");
    addColumn("sale_invoices", "totalMinor", "TEXT");
    addColumn("sale_invoices", "version", "INTEGER NOT NULL DEFAULT 1");
    addColumn("invoice_items", "rateMinor", "TEXT");
    addColumn("sale_invoice_items", "rateMinor", "TEXT");
    addColumn("stock", "purchaseRateMinor", "TEXT");
    addColumn("stock", "saleRateMinor", "TEXT");
    addColumn("stock", "archived", "INTEGER NOT NULL DEFAULT 0");
    addColumn("ledgers", "totalDebitMinor", "TEXT");
    addColumn("ledgers", "totalCreditMinor", "TEXT");
    addColumn("ledgers", "netBalanceMinor", "TEXT");
    addColumn("ledger_rows", "debitMinor", "TEXT");
    addColumn("ledger_rows", "creditMinor", "TEXT");
    addColumn("stock_snapshot_items", "purchaseRateMinor", "TEXT");
    addColumn("stock_snapshot_items", "saleRateMinor", "TEXT");

    // Older Ledgerly versions allowed fractional quantities. Preserve those
    // historical values during migration: rounding them would alter invoice
    // totals and cached stock. New writes still enforce whole quantities in
    // the save/create/update validation paths below.

    const removedPurchaseOrphans = db.prepare(
      `DELETE FROM invoice_items
       WHERE invoiceId IS NULL OR NOT EXISTS (
         SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoiceId
       )`,
    ).run().changes;
    const removedSaleOrphans = db.prepare(
      `DELETE FROM sale_invoice_items
       WHERE invoiceId IS NULL OR NOT EXISTS (
         SELECT 1 FROM sale_invoices WHERE sale_invoices.id = sale_invoice_items.invoiceId
       )`,
    ).run().changes;

    const legacyValueCount = Number(
      (
        db
          .prepare(
            `SELECT
              (SELECT COUNT(*) FROM invoice_items WHERE rateMinor IS NULL) +
              (SELECT COUNT(*) FROM sale_invoice_items WHERE rateMinor IS NULL) +
              (SELECT COUNT(*) FROM stock WHERE purchaseRateMinor IS NULL OR saleRateMinor IS NULL)
              + (SELECT COUNT(*) FROM ledgers WHERE totalDebitMinor IS NULL OR totalCreditMinor IS NULL OR netBalanceMinor IS NULL)
              + (SELECT COUNT(*) FROM ledger_rows WHERE debitMinor IS NULL OR creditMinor IS NULL)
              + (SELECT COUNT(*) FROM stock_snapshot_items WHERE purchaseRateMinor IS NULL OR saleRateMinor IS NULL)
              AS count`,
          )
          .get() as { count?: number }
      ).count ?? 0,
    );
    if (legacyValueCount > 0 && !encryptionKey) {
      throw new AppError(
        "An encryption key is required to migrate legacy monetary values.",
        ErrorCodes.MIGRATION_FAILED,
      );
    }

    let correctedInvoiceTotals = 0;
    if (encryptionKey) {
      for (const table of ["invoice_items", "sale_invoice_items"] as const) {
        const rows = db
          .prepare(`SELECT id, rate FROM ${table} WHERE rateMinor IS NULL`)
          .all() as Array<{ id: number; rate: string }>;
        const update = db.prepare(
          `UPDATE ${table} SET rateMinor = ? WHERE id = ?`,
        );
        for (const row of rows) {
          update.run(
            encryptMinor(
              majorToMinor(decryptNumber(String(row.rate), encryptionKey)),
              encryptionKey,
            ),
            row.id,
          );
        }
      }

      for (const [headerTable, itemTable] of [
        ["invoices", "invoice_items"],
        ["sale_invoices", "sale_invoice_items"],
      ] as const) {
        const headers = db
          .prepare(`SELECT id FROM ${headerTable} WHERE totalMinor IS NULL`)
          .all() as Array<{ id: number }>;
        correctedInvoiceTotals += headers.length;
        const getItems = db.prepare(
          `SELECT rateMinor, qty FROM ${itemTable} WHERE invoiceId = ?`,
        );
        const update = db.prepare(
          `UPDATE ${headerTable} SET totalMinor = ?, total = ? WHERE id = ?`,
        );
        for (const header of headers) {
          const totalMinor = (
            getItems.all(header.id) as Array<{ rateMinor: string; qty: number }>
          ).reduce(
            (sum, item) =>
              sum + decryptMinor(item.rateMinor, encryptionKey) * Number(item.qty),
            0,
          );
          update.run(
            encryptMinor(totalMinor, encryptionKey),
            encryptNumber(minorToMajor(totalMinor), encryptionKey),
            header.id,
          );
        }
      }

      const stocks = db
        .prepare(
          `SELECT id, purchaseRate, saleRate FROM stock
           WHERE purchaseRateMinor IS NULL OR saleRateMinor IS NULL`,
        )
        .all() as Array<{
        id: number;
        purchaseRate: string;
        saleRate: string;
      }>;
      const updateStockMoney = db.prepare(
        `UPDATE stock SET purchaseRateMinor = ?, saleRateMinor = ? WHERE id = ?`,
      );
      for (const stock of stocks) {
        updateStockMoney.run(
          encryptMinor(
            majorToMinor(decryptNumber(stock.purchaseRate, encryptionKey)),
            encryptionKey,
          ),
          encryptMinor(
            majorToMinor(decryptNumber(stock.saleRate, encryptionKey)),
            encryptionKey,
          ),
          stock.id,
        );
      }

      const ledgers = db
        .prepare(
          `SELECT id, totalDebit, totalCredit, netBalance FROM ledgers
           WHERE totalDebitMinor IS NULL OR totalCreditMinor IS NULL OR netBalanceMinor IS NULL`,
        )
        .all() as Array<{
        id: number;
        totalDebit: string;
        totalCredit: string;
        netBalance: string;
      }>;
      const updateLedgerMoney = db.prepare(
        `UPDATE ledgers SET totalDebitMinor = ?, totalCreditMinor = ?, netBalanceMinor = ? WHERE id = ?`,
      );
      for (const ledger of ledgers) {
        updateLedgerMoney.run(
          encryptMinor(majorToMinor(decryptNumber(ledger.totalDebit, encryptionKey)), encryptionKey),
          encryptMinor(majorToMinor(decryptNumber(ledger.totalCredit, encryptionKey)), encryptionKey),
          encryptMinor(majorToMinor(decryptNumber(ledger.netBalance, encryptionKey)), encryptionKey),
          ledger.id,
        );
      }

      const ledgerRows = db
        .prepare(
          `SELECT id, debit, credit FROM ledger_rows
           WHERE debitMinor IS NULL OR creditMinor IS NULL`,
        )
        .all() as Array<{ id: number; debit: string; credit: string }>;
      const updateLedgerRowMoney = db.prepare(
        `UPDATE ledger_rows SET debitMinor = ?, creditMinor = ? WHERE id = ?`,
      );
      for (const row of ledgerRows) {
        updateLedgerRowMoney.run(
          encryptMinor(majorToMinor(decryptNumber(row.debit, encryptionKey)), encryptionKey),
          encryptMinor(majorToMinor(decryptNumber(row.credit, encryptionKey)), encryptionKey),
          row.id,
        );
      }

      const snapshotItems = db
        .prepare(
          `SELECT id, purchaseRate, saleRate FROM stock_snapshot_items
           WHERE purchaseRateMinor IS NULL OR saleRateMinor IS NULL`,
        )
        .all() as Array<{ id: number; purchaseRate: string; saleRate: string }>;
      const updateSnapshotMoney = db.prepare(
        `UPDATE stock_snapshot_items SET purchaseRateMinor = ?, saleRateMinor = ? WHERE id = ?`,
      );
      for (const item of snapshotItems) {
        updateSnapshotMoney.run(
          encryptMinor(majorToMinor(decryptNumber(item.purchaseRate, encryptionKey)), encryptionKey),
          encryptMinor(majorToMinor(decryptNumber(item.saleRate, encryptionKey)), encryptionKey),
          item.id,
        );
      }
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
        ON invoice_items(invoiceId);
      CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoice_id
        ON sale_invoice_items(invoiceId);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_items_position
        ON invoice_items(invoiceId, position);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_invoice_items_position
        ON sale_invoice_items(invoiceId, position);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_code
        ON stock_movements(stockCode, effectiveDate, id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_invoice
        ON stock_movements(invoiceKind, invoiceId, invoiceRevision);

      CREATE TRIGGER IF NOT EXISTS invoice_items_integrity_insert
      BEFORE INSERT ON invoice_items
      WHEN NEW.invoiceId IS NULL OR TRIM(COALESCE(NEW.code, '')) = ''
        OR TRIM(COALESCE(NEW.name, '')) = '' OR NEW.qty <= 0
        OR NEW.qty != CAST(NEW.qty AS INTEGER) OR NEW.position < 0
      BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice item'); END;

      CREATE TRIGGER IF NOT EXISTS sale_invoice_items_integrity_insert
      BEFORE INSERT ON sale_invoice_items
      WHEN NEW.invoiceId IS NULL OR TRIM(COALESCE(NEW.code, '')) = ''
        OR TRIM(COALESCE(NEW.name, '')) = '' OR NEW.qty <= 0
        OR NEW.qty != CAST(NEW.qty AS INTEGER) OR NEW.position < 0
      BEGIN SELECT RAISE(ABORT, 'invalid sale invoice item'); END;

      CREATE TRIGGER IF NOT EXISTS invoice_items_integrity_update
      BEFORE UPDATE ON invoice_items
      WHEN NEW.invoiceId IS NULL OR TRIM(COALESCE(NEW.code, '')) = ''
        OR TRIM(COALESCE(NEW.name, '')) = '' OR NEW.qty <= 0
        OR NEW.qty != CAST(NEW.qty AS INTEGER) OR NEW.position < 0
      BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice item'); END;

      CREATE TRIGGER IF NOT EXISTS sale_invoice_items_integrity_update
      BEFORE UPDATE ON sale_invoice_items
      WHEN NEW.invoiceId IS NULL OR TRIM(COALESCE(NEW.code, '')) = ''
        OR TRIM(COALESCE(NEW.name, '')) = '' OR NEW.qty <= 0
        OR NEW.qty != CAST(NEW.qty AS INTEGER) OR NEW.position < 0
      BEGIN SELECT RAISE(ABORT, 'invalid sale invoice item'); END;

      CREATE TRIGGER IF NOT EXISTS invoices_integrity_insert
      BEFORE INSERT ON invoices
      WHEN TRIM(COALESCE(NEW.invoiceNumber, '')) = ''
        OR TRIM(COALESCE(NEW.supplierName, '')) = ''
        OR NEW.invoiceDate IS NULL OR NEW.status NOT IN ('draft', 'posted')
      BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice'); END;

      CREATE TRIGGER IF NOT EXISTS sale_invoices_integrity_insert
      BEFORE INSERT ON sale_invoices
      WHEN TRIM(COALESCE(NEW.invoiceNumber, '')) = ''
        OR TRIM(COALESCE(NEW.customerName, '')) = ''
        OR NEW.invoiceDate IS NULL OR NEW.status NOT IN ('draft', 'posted')
      BEGIN SELECT RAISE(ABORT, 'invalid sale invoice'); END;

      CREATE TRIGGER IF NOT EXISTS invoices_integrity_update
      BEFORE UPDATE ON invoices
      WHEN TRIM(COALESCE(NEW.invoiceNumber, '')) = ''
        OR TRIM(COALESCE(NEW.supplierName, '')) = ''
        OR NEW.invoiceDate IS NULL OR NEW.status NOT IN ('draft', 'posted')
      BEGIN SELECT RAISE(ABORT, 'invalid purchase invoice'); END;

      CREATE TRIGGER IF NOT EXISTS sale_invoices_integrity_update
      BEFORE UPDATE ON sale_invoices
      WHEN TRIM(COALESCE(NEW.invoiceNumber, '')) = ''
        OR TRIM(COALESCE(NEW.customerName, '')) = ''
        OR NEW.invoiceDate IS NULL OR NEW.status NOT IN ('draft', 'posted')
      BEGIN SELECT RAISE(ABORT, 'invalid sale invoice'); END;
    `);

    const movementReport =
      current < 2 && encryptionKey
        ? seedStockMovements(db, encryptionKey)
        : { seededMovements: 0, migrationAdjustments: 0 };

    db.prepare(
      `INSERT INTO migration_reports (
        schemaVersion, removedPurchaseOrphans, removedSaleOrphans,
        correctedInvoiceTotals, seededMovements, migrationAdjustments
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      INVOICE_SCHEMA_VERSION,
      removedPurchaseOrphans,
      removedSaleOrphans,
      correctedInvoiceTotals,
      movementReport.seededMovements,
      movementReport.migrationAdjustments,
    );

    db.prepare(
      `INSERT INTO app_schema (id, version, migratedAt)
       VALUES (1, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET version = excluded.version, migratedAt = excluded.migratedAt`,
    ).run(INVOICE_SCHEMA_VERSION);

    const violation = db.prepare(`PRAGMA foreign_key_check`).get();
    if (violation) {
      throw new AppError(
        "Foreign-key validation failed after invoice migration.",
        ErrorCodes.MIGRATION_FAILED,
      );
    }
  });

  migrate();
}

function seedStockMovements(
  db: Database.Database,
  encryptionKey: Buffer,
): { seededMovements: number; migrationAdjustments: number } {
  const existing = Number(
    (
      db.prepare(`SELECT COUNT(*) AS count FROM stock_movements`).get() as {
        count?: number;
      }
    ).count ?? 0,
  );
  if (existing > 0) {
    return { seededMovements: 0, migrationAdjustments: 0 };
  }

  let seededMovements = 0;
  let migrationAdjustments = 0;

  const insert = db.prepare(
    `INSERT INTO stock_movements (
      invoiceKind, invoiceId, invoiceRevision, linePosition, stockCode,
      quantityDelta, unitRateMinor, effectiveDate, reason
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'posting')`,
  );
  for (const source of [
    { kind: "purchase", header: "invoices", items: "invoice_items", sign: 1 },
    { kind: "sale", header: "sale_invoices", items: "sale_invoice_items", sign: -1 },
  ] as const) {
    const rows = db
      .prepare(
        `SELECT h.id AS invoiceId, h.invoiceDate, i.position, i.code, i.qty, i.rateMinor
         FROM ${source.header} h
         JOIN ${source.items} i ON i.invoiceId = h.id
         WHERE h.status = 'posted'
         ORDER BY h.invoiceDate, h.id, i.position`,
      )
      .all() as Array<{
      invoiceId: number;
      invoiceDate: string;
      position: number;
      code: string;
      qty: number;
      rateMinor: string;
    }>;
    for (const row of rows) {
      insert.run(
        source.kind,
        row.invoiceId,
        row.position,
        row.code,
        source.sign * row.qty,
        row.rateMinor,
        row.invoiceDate,
      );
      seededMovements += 1;
    }
  }

  const insertAdjustment = db.prepare(
    `INSERT INTO stock_movements (
      invoiceKind, invoiceId, invoiceRevision, linePosition, stockCode,
      quantityDelta, unitRateMinor, effectiveDate, reason
    ) VALUES (NULL, NULL, 1, 0, ?, ?, ?, date('now'), 'migration_adjustment')`,
  );
  const stockRows = db
    .prepare(
      `SELECT s.code, s.purchaseQty - s.saleQty AS expected,
              s.purchaseRateMinor,
              COALESCE(SUM(m.quantityDelta), 0) AS actual
       FROM stock s
       LEFT JOIN stock_movements m ON m.stockCode = s.code
       GROUP BY s.id`,
    )
    .all() as Array<{
    code: string;
    expected: number;
    purchaseRateMinor: string;
    actual: number;
  }>;
  for (const row of stockRows) {
    const difference = Number(row.expected) - Number(row.actual);
    if (difference !== 0) {
      insertAdjustment.run(
        row.code,
        difference,
        row.purchaseRateMinor || encryptMinor(0, encryptionKey),
      );
      migrationAdjustments += 1;
    }
  }
  return { seededMovements, migrationAdjustments };
}

export function getLatestMigrationReport(db: Database.Database) {
  return db
    .prepare(`SELECT * FROM migration_reports ORDER BY id DESC LIMIT 1`)
    .get();
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
        purchaseRateMinor TEXT,
        purchaseQty INTEGER DEFAULT 0,
        saleRate TEXT DEFAULT '0',
        saleRateMinor TEXT,
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

    // Migration: Add invoiceIdPerPeriod column to invoices
    if (tableExists("invoices") && !hasColumn("invoices", "invoiceIdPerPeriod")) {
      db.exec(`ALTER TABLE invoices ADD COLUMN invoiceIdPerPeriod INTEGER`);
    }

    // Migration: Add invoiceIdPerPeriod column to sale_invoices
    if (
      tableExists("sale_invoices") &&
      !hasColumn("sale_invoices", "invoiceIdPerPeriod")
    ) {
      db.exec(`ALTER TABLE sale_invoices ADD COLUMN invoiceIdPerPeriod INTEGER`);
    }

    db.exec(`
      DROP INDEX IF EXISTS uq_invoices_number_period;
      DROP INDEX IF EXISTS uq_sale_invoices_number_period;
      DROP INDEX IF EXISTS uq_invoices_id_per_period;
      DROP INDEX IF EXISTS uq_sale_invoices_id_per_period;
      DROP INDEX IF EXISTS idx_invoices_period_number_unique;
      DROP INDEX IF EXISTS idx_sale_invoices_period_number_unique;
      DROP INDEX IF EXISTS idx_invoices_period_sequence_unique;
      DROP INDEX IF EXISTS idx_sale_invoices_period_sequence_unique;
      DROP INDEX IF EXISTS idx_invoices_period_id_per_period_unique;
      DROP INDEX IF EXISTS idx_sale_invoices_period_id_per_period_unique;
    `);

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

    // Backfill invoiceIdPerPeriod from invoiceSequence
    const backfillInvoiceIdPerPeriod = (table: InvoiceTable) => {
      if (
        !hasColumn(table, "periodId") ||
        !hasColumn(table, "invoiceIdPerPeriod")
      ) {
        return;
      }

      const rows = db
        .prepare(
          `SELECT id, periodId, invoiceSequence, invoiceIdPerPeriod
           FROM ${table}
           ORDER BY id ASC`,
        )
        .all() as Array<{
        id: number;
        periodId?: number | null;
        invoiceSequence?: number | null;
        invoiceIdPerPeriod?: number | null;
      }>;

      const updateStmt = db.prepare(
        `UPDATE ${table}
         SET invoiceIdPerPeriod = @invoiceIdPerPeriod
         WHERE id = @id`,
      );

      const sequenceByPeriod = new Map<number, number>();

      for (const row of rows) {
        const periodId = Number(row.periodId ?? 0);
        if (!Number.isFinite(periodId) || periodId <= 0) {
          continue;
        }

        // Skip if already backfilled
        if (row.invoiceIdPerPeriod && row.invoiceIdPerPeriod > 0) {
          sequenceByPeriod.set(periodId, Math.max(row.invoiceIdPerPeriod, sequenceByPeriod.get(periodId) ?? 0));
          continue;
        }

        // Use invoiceSequence if available; otherwise generate next sequence
        let invoiceIdPerPeriod: number;
        const existingSequence = Number(row.invoiceSequence ?? 0);
        if (Number.isInteger(existingSequence) && existingSequence > 0) {
          invoiceIdPerPeriod = existingSequence;
        } else {
          const currentMax = sequenceByPeriod.get(periodId) ?? 0;
          invoiceIdPerPeriod = currentMax + 1;
        }

        sequenceByPeriod.set(periodId, Math.max(invoiceIdPerPeriod, sequenceByPeriod.get(periodId) ?? 0));

        updateStmt.run({
          id: row.id,
          invoiceIdPerPeriod,
        });
      }
    };

    backfillInvoiceIdPerPeriod("invoices");
    backfillInvoiceIdPerPeriod("sale_invoices");

    const repairManagedInvoiceIds = (table: InvoiceTable) => {
      if (
        !hasColumn(table, "periodId") ||
        !hasColumn(table, "invoiceSequence") ||
        !hasColumn(table, "invoiceIdPerPeriod")
      ) {
        return;
      }

      const correctedRows = db
        .prepare(
          `SELECT periodId, COUNT(*) AS corrected
           FROM ${table}
           WHERE invoiceSequence IS NOT NULL
             AND invoiceSequence > 0
             AND (
               invoiceIdPerPeriod IS NULL
               OR invoiceIdPerPeriod <= 0
               OR invoiceIdPerPeriod != invoiceSequence
               OR TRIM(COALESCE(invoiceNumber, '')) != CAST(invoiceIdPerPeriod AS TEXT)
             )
           GROUP BY periodId`,
        )
        .all() as Array<{ periodId?: number | null; corrected?: number }>;

      db.prepare(
        `UPDATE ${table}
         SET invoiceSequence = invoiceIdPerPeriod,
             invoiceNumber = CAST(invoiceIdPerPeriod AS TEXT)
         WHERE invoiceSequence IS NOT NULL
           AND invoiceSequence > 0
           AND invoiceIdPerPeriod IS NOT NULL
           AND invoiceIdPerPeriod > 0
           AND (
             invoiceSequence != invoiceIdPerPeriod
             OR TRIM(COALESCE(invoiceNumber, '')) != CAST(invoiceIdPerPeriod AS TEXT)
           )`,
      ).run();

      db.prepare(
        `UPDATE ${table}
         SET invoiceIdPerPeriod = invoiceSequence,
             invoiceNumber = CAST(invoiceSequence AS TEXT)
         WHERE invoiceSequence IS NOT NULL
           AND invoiceSequence > 0
           AND (
             invoiceIdPerPeriod IS NULL
             OR invoiceIdPerPeriod <= 0
           )`,
      ).run();

      const kind = INVOICE_COUNTER_KIND_BY_TABLE[table];
      for (const row of correctedRows) {
        const periodId = Number(row.periodId ?? 0);
        const corrected = Number(row.corrected ?? 0);
        if (periodId > 0 && corrected > 0) {
          console.info(
            `[invoice-repair] ${kind} period ${periodId}: corrected ${corrected} invoice ID(s).`,
          );
        }
      }

      const periodRows = db
        .prepare(
          `SELECT periodId
           FROM ${table}
           WHERE periodId IS NOT NULL
           UNION
           SELECT periodId
           FROM invoice_counters
           WHERE kind = @kind`,
        )
        .all({ kind }) as Array<{ periodId?: number | null }>;

      for (const row of periodRows) {
        const periodId = Number(row.periodId ?? 0);
        if (!Number.isFinite(periodId) || periodId <= 0) {
          continue;
        }
        syncInvoiceCounterExact(
          db,
          table,
          periodId,
          getMaxPeriodSequenceFromInvoices(db, table, periodId),
        );
      }
    };

    repairManagedInvoiceIds("invoices");
    repairManagedInvoiceIds("sale_invoices");

    const createUniquePeriodIndex = (
      table: InvoiceTable,
      indexName: string,
      column: "invoiceNumber" | "invoiceSequence" | "invoiceIdPerPeriod",
      whereClause: string,
    ) => {
      if (!tableExists(table) || !hasColumn(table, "periodId") || !hasColumn(table, column)) {
        return;
      }

      const duplicate = db
        .prepare(
          `SELECT 1
           FROM ${table}
           WHERE periodId IS NOT NULL
             AND ${whereClause}
           GROUP BY periodId, ${column}
           HAVING COUNT(*) > 1
           LIMIT 1`,
        )
        .get();

      if (duplicate) {
        console.info(
          `[invoice-repair] skipped ${indexName}; duplicate ${column} values remain.`,
        );
        return;
      }

      db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
        ON ${table}(periodId, ${column})
        WHERE periodId IS NOT NULL AND ${whereClause};
    `);
    };

    createUniquePeriodIndex(
      "invoices",
      "idx_invoices_period_number_unique",
      "invoiceNumber",
      "invoiceNumber IS NOT NULL AND TRIM(invoiceNumber) <> ''",
    );
    createUniquePeriodIndex(
      "sale_invoices",
      "idx_sale_invoices_period_number_unique",
      "invoiceNumber",
      "invoiceNumber IS NOT NULL AND TRIM(invoiceNumber) <> ''",
    );
    createUniquePeriodIndex(
      "invoices",
      "idx_invoices_period_sequence_unique",
      "invoiceSequence",
      "invoiceSequence IS NOT NULL",
    );
    createUniquePeriodIndex(
      "sale_invoices",
      "idx_sale_invoices_period_sequence_unique",
      "invoiceSequence",
      "invoiceSequence IS NOT NULL",
    );
    createUniquePeriodIndex(
      "invoices",
      "idx_invoices_period_id_per_period_unique",
      "invoiceIdPerPeriod",
      "invoiceIdPerPeriod IS NOT NULL",
    );
    createUniquePeriodIndex(
      "sale_invoices",
      "idx_sale_invoices_period_id_per_period_unique",
      "invoiceIdPerPeriod",
      "invoiceIdPerPeriod IS NOT NULL",
    );

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
