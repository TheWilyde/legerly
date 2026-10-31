import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { ensureSchema } from "../db";
import { CURRENT_DATA_SCHEMA_VERSION } from "../schema-version";

describe("data schema version guard", () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it("accepts the current schema", () => {
    database = new Database(":memory:");
    ensureSchema(database);
    const row = database.prepare("SELECT version FROM app_schema WHERE id = 1").get() as { version: number };
    expect(row.version).toBe(CURRENT_DATA_SCHEMA_VERSION);
    expect(() => ensureSchema(database!)).not.toThrow();
  });

  it("rejects a newer schema before changing it", () => {
    database = new Database(":memory:");
    ensureSchema(database);
    database.prepare("UPDATE app_schema SET version = ? WHERE id = 1").run(CURRENT_DATA_SCHEMA_VERSION + 1);
    expect(() => ensureSchema(database!)).toThrow(/requires Ledgerly schema/);
    const row = database.prepare("SELECT version FROM app_schema WHERE id = 1").get() as { version: number };
    expect(row.version).toBe(CURRENT_DATA_SCHEMA_VERSION + 1);
  });
});
