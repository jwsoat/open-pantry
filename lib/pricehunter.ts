// NOTE: `server-only` is not imported because it isn't a top-level dep and
// adding it would require vitest aliasing to keep tests runnable. This module
// is only imported by server-side code paths (API routes, server components)
// in tasks T19+, so accidental client bundling is not a concern yet.
import { getSetting } from "./settings";

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
