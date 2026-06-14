import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Single shared connection for the whole app. better-sqlite3 is synchronous, so
// there's no pool to manage — one connection per process is the recommended
// pattern and is plenty for a single-household, self-hosted tool.
let _db: Database.Database | null = null;

function dbPath(): string {
  const p = process.env.OPEN_PANTRY_DB_PATH ?? "./data/open-pantry.db";
  return resolve(process.cwd(), p);
}

/**
 * Lazily open (and on first call, create + migrate) the local SQLite database.
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
  bootstrap(db);

  _db = db;
  return _db;
}

/**
 * Idempotent schema setup. There's only ever one (local) user, so unlike a
 * hosted multi-tenant app these tables have no user_id — your data is the whole
 * database. Run on every boot; `IF NOT EXISTS` makes it a no-op once created.
 */
function bootstrap(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pantry_items (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      quantity    REAL NOT NULL DEFAULT 1,
      unit        TEXT NOT NULL DEFAULT '',
      location    TEXT NOT NULL DEFAULT 'pantry',
      expiry_date TEXT,                       -- 'YYYY-MM-DD' or NULL
      note        TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS pantry_items_expiry_idx ON pantry_items (expiry_date);

    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      quantity    REAL NOT NULL DEFAULT 1,
      unit        TEXT NOT NULL DEFAULT '',
      checked     INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
      note        TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS shopping_list_checked_idx ON shopping_list_items (checked, created_at);
  `);
}
