import Database from 'better-sqlite3'; // ✅ Change back
import { ensureSchema } from '../db';

export function makeMemoryDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);
  return db;
}
