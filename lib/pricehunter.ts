// NOTE: `server-only` is not imported because it isn't a top-level dep and
// adding it would require vitest aliasing to keep tests runnable. This module
// is only imported by server-side code paths (API routes, server components)
// in tasks T19+, so accidental client bundling is not a concern yet.
import { getSetting } from "./settings";
import { getCached, putCached } from "./ph-cache";

const DEFAULT_BASE = "https://api.pricehunter.nz/v1";

export interface PricehunterConfig {
  baseUrl: string;
  apiKey: string;
}

// `undefined` = not yet computed; `null` = computed and known-not-configured.
// This three-state pattern lets us tell "no settings configured" apart from
// "haven't checked yet" without re-querying the DB on every call.
let _cached: PricehunterConfig | null | undefined = undefined;

/** Test-only: clear the cached config so a subsequent call re-reads settings/env. */
export function _resetConfigForTest(): void {
  _cached = undefined;
}

/** Production: same effect as _resetConfigForTest, exposed as a public API
 *  for the settings save endpoint to call after writing new values. */
export function invalidateConfigCache(): void {
  _cached = undefined;
}

/** Internal: compute the effective config and cache it. Exported for tests;
 *  in production code, prefer `isConfigured()` and (in later tasks) the named
 *  HTTP helpers. */
export function _effectiveConfig(): PricehunterConfig | null {
  if (_cached !== undefined) return _cached;
  const apiKey =
    getSetting("pricehunter.api_key") ?? process.env.PRICEHUNTER_API_KEY ?? "";
  const baseUrl =
    getSetting("pricehunter.base_url") ??
    process.env.PRICEHUNTER_API_URL ??
    DEFAULT_BASE;
  _cached = apiKey ? { baseUrl, apiKey } : null;
  return _cached;
}

export function isConfigured(): boolean {
  return _effectiveConfig() !== null;
}

export interface PhSearchHit {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  lowestPrice: number | null;
  lowestRetailer: string | null;
}

/**
 * Internal HTTP helper. Returns `null` on any failure (missing config,
 * non-2xx response, network throw). Logs at warn level for non-404 failures
 * so self-hosters can debug a wrong key, but never throws.
 */
async function call<T>(path: string): Promise<T | null> {
  const cfg = _effectiveConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) {
      if (res.status !== 404) {
        console.warn(`Pricehunter ${path} -> ${res.status}`);
      }
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`Pricehunter ${path} threw:`, err);
    return null;
  }
}

export async function searchProducts(
  q: string,
  limit = 12,
): Promise<PhSearchHit[]> {
  if (q.trim().length < 2) return [];
  const out = await call<PhSearchHit[]>(
    `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  return out ?? [];
}

export async function matchByEan(ean: string): Promise<PhSearchHit | null> {
  if (!ean) return null;
  return call<PhSearchHit>(`/match?ean=${encodeURIComponent(ean)}`);
}

export async function matchByName(name: string): Promise<PhSearchHit | null> {
  if (!name) return null;
  return call<PhSearchHit>(`/match?name=${encodeURIComponent(name)}`);
}

export interface PhRetailer {
  name: string;
  logoUrl: string;
  price: number;
  unitPrice: string | null;
  onSpecial: boolean;
  specialEnds: string | null;
  productUrl: string;
  lastSeen: string;
}

export interface PhProduct {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  retailers: PhRetailer[];
  photos: string[];
}

export async function getProduct(id: string): Promise<PhProduct | null> {
  if (!id) return null;
  const cached = getCached<PhProduct>(id);
  if (cached) return cached;
  const fresh = await call<PhProduct>(`/product/${encodeURIComponent(id)}`);
  if (fresh) putCached(id, fresh);
  return fresh;
}

export interface PhPingResult {
  ok: boolean;
  status: number | null; // HTTP status if we got a response, null on network failure or missing config
  error?: string;        // human-readable message when ok is false
  sample?: PhSearchHit;  // first hit if the probe returned results
}

/**
 * One-shot probe used by the settings page's "Test connection" button.
 * Unlike searchProducts, this returns a structured ok/status/error result
 * so the UI can tell "key rejected (401)" apart from "key OK, no results"
 * apart from "network failure".
 */
export async function pingPricehunter(): Promise<PhPingResult> {
  const cfg = _effectiveConfig();
  if (!cfg) {
    return { ok: false, status: null, error: "No API key configured" };
  }
  try {
    const res = await fetch(`${cfg.baseUrl}/search?q=milk&limit=1`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) {
      const msg =
        res.status === 401 || res.status === 403
          ? "API key rejected"
          : res.status === 404
          ? "URL not found — check baseUrl"
          : res.status === 429
          ? "Rate limited — try again in a minute"
          : `Server returned ${res.status}`;
      return { ok: false, status: res.status, error: msg };
    }
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body)) {
      return { ok: false, status: res.status, error: "Unexpected response shape" };
    }
    const sample = body.length > 0 ? (body[0] as PhSearchHit) : undefined;
    return { ok: true, status: res.status, sample };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
