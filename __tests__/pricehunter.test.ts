import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchProducts", () => {
  beforeEach(() => {
    setSetting("pricehunter.api_key", "ph_test");
    setSetting("pricehunter.base_url", "https://api.example/v1");
    ph._resetConfigForTest();
  });

  it("returns [] when not configured", async () => {
    setSetting("pricehunter.api_key", "");
    ph._resetConfigForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const out = await ph.searchProducts("milk");
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when q too short", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await ph.searchProducts("a")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the configured URL with bearer header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "p1",
              slug: "milk",
              title: "Milk",
              brand: null,
              imageUrl: null,
              lowestPrice: 4.99,
              lowestRetailer: "paknsave",
            },
          ]),
          { status: 200 },
        ),
      );
    const out = await ph.searchProducts("milk", 5);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("p1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/v1/search?q=milk&limit=5",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer ph_test" }),
      }),
    );
  });

  it("uses default limit when none passed", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));
    await ph.searchProducts("milk");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/v1/search?q=milk&limit=12",
      expect.anything(),
    );
  });

  it("returns [] on 401/429/5xx without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 }),
    );
    expect(await ph.searchProducts("milk")).toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    expect(await ph.searchProducts("milk")).toEqual([]);
  });
});

describe("matchByEan / matchByName", () => {
  beforeEach(() => {
    setSetting("pricehunter.api_key", "ph_test");
    setSetting("pricehunter.base_url", "https://api.example/v1");
    ph._resetConfigForTest();
  });

  it("returns null on empty input", async () => {
    expect(await ph.matchByEan("")).toBeNull();
    expect(await ph.matchByName("")).toBeNull();
  });

  it("matchByEan returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    expect(await ph.matchByEan("9415007012345")).toBeNull();
  });

  it("matchByEan returns hit on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "p1",
          slug: "milk",
          title: "Milk",
          brand: null,
          imageUrl: null,
          lowestPrice: 4.99,
          lowestRetailer: "paknsave",
          confidence: 1,
        }),
        { status: 200 },
      ),
    );
    const out = await ph.matchByEan("9415007012345");
    expect(out?.id).toBe("p1");
  });

  it("matchByName hits /match?name=", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "p2",
            slug: "milk-l",
            title: "Milk",
            brand: null,
            imageUrl: null,
            lowestPrice: 5.99,
            lowestRetailer: "ww",
          }),
          { status: 200 },
        ),
      );
    const out = await ph.matchByName("milk");
    expect(out?.id).toBe("p2");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/v1/match?name=milk",
      expect.anything(),
    );
  });
});
