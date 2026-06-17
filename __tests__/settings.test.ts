import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/migrations";
import { _setDbForTest, getSetting, setSetting } from "@/lib/settings";

describe("settings store", () => {
  beforeEach(() => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    _setDbForTest(db);
  });

  it("returns null for unknown key", () => {
    expect(getSetting("pricehunter.base_url")).toBeNull();
  });

  it("round-trip get/set", () => {
    setSetting("pricehunter.base_url", "https://api.pricehunter.nz/v1");
    expect(getSetting("pricehunter.base_url")).toBe("https://api.pricehunter.nz/v1");
  });

  it("overwrites existing value", () => {
    setSetting("k", "v1");
    setSetting("k", "v2");
    expect(getSetting("k")).toBe("v2");
  });
});
