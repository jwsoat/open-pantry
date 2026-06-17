# Phase 0 — Pricehunter Integration Foundation

**Date:** 2026-06-18
**Status:** Spec, awaiting implementation plan
**Repos touched:** `open-pantry` (this repo), `pricehunter` (sibling — jwsoat.com)

## Vision (context for this phase)

Merge Grocy's full inventory feature set (16 tabs: stock overview, shopping list, recipes, meal plan, chores, tasks, batteries, equipment, calendar, purchase, consume, transfer, tool tracking, battery tracking, examples, manage master data) into a self-hostable Next.js app that integrates with Pricehunter's NZ grocery price data.

Two-tier model:

- **Free self-hosted edition** — Open Pantry, single Docker container, SQLite, runs on user's box. Optional Pricehunter add-on enriches shopping/purchase with cheapest-store data.
- **Paid hosted Pro** — same codebase deployed at jwsoat.com, adds multi-device sync and mobile in-store views. ~$50/yr.

Phase 0 ships the plumbing only. No new user-facing features beyond a settings page. Every later phase depends on this foundation.

## Goals

1. Self-hosters can connect their Open Pantry to Pricehunter with an API key obtained via free signup.
2. Pricehunter exposes a public, key-gated, rate-limited read-only API for product search, barcode match, and product detail (price + photos + retailers).
3. Open Pantry's local schema gains a stable link column (`ph_product_id`) on pantry and shopping items so later phases can attach Pricehunter enrichments without further migrations.
4. With no key configured, Open Pantry runs identically to today — zero external calls, no errors.

## Non-Goals (Phase 0)

- UI surfacing Pricehunter data on pantry or shopping list rows (Phase 2).
- Barcode scan UI (Phase 3).
- Directory Network SSO provider integration on Pricehunter (separate task; signup uses existing NextAuth for now).
- Pro tier billing or hosted deploy work (Phase 7).
- Porting any of Grocy's 16 tabs (Phases 1–6).

## Architecture Overview

```
Open Pantry (user's Docker box)             Pricehunter (jwsoat)
─────────────────────────────────           ──────────────────────────────
  pantry_items.ph_product_id   ──lookup──>  GET /api/v1/product/:id
  shopping_items.ph_product_id  ──search──>  GET /api/v1/search?q=
  (future) barcode scan         ──match──>  GET /api/v1/match?ean=

  Settings UI ←───── user pastes ──────  /settings/api-keys (generate)
  lib/pricehunter.ts                       /api/v1/* with auth + rate limit
  ph_cache (24h TTL)                       api_keys + api_rate_buckets tables
```

Two repos, two deploy targets, one API contract.

## Pricehunter Public API Contract

Base URL: `https://api.pricehunter.nz/v1` (final URL TBD before launch — choose between subdomain and `https://jwsoat.com/api/v1`). All requests require `Authorization: Bearer <key>`. JSON in/out.

### Endpoints

#### `GET /v1/search?q=<text>&limit=12`

Grocery-scoped autocomplete.

Response 200:
```json
[
  {
    "id": "string",
    "slug": "string",
    "title": "string",
    "brand": "string | null",
    "imageUrl": "string | null",
    "lowestPrice": 4.99,
    "lowestRetailer": "Pak'nSave"
  }
]
```

#### `GET /v1/match?ean=<barcode>` or `?name=<text>`

Single best match for barcode or fuzzy name. Returns the same shape as a single `search` hit plus `confidence: number` (0–1).

- 200 with body on confident match.
- 404 when no confident match exists.

#### `GET /v1/product/:id`

Full product detail.

Response 200:
```json
{
  "id": "string",
  "slug": "string",
  "title": "string",
  "brand": "string | null",
  "imageUrl": "string | null",
  "category": "string | null",
  "retailers": [
    {
      "name": "Pak'nSave",
      "logoUrl": "string",
      "price": 4.99,
      "unitPrice": "$0.50/100g",
      "onSpecial": true,
      "specialEnds": "2026-06-25",
      "productUrl": "https://...",
      "lastSeen": "2026-06-18T12:34:56Z"
    }
  ],
  "photos": ["https://...", "..."]
}
```

`Cache-Control: public, max-age=3600` on product detail. Search and match are uncached.

### Errors

All non-2xx responses use:
```json
{ "error": "human readable", "code": "UNAUTH|RATE|NOTFOUND|BAD_REQUEST" }
```

`429 Too Many Requests` includes `Retry-After` (seconds) and `X-RateLimit-Remaining: 0`. Successful responses include `X-RateLimit-Remaining`.

### Rate limits

| Tier | Limit |
| --- | --- |
| Free | 10 requests / minute |
| Pro  | 600 requests / minute |

Sliding 60-second window per key.

### CORS

`Access-Control-Allow-Origin: *`, `Allow-Methods: GET, OPTIONS`, `Allow-Headers: Authorization, Content-Type`. Self-hosters call from arbitrary origins.

## Pricehunter Server Implementation

### Routes

```
app/api/v1/
  search/route.ts          — GET, calls existing searchGroceryDeals()
  match/route.ts           — GET ?ean=|?name=
  product/[id]/route.ts    — GET, full product detail
  _middleware.ts           — shared API-key auth + rate limit (or inline helper)
```

