-- 0001_init.sql
-- Extracted verbatim from lib/db.ts:43-70 (bootstrap function). Existing
-- self-hosters' databases already have these tables; the migration runner
-- skips this on first run for existing DBs by inserting a synthetic
-- _migrations row when it detects the legacy state (see lib/migrations.ts).

CREATE TABLE IF NOT EXISTS pantry_items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  quantity    REAL NOT NULL DEFAULT 1,
  unit        TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT 'pantry',
  expiry_date TEXT,
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
  checked     INTEGER NOT NULL DEFAULT 0,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS shopping_list_checked_idx ON shopping_list_items (checked, created_at);
