import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/migrations";
import { _setDbForTest as setSettingsDb } from "@/lib/settings";
import { getCached, putCached, _setDbForTest, TTL_MS, _exec } from "@/lib/ph-cache";

beforeEach(() => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  // Both modules share the same test DB pointer for migrations to apply
  // before settings/cache are read.
  setSettingsDb(db);
  _setDbForTest(db);
});

describe("ph-cache", () => {
  it("miss returns null", () => {
    expect(getCached("p1")).toBeNull();
  });

  it("hit returns payload after put", () => {
    putCached("p1", { id: "p1", title: "Milk" });
    expect(getCached("p1")).toEqual({ id: "p1", title: "Milk" });
  });

  it("overwrite refreshes payload + fetched_at", () => {
    putCached("p1", { v: 1 });
    expect(getCached<{ v: number }>("p1")?.v).toBe(1);
    putCached("p1", { v: 2 });
    expect(getCached<{ v: number }>("p1")?.v).toBe(2);
  });

  it("returns null when stale", () => {
    putCached("p1", { id: "p1" });
    // Force-stale by rewriting fetched_at to 2 days ago.
    const past = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    _exec("UPDATE ph_cache SET fetched_at = ? WHERE id = ?", [past, "p1"]);
    expect(getCached("p1")).toBeNull();
  });

  it("TTL_MS is 24h", () => {
    expect(TTL_MS).toBe(24 * 3600 * 1000);
  });
});
