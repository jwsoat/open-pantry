import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runMigrations } from "./migrations";

// Single shared connection for the whole app. better-sqlite3 is synchronous, so
// there's no pool to manage — one connection per process is the recommended
// pattern and is plenty for a single-household, self-hosted tool.
let _db: Database.Database | null = null;

function dbPath(): string {
  const p = process.env.OPEN_PANTRY_DB_PATH ?? "./data/open-pantry.db";
  return resolve(process.cwd(), p);
}

/**
 * Lazily open (and on first call, migrate) the local SQLite database.
 * Everything lives in a single file on disk — no server, no network, no
 * accounts. Delete the file and you've wiped your data; copy it and you've
 * backed it up.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const file = dbPath();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL"); // better concurrency for the dev server
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  _db = db;
  return _db;
}
