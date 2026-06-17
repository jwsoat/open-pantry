import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Legacy detection: if pantry_items + shopping_list_items already exist but
  // _migrations has no row for 0001_init.sql, mark 0001 as applied so we don't
  // re-run CREATE statements on a live database. The CREATE statements use
  // IF NOT EXISTS so re-running is technically safe, but recording the row
  // keeps the migration ledger honest.
  const legacy = db
    .prepare(
      `SELECT (SELECT name FROM sqlite_master WHERE type='table' AND name='pantry_items') AS p,
              (SELECT name FROM sqlite_master WHERE type='table' AND name='shopping_list_items') AS s`,
    )
    .get() as { p: string | null; s: string | null };
  if (legacy.p && legacy.s) {
    db.prepare(
      `INSERT OR IGNORE INTO _migrations (name) VALUES ('0001_init.sql')`,
    ).run();
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (db.prepare(`SELECT name FROM _migrations`).all() as Array<{ name: string }>).map(
      (r) => r.name,
    ),
  );

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO _migrations (name) VALUES (?)`).run(name);
    });
    tx();
  }
}
