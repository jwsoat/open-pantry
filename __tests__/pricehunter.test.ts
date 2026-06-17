import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/migrations";
import { _setDbForTest, setSetting } from "@/lib/settings";
import * as ph from "@/lib/pricehunter";

beforeEach(() => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  _setDbForTest(db);
  ph._resetConfigForTest();
  delete process.env.PRICEHUNTER_API_URL;
  delete process.env.PRICEHUNTER_API_KEY;
});

describe("isConfigured", () => {
  it("false when no key in settings or env", () => {
    expect(ph.isConfigured()).toBe(false);
  });

  it("true when key is in settings table", () => {
    setSetting("pricehunter.api_key", "ph_abc");
    ph._resetConfigForTest();
    expect(ph.isConfigured()).toBe(true);
  });

  it("true when key is in env", () => {
    process.env.PRICEHUNTER_API_KEY = "ph_env";
    ph._resetConfigForTest();
    expect(ph.isConfigured()).toBe(true);
  });
});

describe("_effectiveConfig", () => {
  it("returns null when no key configured", () => {
    expect(ph._effectiveConfig()).toBeNull();
  });

  it("uses default base URL when only key is set", () => {
    setSetting("pricehunter.api_key", "ph_abc");
    ph._resetConfigForTest();
    expect(ph._effectiveConfig()).toEqual({
      baseUrl: "https://api.pricehunter.nz/v1",
      apiKey: "ph_abc",
    });
  });

  it("uses env base URL when set", () => {
    process.env.PRICEHUNTER_API_URL = "https://env.example/v1";
    process.env.PRICEHUNTER_API_KEY = "ph_env";
    ph._resetConfigForTest();
    expect(ph._effectiveConfig()).toEqual({
      baseUrl: "https://env.example/v1",
      apiKey: "ph_env",
    });
  });

  it("settings table takes precedence over env", () => {
    process.env.PRICEHUNTER_API_KEY = "ph_env";
    process.env.PRICEHUNTER_API_URL = "https://env.example/v1";
    setSetting("pricehunter.api_key", "ph_settings");
    setSetting("pricehunter.base_url", "https://settings.example/v1");
    ph._resetConfigForTest();
    expect(ph._effectiveConfig()).toEqual({
      baseUrl: "https://settings.example/v1",
      apiKey: "ph_settings",
    });
  });

  it("invalidateConfigCache forces re-read", () => {
    setSetting("pricehunter.api_key", "ph_first");
    ph._resetConfigForTest();
    expect(ph._effectiveConfig()?.apiKey).toBe("ph_first");
    setSetting("pricehunter.api_key", "ph_second");
    // Without invalidation, cached value would still be ph_first:
    ph.invalidateConfigCache();
    expect(ph._effectiveConfig()?.apiKey).toBe("ph_second");
  });
});
