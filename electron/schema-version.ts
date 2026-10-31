import type Database from "better-sqlite3";
import { AppError, ErrorCodes } from "./errors";

export const CURRENT_DATA_SCHEMA_VERSION = 4;

export function readDataSchemaVersion(db: Database.Database): number {
  const hasSchemaTable = Boolean(
    db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_schema'`,
    ).get(),
  );
  if (!hasSchemaTable) return 0;
  return Number(
    (db.prepare(`SELECT version FROM app_schema WHERE id = 1`).get() as
      | { version?: number }
      | undefined)?.version ?? 0,
  );
}

export function assertSupportedDataSchema(db: Database.Database): number {
  const version = readDataSchemaVersion(db);
  if (version > CURRENT_DATA_SCHEMA_VERSION) {
    throw new AppError(
      `This business data requires Ledgerly schema ${version}, but this version only supports schema ${CURRENT_DATA_SCHEMA_VERSION}. Install a newer Ledgerly release to open it safely.`,
      ErrorCodes.DATA_SCHEMA_TOO_NEW,
    );
  }
  return version;
}

