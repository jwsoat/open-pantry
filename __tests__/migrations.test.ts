import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/migrations";

function fresh(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}

describe("runMigrations", () => {
  it("creates tables on fresh DB and records each migration", () => {
    const db = fresh();
    runMigrations(db);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("pantry_items");
    expect(names).toContain("shopping_list_items");
    expect(names).toContain("_migrations");
    const applied = db
      .prepare(`SELECT name FROM _migrations ORDER BY name`)
      .all() as Array<{ name: string }>;
    expect(applied.map((r) => r.name)).toContain("0001_init.sql");
  });

  it("is idempotent on re-run", () => {
    const db = fresh();
    runMigrations(db);
    const before = db.prepare(`SELECT COUNT(*) as c FROM _migrations`).get() as { c: number };
    runMigrations(db);
    const after = db.prepare(`SELECT COUNT(*) as c FROM _migrations`).get() as { c: number };
    expect(after.c).toBe(before.c);
  });

  it("treats a pre-existing legacy pantry_items table as 0001_init already applied", () => {
    const db = fresh();
    db.exec(`CREATE TABLE pantry_items (id TEXT PRIMARY KEY);`);
    db.exec(`CREATE TABLE shopping_list_items (id TEXT PRIMARY KEY);`);
    runMigrations(db);
    const applied = db
      .prepare(`SELECT name FROM _migrations WHERE name = '0001_init.sql'`)
      .all() as Array<{ name: string }>;
    expect(applied).toHaveLength(1);
  });
});