All routes: `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

Handlers wrap existing functions in `lib/grocery-deals.ts` and `lib/deals.ts`. The only new logic is a response-shape mapper that strips internal fields (scraper metadata, merge confidences, embeddings) and projects to the public `PhSearchHit` / `PhProduct` shapes.

### Database (Postgres / Drizzle)

```sql
CREATE TABLE api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash    text NOT NULL UNIQUE,         -- sha256 of raw key
  key_prefix  text NOT NULL,                -- first 8 chars, for UI display
  tier        text NOT NULL DEFAULT 'free', -- free | pro
  label       text,                         -- user-supplied "My laptop"
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used   timestamptz,
  revoked_at  timestamptz
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

CREATE TABLE api_rate_buckets (
  key_id        uuid PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0
);
```

### Auth + rate-limit middleware

Pseudocode:

```ts
function authAndRateLimit(req): { keyId, tier } | Response {
  const raw = parseBearer(req);
  if (!raw) return json({ error: "Missing API key", code: "UNAUTH" }, 401);
  const hash = sha256(raw);
  const key = await db.api_keys.findFirst({ where: { keyHash: hash, revokedAt: null } });
  if (!key) return json({ error: "Invalid API key", code: "UNAUTH" }, 401);

  const limit = key.tier === "pro" ? 600 : 10;
  const ok = await bumpBucket(key.id, limit); // atomic increment within 60s window
  if (!ok) return json({ error: "Rate limit", code: "RATE" }, 429, { "Retry-After": "60" });

  await db.api_keys.update({ where: { id: key.id }, data: { lastUsed: new Date() } });
  return { keyId: key.id, tier: key.tier };
}
```

`bumpBucket` runs as one transaction: if `window_start > now() - 60s`, increment and check; else reset window. Use `SELECT ... FOR UPDATE` to avoid races. Postgres-only solution; no Redis required in Phase 0.

### Key issuance UI

New page `app/settings/api-keys/page.tsx`, signed-in only:

- "Generate new key" — server action; creates row with hash, returns raw key once.
- Table of existing keys: prefix (e.g. `ph_a1b2…`), label, tier, last used, revoke button.
- Copy-once banner above the new key: "Save this key now. We don't show it again."
- Pro upgrade button is a stub (mailto link for Phase 0; Stripe in Phase 7).

Signup remains existing NextAuth flow. Directory Network SSO provider integration is a separate task that can land after Phase 0 without breaking the contract.

## Open Pantry Client Implementation

### Module: `lib/pricehunter.ts`

```ts
export interface PricehunterConfig {
  baseUrl: string;
  apiKey: string;
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

export function isConfigured(): boolean;
export async function searchProducts(q: string, limit?: number): Promise<PhSearchHit[]>;
export async function matchByEan(ean: string): Promise<PhSearchHit | null>;
export async function matchByName(name: string): Promise<PhSearchHit | null>;
export async function getProduct(id: string): Promise<PhProduct | null>;
```

Behaviour rules:

- `isConfigured()` returns false when no API key is set. All other functions short-circuit to `null` / `[]` when not configured — no errors, no exceptions, no console noise.
- HTTP errors (4xx / 5xx) log a single warning and return `null` / `[]`. Never surface to UI.
- Config is read fresh per call via a small in-process cache invalidated when the settings UI saves.

### Local cache

```sql
CREATE TABLE ph_cache (
  id           TEXT PRIMARY KEY,        -- pricehunter product id
  payload_json TEXT NOT NULL,
  fetched_at   TEXT NOT NULL            -- ISO timestamp
);
```

- TTL: 24h. `getProduct(id)` returns cache hit without an HTTP call; cache miss or stale entry fetches, stores, returns.
- `searchProducts` and `match*` are not cached — query terms vary too widely.
- Cache cleared automatically when an entry is read past TTL (lazy eviction).

### Config sources

In priority order:

1. Row in `settings` table where `key IN ('pricehunter.base_url', 'pricehunter.api_key')`.
2. Environment variable: `PRICEHUNTER_API_URL`, `PRICEHUNTER_API_KEY`.
3. Default: `baseUrl = "https://api.pricehunter.nz/v1"`, no key.

Self-hosters configure via UI by default; environment fallback supports Docker deployments where the env is set at container start.

### Schema migration (`migrations/0002_pricehunter.sql`)

```sql
ALTER TABLE pantry_items   ADD COLUMN ph_product_id TEXT;
ALTER TABLE shopping_items ADD COLUMN ph_product_id TEXT;
CREATE INDEX idx_pantry_ph_id   ON pantry_items(ph_product_id);
CREATE INDEX idx_shopping_ph_id ON shopping_items(ph_product_id);

CREATE TABLE ph_cache (
  id           TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Migration runner

The current `lib/db.ts` declares schema inline. Refactor:

- New `migrations/` directory in repo root.
- Move existing schema into `migrations/0001_init.sql`.
- New `lib/migrations.ts` reads files in lexicographic order, tracks applied migrations in `_migrations(name TEXT PRIMARY KEY, applied_at TEXT)`, runs missing ones in a transaction at startup.
- Idempotent: re-running on a current DB is a no-op.

### Settings UI

New route `app/settings/page.tsx`:

- Inputs: API URL (prefilled with default), API key (password field).
- Button: "Test connection" — calls `searchProducts("milk", 1)`. Green check on 200, red banner on failure with status message.
- Save button writes both values to `settings` table.
- "Get an API key →" link to Pricehunter signup page.

No nav-bar link in Phase 0 — accessible by URL only. Phase 1 will add it to the sidebar.

## Testing Strategy

### open-pantry

- **Unit** — `lib/pricehunter.ts`: mocked `fetch`, verify URL construction, headers, 401/429/404/5xx mapping, no-key short-circuit.
- **Unit** — migration runner: fresh DB runs all migrations; re-run is a no-op; broken migration rolls back.
- **Unit** — `ph_cache`: hit returns payload, miss calls fetch, stale entry refetches.
- **Integration** — settings save → process restart → values persist and are read by `pricehunter.ts`.
- **Manual** — `docker compose up` on fresh checkout → `/settings` → paste valid key → Test connection green.

### pricehunter

- **Unit** — API-key hash/verify roundtrip; revoked key rejected; non-existent key rejected.
- **Unit** — rate-limit bucket: 10 OK, 11th = 429; window reset after 60s.
- **Integration (vitest)** — `GET /v1/search?q=milk` with valid key → 200 + valid shape; bad key → 401; no key → 401; rate exceed → 429 with `Retry-After`.
- **Integration** — `GET /v1/product/:id` response strips internal fields (assert known internal field names are absent).
- **Manual** — signed-in user generates key on `/settings/api-keys` → curl `/v1/search` with `Bearer` header → 200.

## Acceptance Criteria

Phase 0 is done when all of the following are true:

1. A fresh Open Pantry Docker deploy exposes `/settings`. Pasting a valid key + URL, clicking "Test connection", and seeing "Connected to Pricehunter ✓" works end-to-end.
2. Open Pantry with no key configured runs identically to current Open Pantry: zero outbound HTTP calls to Pricehunter, no errors, no warnings.
3. A signed-in Pricehunter user can navigate to `/settings/api-keys`, generate a new key, see it once, and `curl -H "Authorization: Bearer <key>" https://api.pricehunter.nz/v1/search?q=milk` returns 200 with a valid `PhSearchHit[]`.
4. Calling `/v1/*` without a key or with a revoked key returns 401. An 11th request within 60 seconds on the free tier returns 429 with `Retry-After`.
5. Fresh Open Pantry SQLite DB contains `ph_product_id` columns on `pantry_items` and `shopping_items` with indexes, plus `ph_cache` and `settings` tables.
6. CI (typecheck + tests) green on both repos.

## Risks & Open Questions

| Risk / question | Mitigation / decision |
| --- | --- |
| Final public API base URL: `api.pricehunter.nz` vs `jwsoat.com/api/v1` | Decide before release; client config makes this trivial to switch. |
| Postgres-based rate limiting under high traffic | Acceptable for Phase 0 (free-tier volume small); revisit with Redis if rate-limit row contention shows up in production. |
| Existing Open Pantry users upgrading lose data on bad migration | `ALTER TABLE ADD COLUMN` is safe in SQLite; release notes will instruct users to back up `open-pantry.db`. |
| Directory Network SSO integration not specified | Out of scope; Phase 0 uses existing NextAuth signup. DN provider added as separate task without changing the API contract. |
| Pricehunter exposes scraper-internal fields by accident | Response mapper has an explicit allow-list of public fields, plus an integration test asserting known-internal field names are absent. |

## Delivery

- Branch per repo: `phase-0-pricehunter-integration`.
- Atomic commits in order: schema migrations, client lib, settings page, server routes, middleware, key UI, tests.
- Each commit passes typecheck and tests.
- One PR per repo. Merge order: **pricehunter first** (so the API is live before any Open Pantry build references it) → **open-pantry second**.
- Release tag: `open-pantry v2.0.0-phase0`. Pricehunter continuously deployed.

## Roadmap (post-Phase 0)

| Phase | Scope |
| --- | --- |
| 1 — Stock core | Grocy parity: locations, units, product groups, stock overview with due dates, consume / inventory / transfer + journal, master data CRUD. |
| 2 — Shopping list + Pricehunter UI | Surface `lowestPrice` + `lowestRetailer` on list rows. Group by store. In-store mode. One-tap restock from stock overview. |
| 3 — Purchase + barcode | Purchase tab (search Pricehunter → push to list or stock). ZXing barcode scan → match → add. |
| 4 — Recipes + meal plan | Recipes with ingredients; meal plan calendar; "add missing ingredients to shopping list" with Pricehunter pricing. |
| 5 — Generic trackables | One engine: chores, tasks, batteries, equipment. |
| 6 — Calendar + reports + polish | Calendar aggregates expiry + chores + meal plan + tasks. Stock journal/reports. Sample data. |
| 7 — Hosted Pro | Sync engine, mobile in-store views, Directory Network SSO, billing. |
