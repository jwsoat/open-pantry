import type Database from "better-sqlite3";
import { getDb as realGetDb } from "./db";

// Test-DB override used only by vitest. Production reads through realGetDb().
// Each module (settings, ph-cache) owns its own pointer — tests must call
// _setDbForTest on every module that needs the same in-memory DB.
let _testDb: Database.Database | null = null;

function db(): Database.Database {
  return _testDb ?? realGetDb();
}

export function _setDbForTest(d: Database.Database | null): void {
  _testDb = d;
}

export function getSetting(key: string): string | null {
  const row = db()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}
