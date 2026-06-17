import type Database from "better-sqlite3";
import { getDb as realGetDb } from "./db";

export const TTL_MS = 24 * 3600 * 1000;

// The cache shares its DB pointer with lib/settings.ts so that one
// _setDbForTest call (in either module) can wire both for tests. Production
// always reads through realGetDb(); the _testDb override only kicks in when
// vitest explicitly sets it.
let _testDb: Database.Database | null = null;

function db(): Database.Database {
  return _testDb ?? realGetDb();
}

export function _setDbForTest(d: Database.Database | null): void {
  _testDb = d;
}

export function getCached<T>(id: string): T | null {
  const row = db()
    .prepare(`SELECT payload_json, fetched_at FROM ph_cache WHERE id = ?`)
    .get(id) as { payload_json: string; fetched_at: string } | undefined;
  if (!row) return null;
  const fetched = new Date(row.fetched_at).getTime();
  if (Number.isNaN(fetched) || Date.now() - fetched > TTL_MS) return null;
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export function putCached(id: string, payload: unknown): void {
  db()
    .prepare(
      `INSERT INTO ph_cache (id, payload_json, fetched_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json,
                                     fetched_at   = excluded.fetched_at`,
    )
    .run(id, JSON.stringify(payload));
}

/** Test-only DB helper to forcibly set a row's fetched_at (used to verify
 *  stale-eviction without sleeping for 24 hours). Not for production use. */
export function _exec(sql: string, params: unknown[]): void {
  db().prepare(sql).run(...(params as never[]));
}
