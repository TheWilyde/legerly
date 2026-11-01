import type Database from "better-sqlite3";
import { AppError, ErrorCodes } from "./errors";

/**
 * Ledgerly 1.0.1 - 1.0.3 shipped an "invoice integrity" migration that stamped
 * `app_schema.version` (3, later 4) onto the profile database and added objects
 * this version of the app knows nothing about: minor-unit money columns, a
 * stock movement ledger, invoice revision snapshots, ABORT triggers on the
 * invoice tables and unique indexes on invoice item positions.
 *
 * Those releases were rolled back, but the databases they touched are still in
 * the field, including inside exported `.biz` archives. The leftovers are not
 * all harmless:
 *
 *  - the ABORT triggers reject writes this version makes legitimately, most
 *    importantly the `periodId` backfill for legacy invoices that have no
 *    invoiceDate, which would abort opening the profile outright;
 *  - the unique `(invoiceId, position)` indexes reject item layouts this
 *    version permits;
 *  - `stock.archived = 1` hides rows from the newer app only, so those rows are
 *    visible and editable here and must not silently disappear again later;
 *  - the `app_schema` stamp makes a future upgrade skip its own backfill, which
 *    would leave every row written by this version with NULL minor-unit money
 *    and therefore read back as 0.00;
 *  - the stock movement ledger stops tracking reality the moment this version
 *    writes an invoice, so a later "rebuild stock from movements" would compute
 *    wrong quantities from it.
 *
 * This pass makes such a database safe to use here, and safe to carry forward
 * again later, without discarding anything the user entered. Rows and columns
 * are kept; only the constraints and the version stamp are removed, and the
 * stale movement ledger is set aside under a parked name so a future upgrade
 * reseeds it from the invoices instead of trusting it.
 *
 * It is idempotent and a no-op on databases this version created itself.
 */

const PARKED_STOCK_MOVEMENTS = "stock_movements_parked_v4";

/** ABORT triggers added by the 1.0.1 - 1.0.3 integrity migration. */
const LEGACY_TRIGGERS = [
  "invoice_items_integrity_insert",
  "invoice_items_integrity_update",
  "sale_invoice_items_integrity_insert",
  "sale_invoice_items_integrity_update",
  "invoices_integrity_insert",
  "invoices_integrity_update",
  "sale_invoices_integrity_insert",
  "sale_invoices_integrity_update",
] as const;

/** Indexes that reject writes this version permits. */
const LEGACY_CONSTRAINT_INDEXES = [
  "idx_invoice_items_position",
  "idx_sale_invoice_items_position",
] as const;

/** Indexes over the movement ledger, dropped so the parked table keeps no names. */
const LEGACY_MOVEMENT_INDEXES = [
  "idx_stock_movements_code",
  "idx_stock_movements_invoice",
] as const;

const MOVEMENT_COLUMNS = [
  "invoiceKind",
  "invoiceId",
  "invoiceRevision",
  "linePosition",
  "stockCode",
  "quantityDelta",
  "unitRateMinor",
  "effectiveDate",
  "reason",
  "reversesMovementId",
  "createdAt",
].join(", ");

export type LegacySchemaCompatReport = {
  /** Version found in `app_schema`; 0 when the stamp was absent. */
  schemaVersionFound: number;
  droppedTriggers: string[];
  droppedIndexes: string[];
  unarchivedStockItems: number;
  parkedStockMovements: number;
  clearedSchemaStamp: boolean;
  /** False when nothing from a newer release was present. */
  changed: boolean;
};

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(name),
  );
}

function objectExists(
  db: Database.Database,
  type: "trigger" | "index",
  name: string,
): boolean {
  return Boolean(
    db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?`)
      .get(type, name),
  );
}

function hasColumn(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  if (!tableExists(db, table)) return false;
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).some((info) => info.name === column);
}

function readSchemaStamp(db: Database.Database): number {
  if (!tableExists(db, "app_schema")) return 0;
  const row = db.prepare(`SELECT version FROM app_schema WHERE id = 1`).get() as
    | { version?: number }
    | undefined;
  return Number(row?.version ?? 0);
}

/**
 * Strips the constraints and version stamp left by Ledgerly 1.0.1 - 1.0.3 so
 * this version can read and write the database safely. Call before any other
 * statement runs against a profile database.
 */
export function applyLegacySchemaCompat(
  db: Database.Database,
): LegacySchemaCompatReport {
  const report: LegacySchemaCompatReport = {
    schemaVersionFound: 0,
    droppedTriggers: [],
    droppedIndexes: [],
    unarchivedStockItems: 0,
    parkedStockMovements: 0,
    clearedSchemaStamp: false,
    changed: false,
  };

  try {
    const run = db.transaction(() => {
      report.schemaVersionFound = readSchemaStamp(db);

      for (const trigger of LEGACY_TRIGGERS) {
        if (objectExists(db, "trigger", trigger)) {
          db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
          report.droppedTriggers.push(trigger);
        }
      }

      for (const index of LEGACY_CONSTRAINT_INDEXES) {
        if (objectExists(db, "index", index)) {
          db.exec(`DROP INDEX IF EXISTS ${index}`);
          report.droppedIndexes.push(index);
        }
      }

      // Stock hidden by the newer app's soft delete is visible here, so clear
      // the flag rather than leave rows that a later upgrade would hide again.
      if (hasColumn(db, "stock", "archived")) {
        report.unarchivedStockItems = db
          .prepare(`UPDATE stock SET archived = 0 WHERE archived <> 0`)
          .run().changes;
      }

      // Park the movement ledger: this version does not maintain it, so leaving
      // it in place would let a later rebuild derive stock from stale history.
      if (tableExists(db, "stock_movements")) {
        for (const index of LEGACY_MOVEMENT_INDEXES) {
          if (objectExists(db, "index", index)) {
            db.exec(`DROP INDEX IF EXISTS ${index}`);
            report.droppedIndexes.push(index);
          }
        }

        report.parkedStockMovements = Number(
          (
            db
              .prepare(`SELECT COUNT(*) AS count FROM stock_movements`)
              .get() as { count?: number }
          ).count ?? 0,
        );

        if (tableExists(db, PARKED_STOCK_MOVEMENTS)) {
          db.exec(
            `INSERT OR IGNORE INTO ${PARKED_STOCK_MOVEMENTS} (${MOVEMENT_COLUMNS})
             SELECT ${MOVEMENT_COLUMNS} FROM stock_movements`,
          );
          db.exec(`DROP TABLE stock_movements`);
        } else {
          db.exec(
            `ALTER TABLE stock_movements RENAME TO ${PARKED_STOCK_MOVEMENTS}`,
          );
        }
      }

      // Drop the version stamp so a future upgrade reruns its own migration and
      // backfills the minor-unit columns this version leaves empty.
      if (tableExists(db, "app_schema")) {
        report.clearedSchemaStamp =
          db.prepare(`DELETE FROM app_schema`).run().changes > 0;
      }

      report.changed =
        report.droppedTriggers.length > 0 ||
        report.droppedIndexes.length > 0 ||
        report.unarchivedStockItems > 0 ||
        report.parkedStockMovements > 0 ||
        report.clearedSchemaStamp;
    });

    run();
  } catch (error) {
    throw new AppError(
      `This business data was last opened by a newer Ledgerly release and could not be prepared for this version: ${
        error instanceof Error ? error.message : String(error)
      }`,
      ErrorCodes.LEGACY_SCHEMA_COMPAT_FAILED,
    );
  }

  return report;
}
