import type Database from "better-sqlite3";
import { getDb as realGetDb } from "./db";

// The settings module owns a test-DB pointer used by both itself and any
// future module that needs to share the in-memory DB with tests (e.g.
// lib/ph-cache.ts in T20). Production code never touches _testDb — the
// hook is exported only because vitest needs it.
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
