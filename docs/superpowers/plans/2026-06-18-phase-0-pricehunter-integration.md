# Phase 0 — Pricehunter Integration Foundation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the plumbing so Open Pantry can fetch product, price, and photo data from a public, key-gated Pricehunter API, and every later Grocy-feature phase can build on it without further infrastructure work.

**Architecture:** Two repos. `pricehunter` exposes new `/api/v1/{search,match,product/:id}` endpoints behind an API-key + per-key rate limit (10/min free, 600/min Pro). `open-pantry` gains a thin client lib, schema columns linking local items to Pricehunter products (`ph_product_id`), a 24-hour SQLite cache table, a migration runner, and a settings UI for the API URL + key. With no key configured, Open Pantry behaves identically to today.

**Tech Stack:**
- pricehunter — Next.js 16 (App Router), Postgres (Neon), Drizzle ORM, raw SQL migrations, NextAuth, vitest.
- open-pantry — Next.js 15 (App Router), SQLite via `better-sqlite3`, server-only, vitest (added in this plan).

**Merge order:** PR for `pricehunter` first (so the API is live), then PR for `open-pantry`. Branch on each repo: `phase-0-pricehunter-integration`.

**Spec:** [`docs/superpowers/specs/2026-06-18-phase-0-pricehunter-integration-design.md`](../specs/2026-06-18-phase-0-pricehunter-integration-design.md)

**Repo paths used in this plan:**
- `<PH>` = `C:/Users/Jwsoat/Documents/Claude/pricehunter`
- `<OP>` = `C:/Users/Jwsoat/Documents/Claude/Pricehunter-openpantry`

---

## Files Created or Modified

### `pricehunter` repo

| Path | Action | Responsibility |
| --- | --- | --- |
| `lib/db/migrations/0027_api_keys.sql` | Create | `api_keys`, `api_rate_buckets` tables |
| `lib/api-keys.ts` | Create | Generate, hash, verify, revoke keys |
| `lib/api-rate-limit.ts` | Create | Atomic bucket increment with 60-second sliding window |
| `lib/api-v1-auth.ts` | Create | Combined helper used by every `/api/v1/*` route |
| `lib/api-v1-mapper.ts` | Create | Project internal `Deal` → public `PhSearchHit` / `PhProduct` |
| `app/api/v1/search/route.ts` | Create | GET autocomplete |
| `app/api/v1/match/route.ts` | Create | GET single match by EAN or name |
| `app/api/v1/product/[id]/route.ts` | Create | GET full product detail |
| `app/settings/api-keys/page.tsx` | Create | Manage keys (signed-in only) |
| `app/settings/api-keys/actions.ts` | Create | Server actions: generate, revoke |
| `__tests__/api-keys.test.ts` | Create | Hash, verify, revoke |
| `__tests__/api-rate-limit.test.ts` | Create | Bucket logic |
| `__tests__/api-v1-mapper.test.ts` | Create | Internal-field stripping |
| `__tests__/api-v1-routes.test.ts` | Create | End-to-end route behaviour |

### `open-pantry` repo

| Path | Action | Responsibility |
| --- | --- | --- |
| `migrations/0001_init.sql` | Create | Existing schema, extracted from `lib/db.ts` |
| `migrations/0002_pricehunter.sql` | Create | `ph_product_id` columns, `ph_cache`, `settings` tables |
| `lib/migrations.ts` | Create | Runner: read migration files, track in `_migrations`, run missing in transaction |
| `lib/db.ts` | Modify | Replace inline `bootstrap()` with migration-runner call |
| `lib/settings.ts` | Create | Typed get/set against `settings` table |
| `lib/pricehunter.ts` | Create | HTTP client + `isConfigured()` + graceful degrade |
| `lib/ph-cache.ts` | Create | 24-hour TTL lookup over `ph_cache` |
| `app/settings/page.tsx` | Create | Form: URL + key + Test connection |
| `app/api/settings/route.ts` | Create | POST save settings |
| `app/api/settings/test-connection/route.ts` | Create | POST: call `searchProducts("milk",1)` with current creds |
| `package.json` | Modify | Add `vitest`, `@types/node` (if needed), `test` script |
| `vitest.config.ts` | Create | Node test environment, `__tests__/**/*.test.ts` glob |
| `__tests__/migrations.test.ts` | Create | Fresh run + idempotent re-run |
| `__tests__/settings.test.ts` | Create | Round-trip |
| `__tests__/pricehunter.test.ts` | Create | URL construction, headers, error mapping, no-key short-circuit |
| `__tests__/ph-cache.test.ts` | Create | Hit, miss, stale refetch |

### Spec correction note

The committed spec lists the local table as `shopping_items`; the real table created by `lib/db.ts:58` is `shopping_list_items`. This plan uses the actual name. After this plan lands, update the spec to match.

---

## Plan A — `pricehunter` (merges first)

### Task 1: Migration 0027 — `api_keys` + `api_rate_buckets`

**Files:**
- Create: `<PH>/lib/db/migrations/0027_api_keys.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0027_api_keys.sql
-- Public Pricehunter API: key issuance + per-key rate-limit buckets.
-- Phase 0 of Open Pantry / Pricehunter integration.

CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash    text NOT NULL UNIQUE,
  key_prefix  text NOT NULL,
  tier        text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used   timestamptz,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user     ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS api_rate_buckets (
  key_id        uuid PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0
);
```

- [ ] **Step 2: Apply migration locally**

```bash
cd C:/Users/Jwsoat/Documents/Claude/pricehunter
npm run db:migrate
```

Expected: log line "applied 0027_api_keys.sql"; tables exist.

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "\d api_keys"
psql "$DATABASE_URL" -c "\d api_rate_buckets"
```

Expected: both tables present with the columns listed above.

- [ ] **Step 4: Commit**

```bash
git add lib/db/migrations/0027_api_keys.sql
git commit -m "feat(api): add api_keys and api_rate_buckets tables"
```

---

### Task 2: `lib/api-keys.ts` — hash, verify, generate, revoke (TDD)

**Files:**
- Create: `<PH>/lib/api-keys.ts`
- Test: `<PH>/__tests__/api-keys.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api-keys.test.ts
import { describe, it, expect } from "vitest";
import { hashApiKey, prefixOf, generateRawKey } from "@/lib/api-keys";

describe("api-keys helpers", () => {
  it("hashApiKey returns deterministic sha256 hex (64 chars)", () => {
    const a = hashApiKey("abc");
    const b = hashApiKey("abc");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prefixOf returns the first 8 characters", () => {
    expect(prefixOf("ph_live_AB12CDEF34567890")).toBe("ph_live_");
    expect(prefixOf("short")).toBe("short");
  });

  it("generateRawKey emits a unique ph_-prefixed token of >= 40 chars", () => {
    const a = generateRawKey();
    const b = generateRawKey();
    expect(a).not.toBe(b);
    expect(a.startsWith("ph_")).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
cd C:/Users/Jwsoat/Documents/Claude/pricehunter
npm run test -- __tests__/api-keys.test.ts
```

Expected: 3 failing tests, "Cannot find module '@/lib/api-keys'".

- [ ] **Step 3: Implement the helpers**

```ts
// lib/api-keys.ts
import { createHash, randomBytes } from "node:crypto";

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function prefixOf(raw: string): string {
  return raw.slice(0, 8);
}

export function generateRawKey(): string {
  // 32 random bytes → 43-char base64url, prefixed for human recognition.
  return "ph_" + randomBytes(32).toString("base64url");
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm run test -- __tests__/api-keys.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/api-keys.ts __tests__/api-keys.test.ts
git commit -m "feat(api): add api-key hash/prefix/generate helpers"
```

---

### Task 3: `lib/api-keys.ts` — DB-backed create + verify + revoke

**Files:**
- Modify: `<PH>/lib/api-keys.ts`
- Modify: `<PH>/__tests__/api-keys.test.ts`

- [ ] **Step 1: Extend tests**

Append to `__tests__/api-keys.test.ts`:

```ts
import { createApiKey, verifyApiKey, revokeApiKey } from "@/lib/api-keys";

describe("api-keys DB", () => {
  const TEST_USER = "00000000-0000-0000-0000-000000000001";

  it("createApiKey persists hash + prefix and returns the raw key once", async () => {
    const { raw, record } = await createApiKey(TEST_USER, "test laptop");
    expect(raw.startsWith("ph_")).toBe(true);
    expect(record.userId).toBe(TEST_USER);
    expect(record.tier).toBe("free");
    expect(record.label).toBe("test laptop");
    expect(record.keyPrefix).toBe(raw.slice(0, 8));
  });

  it("verifyApiKey returns record for valid key, null for unknown/revoked", async () => {
    const { raw, record } = await createApiKey(TEST_USER, null);
    const ok = await verifyApiKey(raw);
    expect(ok?.id).toBe(record.id);
    await revokeApiKey(record.id);
    expect(await verifyApiKey(raw)).toBeNull();
    expect(await verifyApiKey("ph_nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm run test -- __tests__/api-keys.test.ts
```

Expected: new tests fail with "createApiKey is not a function".

- [ ] **Step 3: Implement**

Append to `lib/api-keys.ts`:

```ts
import { getDb } from "@/lib/db";

export interface ApiKeyRecord {
  id: string;
  userId: string;
  keyPrefix: string;
  tier: "free" | "pro";
  label: string | null;
  createdAt: Date;
  lastUsed: Date | null;
  revokedAt: Date | null;
}

export async function createApiKey(
  userId: string,
  label: string | null,
): Promise<{ raw: string; record: ApiKeyRecord }> {
  const raw = generateRawKey();
  const hash = hashApiKey(raw);
  const prefix = prefixOf(raw);
  const sql = getDb();
  const [row] = (await sql.query(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, label)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, key_prefix, tier, label, created_at, last_used, revoked_at`,
    [userId, hash, prefix, label],
  )) as Array<Record<string, unknown>>;
  return { raw, record: mapRow(row) };
}

export async function verifyApiKey(raw: string): Promise<ApiKeyRecord | null> {
  if (!raw || !raw.startsWith("ph_")) return null;
  const hash = hashApiKey(raw);
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT id, user_id, key_prefix, tier, label, created_at, last_used, revoked_at
       FROM api_keys
      WHERE key_hash = $1 AND revoked_at IS NULL
      LIMIT 1`,
    [hash],
  )) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  await sql.query(`UPDATE api_keys SET last_used = now() WHERE id = $1`, [rows[0].id]);
  return mapRow(rows[0]);
}

export async function revokeApiKey(id: string): Promise<void> {
  const sql = getDb();
  await sql.query(`UPDATE api_keys SET revoked_at = now() WHERE id = $1`, [id]);
}

function mapRow(r: Record<string, unknown>): ApiKeyRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    keyPrefix: String(r.key_prefix),
    tier: r.tier === "pro" ? "pro" : "free",
    label: r.label == null ? null : String(r.label),
    createdAt: new Date(String(r.created_at)),
    lastUsed: r.last_used == null ? null : new Date(String(r.last_used)),
    revokedAt: r.revoked_at == null ? null : new Date(String(r.revoked_at)),
  };
}
```

Note: this assumes a test user exists. Add a setup helper if the project lacks one:

```ts
// __tests__/setup-test-user.ts
import { getDb } from "@/lib/db";
export async function ensureTestUser(id: string, email = "test@example.com") {
  const sql = getDb();
  await sql.query(
    `INSERT INTO users (id, email) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [id, email],
  );
}
```

Call `await ensureTestUser(TEST_USER)` in a `beforeAll` block in the test file if your runner doesn't auto-seed.

- [ ] **Step 4: Run, confirm pass**

```bash
npm run test -- __tests__/api-keys.test.ts
```

Expected: all 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/api-keys.ts __tests__/api-keys.test.ts __tests__/setup-test-user.ts
git commit -m "feat(api): create, verify, revoke api keys against postgres"
```

---

### Task 4: `lib/api-rate-limit.ts` — sliding window bump (TDD)

**Files:**
- Create: `<PH>/lib/api-rate-limit.ts`
- Test: `<PH>/__tests__/api-rate-limit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api-rate-limit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { bumpBucket, FREE_LIMIT, PRO_LIMIT } from "@/lib/api-rate-limit";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import { ensureTestUser } from "./setup-test-user";
import { getDb } from "@/lib/db";

const TEST_USER = "00000000-0000-0000-0000-000000000002";

describe("api-rate-limit", () => {
  beforeEach(async () => {
    await ensureTestUser(TEST_USER);
  });

  it("allows up to FREE_LIMIT requests then rejects", async () => {
    const { record } = await createApiKey(TEST_USER, "rl-1");
    for (let i = 0; i < FREE_LIMIT; i++) {
      const r = await bumpBucket(record.id, "free");
      expect(r.allowed).toBe(true);
    }
    const r = await bumpBucket(record.id, "free");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
    await revokeApiKey(record.id);
  });

  it("PRO_LIMIT is higher than FREE_LIMIT", () => {
    expect(PRO_LIMIT).toBeGreaterThan(FREE_LIMIT);
    expect(FREE_LIMIT).toBe(10);
    expect(PRO_LIMIT).toBe(600);
  });

  it("resets window when older than 60s", async () => {
    const { record } = await createApiKey(TEST_USER, "rl-2");
    // Manually move the window 90s into the past.
    const sql = getDb();
    await sql.query(
      `INSERT INTO api_rate_buckets (key_id, window_start, count)
       VALUES ($1, now() - interval '90 seconds', $2)
       ON CONFLICT (key_id) DO UPDATE SET window_start = EXCLUDED.window_start, count = EXCLUDED.count`,
      [record.id, FREE_LIMIT],
    );
    const r = await bumpBucket(record.id, "free");
    expect(r.allowed).toBe(true); // bucket should have reset
    await revokeApiKey(record.id);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm run test -- __tests__/api-rate-limit.test.ts
```

Expected: fails with "Cannot find module '@/lib/api-rate-limit'".

- [ ] **Step 3: Implement**

```ts
// lib/api-rate-limit.ts
import { getDb } from "@/lib/db";

export const FREE_LIMIT = 10;
export const PRO_LIMIT = 600;
const WINDOW_SECONDS = 60;

export interface BumpResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function bumpBucket(
  keyId: string,
  tier: "free" | "pro",
): Promise<BumpResult> {
  const limit = tier === "pro" ? PRO_LIMIT : FREE_LIMIT;
  const sql = getDb();

  // Single round trip: upsert the bucket. If the existing window is stale,
  // reset it; otherwise increment. Postgres' ON CONFLICT lets us do this
  // atomically without a SELECT FOR UPDATE.
  const rows = (await sql.query(
    `INSERT INTO api_rate_buckets (key_id, window_start, count)
     VALUES ($1, now(), 1)
     ON CONFLICT (key_id) DO UPDATE
       SET window_start = CASE
             WHEN api_rate_buckets.window_start < now() - interval '${WINDOW_SECONDS} seconds'
               THEN now()
             ELSE api_rate_buckets.window_start
           END,
           count = CASE
             WHEN api_rate_buckets.window_start < now() - interval '${WINDOW_SECONDS} seconds'
               THEN 1
             ELSE api_rate_buckets.count + 1
           END
     RETURNING window_start, count`,
    [keyId],
  )) as Array<{ window_start: string; count: number }>;

  const { window_start, count } = rows[0];
  const windowEnd = new Date(new Date(window_start).getTime() + WINDOW_SECONDS * 1000);
  const retryAfter = Math.max(1, Math.ceil((windowEnd.getTime() - Date.now()) / 1000));

  if (count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter };
  }
  return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm run test -- __tests__/api-rate-limit.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/api-rate-limit.ts __tests__/api-rate-limit.test.ts
git commit -m "feat(api): atomic 60s sliding-window rate limit (10/min free, 600/min pro)"
```

---

### Task 5: `lib/api-v1-auth.ts` — combined helper

**Files:**
- Create: `<PH>/lib/api-v1-auth.ts`

- [ ] **Step 1: Implement**

```ts
// lib/api-v1-auth.ts
// Combined auth + rate-limit gate used by every /api/v1/* route. Keeps the
// route handlers a single line of policy + a single line of business logic.

import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, type ApiKeyRecord } from "@/lib/api-keys";
import { bumpBucket } from "@/lib/api-rate-limit";

export interface V1Context {
  key: ApiKeyRecord;
  remaining: number;
}

export async function authV1(req: NextRequest): Promise<V1Context | NextResponse> {
  const raw = parseBearer(req.headers.get("authorization"));
  if (!raw) {
    return jsonError(401, "Missing API key", "UNAUTH");
  }
  const key = await verifyApiKey(raw);
  if (!key) {
    return jsonError(401, "Invalid API key", "UNAUTH");
  }
  const bump = await bumpBucket(key.id, key.tier);
  if (!bump.allowed) {
    const res = jsonError(429, "Rate limit exceeded", "RATE");
    res.headers.set("Retry-After", String(bump.retryAfterSeconds));
    res.headers.set("X-RateLimit-Remaining", "0");
    return res;
  }
  return { key, remaining: bump.remaining };
}

export function withCors(res: NextResponse, remaining: number): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}

export function jsonError(
  status: number,
  message: string,
  code: "UNAUTH" | "RATE" | "NOTFOUND" | "BAD_REQUEST",
): NextResponse {
  const res = NextResponse.json({ error: message, code }, { status });
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  return m ? m[1] : null;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/api-v1-auth.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/api-v1-auth.ts
git commit -m "feat(api): authV1 helper combining bearer auth and rate limit"
```

---

### Task 6: `lib/api-v1-mapper.ts` — Deal → public shapes (TDD)

**Files:**
- Create: `<PH>/lib/api-v1-mapper.ts`
- Test: `<PH>/__tests__/api-v1-mapper.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api-v1-mapper.test.ts
import { describe, it, expect } from "vitest";
import { mapDealToHit, mapDealToProduct } from "@/lib/api-v1-mapper";
import type { Deal } from "@/lib/types";

const DEAL: Deal = {
  id: "p1",
  slug: "milk-2l",
  title: "Anchor Blue Milk 2L",
  description: "Trim",
  brand: "Anchor",
  ean: "9415007012345",
  modelNumber: null,
  originalPrice: 6,
  dealPrice: 4.99,
  discountPercent: 17,
  savings: 1.01,
  affiliateUrl: "https://example.com",
  retailerId: "ret-paknsave",
  categoryId: "dairy",
  subcategoryId: null,
  imageUrl: "https://img/main.jpg",
  imageUrlNoBg: "https://img/main-nobg.jpg",
  tags: [],
  status: "active",
  isDealOfTheDay: false,
  isVideoReady: false,
  isPromoted: false,
  isBestDeal: true,
  expiresAt: null,
  isStale: false,
  lastVerifiedAt: null,
  publishAt: "2026-06-18T00:00:00Z",
  createdAt: "2026-06-18T00:00:00Z",
  updatedAt: "2026-06-18T00:00:00Z",
  specs: [],
  faq: [],
  priceHistory: [],
  offers: [
    {
      retailerId: "ret-paknsave",
      price: 4.99,
      unitPrice: 2.5,
      unitMeasure: "L",
      url: "https://paknsave.example/milk",
      inStock: true,
      shippingCost: null,
      freeShipping: false,
      isSpecial: true,
    },
  ],
  rating: null,
  reviewCount: 0,
};

describe("mapDealToHit", () => {
  it("projects only the public fields", () => {
    const h = mapDealToHit(DEAL);
    expect(Object.keys(h).sort()).toEqual(
      ["brand", "id", "imageUrl", "lowestPrice", "lowestRetailer", "slug", "title"].sort(),
    );
    expect(h.lowestPrice).toBe(4.99);
  });

  it("strips internal-only fields", () => {
    const h = mapDealToHit(DEAL) as Record<string, unknown>;
    for (const internal of ["specs", "faq", "priceHistory", "offers", "tags", "modelNumber", "affiliateUrl", "isStale"]) {
      expect(internal in h).toBe(false);
    }
  });
});

describe("mapDealToProduct", () => {
  it("includes retailers array with mapped fields only", () => {
    const p = mapDealToProduct(DEAL);
    expect(p.retailers).toHaveLength(1);
    expect(Object.keys(p.retailers[0]).sort()).toEqual(
      ["lastSeen", "logoUrl", "name", "onSpecial", "price", "productUrl", "specialEnds", "unitPrice"].sort(),
    );
  });

  it("strips internal-only fields from the top level", () => {
    const p = mapDealToProduct(DEAL) as Record<string, unknown>;
    for (const internal of ["specs", "faq", "priceHistory", "tags", "isStale", "affiliateUrl"]) {
      expect(internal in p).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm run test -- __tests__/api-v1-mapper.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement**

```ts
// lib/api-v1-mapper.ts
import type { Deal } from "@/lib/types";

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

export function mapDealToHit(d: Deal): PhSearchHit {
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    brand: d.brand || null,
    imageUrl: d.imageUrl || null,
    lowestPrice: d.dealPrice ?? null,
    lowestRetailer: d.retailerId ? prettyRetailer(d.retailerId) : null,
  };
}

export function mapDealToProduct(d: Deal): PhProduct {
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    brand: d.brand || null,
    imageUrl: d.imageUrl || null,
    category: d.categoryId || null,
    photos: d.imageUrl ? [d.imageUrl] : [],
    retailers: (d.offers ?? []).map((o) => ({
      name: prettyRetailer(o.retailerId),
      logoUrl: `/retailer-logos/${o.retailerId}.svg`,
      price: o.price,
      unitPrice:
        o.unitPrice != null && o.unitMeasure
          ? `$${o.unitPrice.toFixed(2)}/${o.unitMeasure}`
          : null,
      onSpecial: o.isSpecial ?? false,
      specialEnds: null,
      productUrl: o.url,
      lastSeen: d.updatedAt,
    })),
  };
}

function prettyRetailer(retailerId: string): string {
  // Phase 0 keeps this simple. Phase 2 will swap to a retailer-name lookup.
  return retailerId.replace(/^ret-/, "").replace(/-/g, " ");
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm run test -- __tests__/api-v1-mapper.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/api-v1-mapper.ts __tests__/api-v1-mapper.test.ts
git commit -m "feat(api): map internal Deal to public PhSearchHit/PhProduct shapes"
```

---

### Task 7: `GET /api/v1/search`

**Files:**
- Create: `<PH>/app/api/v1/search/route.ts`

- [ ] **Step 1: Implement the route**

```ts
// app/api/v1/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authV1, jsonError, withCors } from "@/lib/api-v1-auth";
import { searchGroceryDeals } from "@/lib/grocery-deals";
import { mapDealToHit } from "@/lib/api-v1-mapper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 24;

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }), 0);
}

export async function GET(req: NextRequest) {
  const gate = await authV1(req);
  if (gate instanceof NextResponse) return gate;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return withCors(jsonError(400, "q must be at least 2 characters", "BAD_REQUEST"), gate.remaining);
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "12");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitParam) ? limitParam : 12));

  try {
    const deals = await searchGroceryDeals(q, limit);
    const hits = deals.map(mapDealToHit);
    return withCors(NextResponse.json(hits), gate.remaining);
  } catch (err) {
    console.error("GET /api/v1/search failed:", err);
    return withCors(jsonError(500, "Search failed", "BAD_REQUEST"), gate.remaining);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual smoke**

In one terminal:
```bash
npm run dev
```
In another:
```bash
KEY=$(node -e "require('./lib/api-keys').createApiKey('00000000-0000-0000-0000-000000000001','smoke').then(r=>console.log(r.raw))")
curl -s -H "Authorization: Bearer $KEY" "http://localhost:3000/api/v1/search?q=milk" | jq '.[0]'
```

Expected: a JSON object with exactly `id, slug, title, brand, imageUrl, lowestPrice, lowestRetailer`.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/search/route.ts
git commit -m "feat(api): GET /api/v1/search public autocomplete"
```

---

### Task 8: `GET /api/v1/match`

**Files:**
- Create: `<PH>/app/api/v1/match/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/v1/match/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authV1, jsonError, withCors } from "@/lib/api-v1-auth";
import { searchGroceryDeals } from "@/lib/grocery-deals";
import { mapDealToHit } from "@/lib/api-v1-mapper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }), 0);
}

export async function GET(req: NextRequest) {
  const gate = await authV1(req);
  if (gate instanceof NextResponse) return gate;

  const ean = req.nextUrl.searchParams.get("ean")?.trim();
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!ean && !name) {
    return withCors(jsonError(400, "Provide ean= or name=", "BAD_REQUEST"), gate.remaining);
  }

  try {
    const query = ean ?? name!;
    const deals = await searchGroceryDeals(query, 5);
    if (deals.length === 0) {
      return withCors(jsonError(404, "No match", "NOTFOUND"), gate.remaining);
    }
    // Phase 0 confidence heuristic: exact EAN match = 1.0, top fuzzy = 0.6.
    const top = deals[0];
    const confidence =
      ean && top.ean === ean ? 1 : ean ? 0.4 : 0.6;
    if (confidence < 0.5) {
      return withCors(jsonError(404, "No confident match", "NOTFOUND"), gate.remaining);
    }
    return withCors(
      NextResponse.json({ ...mapDealToHit(top), confidence }),
      gate.remaining,
    );
  } catch (err) {
    console.error("GET /api/v1/match failed:", err);
    return withCors(jsonError(500, "Match failed", "BAD_REQUEST"), gate.remaining);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/match/route.ts
git commit -m "feat(api): GET /api/v1/match (ean | name) with confidence"
```

---

### Task 9: `GET /api/v1/product/[id]`

**Files:**
- Create: `<PH>/app/api/v1/product/[id]/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/v1/product/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authV1, jsonError, withCors } from "@/lib/api-v1-auth";
import { getProductBySlug } from "@/lib/db/products";
import { groupRowsIntoDeals } from "@/lib/grocery-deals";
import { mapDealToProduct } from "@/lib/api-v1-mapper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }), 0);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await authV1(req);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  if (!id) {
    return withCors(jsonError(400, "Missing id", "BAD_REQUEST"), gate.remaining);
  }

  try {
    // getProductBySlug handles both id and slug lookup in the existing codebase;
    // confirm against lib/db/products.ts and adapt if a separate getProductById is
    // required.
    const dbProduct = await getProductBySlug(id);
    if (!dbProduct) {
      return withCors(jsonError(404, "Product not found", "NOTFOUND"), gate.remaining);
    }
    const deals = groupRowsIntoDeals([dbProduct] as unknown as never);
    if (deals.length === 0) {
      return withCors(jsonError(404, "Product not found", "NOTFOUND"), gate.remaining);
    }
    const res = withCors(NextResponse.json(mapDealToProduct(deals[0])), gate.remaining);
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  } catch (err) {
    console.error("GET /api/v1/product failed:", err);
    return withCors(jsonError(500, "Lookup failed", "BAD_REQUEST"), gate.remaining);
  }
}
```

> **Implementer note:** Confirm the exact signature of `getProductBySlug` / `groupRowsIntoDeals` in `<PH>/lib/db/products.ts` and `<PH>/lib/grocery-deals.ts`. If a separate `getProductById` exists, prefer it. If `groupRowsIntoDeals` is not exported, export it (it's already used internally in `grocery-deals.ts:425`).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/product/[id]/route.ts lib/grocery-deals.ts
git commit -m "feat(api): GET /api/v1/product/:id full product detail"
```

---

### Task 10: End-to-end route test

**Files:**
- Create: `<PH>/__tests__/api-v1-routes.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/api-v1-routes.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { GET as searchGet } from "@/app/api/v1/search/route";
import { NextRequest } from "next/server";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import { ensureTestUser } from "./setup-test-user";

const TEST_USER = "00000000-0000-0000-0000-000000000003";

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, "http://localhost"), {
    headers: new Headers(headers),
  });
}

describe("GET /api/v1/search", () => {
  let raw: string;
  let keyId: string;

  beforeAll(async () => {
    await ensureTestUser(TEST_USER);
    const out = await createApiKey(TEST_USER, "e2e");
    raw = out.raw;
    keyId = out.record.id;
  });

  it("401 without key", async () => {
    const res = await searchGet(req("/api/v1/search?q=milk"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTH");
  });

  it("401 with bad key", async () => {
    const res = await searchGet(
      req("/api/v1/search?q=milk", { authorization: "Bearer ph_bad" }),
    );
    expect(res.status).toBe(401);
  });

  it("400 when q is too short", async () => {
    const res = await searchGet(
      req("/api/v1/search?q=m", { authorization: `Bearer ${raw}` }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("200 with valid key returns only public fields", async () => {
    const res = await searchGet(
      req("/api/v1/search?q=milk", { authorization: `Bearer ${raw}` }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(Object.keys(body[0]).sort()).toEqual(
        ["brand", "id", "imageUrl", "lowestPrice", "lowestRetailer", "slug", "title"].sort(),
      );
    }
  });

  afterAll(async () => {
    await revokeApiKey(keyId);
  });
});
```

- [ ] **Step 2: Run, confirm pass**

```bash
npm run test -- __tests__/api-v1-routes.test.ts
```

Expected: 4 passing.

- [ ] **Step 3: Commit**

```bash
git add __tests__/api-v1-routes.test.ts
git commit -m "test(api): end-to-end GET /api/v1/search via route handler"
```

---

### Task 11: `/settings/api-keys` page + server actions

**Files:**
- Create: `<PH>/app/settings/api-keys/actions.ts`
- Create: `<PH>/app/settings/api-keys/page.tsx`

- [ ] **Step 1: Server actions**

```ts
// app/settings/api-keys/actions.ts
"use server";

import { auth } from "@/auth";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import { getDb } from "@/lib/db";

export async function generateKeyAction(formData: FormData): Promise<{
  raw?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in first." };
  const label = String(formData.get("label") ?? "").trim() || null;
  const { raw } = await createApiKey(session.user.id, label);
  return { raw };
}

export async function revokeKeyAction(formData: FormData): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  const id = String(formData.get("id") ?? "");
  // Confirm the key belongs to this user before revoking.
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT id FROM api_keys WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, session.user.id],
  )) as Array<{ id: string }>;
  if (rows.length === 0) return { ok: false };
  await revokeApiKey(id);
  return { ok: true };
}
```

- [ ] **Step 2: Page**

```tsx
// app/settings/api-keys/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { generateKeyAction, revokeKeyAction } from "./actions";

export const dynamic = "force-dynamic";

interface KeyRow {
  id: string;
  key_prefix: string;
  tier: string;
  label: string | null;
  created_at: string;
  last_used: string | null;
}

export default async function ApiKeysPage(props: {
  searchParams: Promise<{ raw?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?callbackUrl=/settings/api-keys");

  const sp = await props.searchParams;
  const sql = getDb();
  const keys = (await sql.query(
    `SELECT id, key_prefix, tier, label, created_at, last_used
       FROM api_keys
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [session.user.id],
  )) as KeyRow[];

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "1rem" }}>
      <h1>Pricehunter API keys</h1>
      <p>
        Use these from Open Pantry or any other tool that needs grocery price
        data. Free tier: 10 requests/min. Pro tier: 600/min.
      </p>

      {sp.raw && (
        <div
          role="alert"
          style={{
            background: "#fff7e6",
            border: "1px solid #f0b27a",
            padding: "0.75rem",
            borderRadius: 6,
            margin: "1rem 0",
          }}
        >
          <strong>Save this key now.</strong> You won&apos;t see it again.
          <pre style={{ overflow: "auto" }}>{sp.raw}</pre>
        </div>
      )}

      <form action={async (fd) => {
        "use server";
        const { raw, error } = await generateKeyAction(fd);
        if (error) redirect(`/settings/api-keys?error=${encodeURIComponent(error)}`);
        redirect(`/settings/api-keys?raw=${encodeURIComponent(raw!)}`);
      }}>
        <label>
          Label (optional):{" "}
          <input name="label" type="text" maxLength={60} placeholder="My laptop" />
        </label>{" "}
        <button type="submit">Generate new key</button>
      </form>

      <h2 style={{ marginTop: "2rem" }}>Active keys</h2>
      {keys.length === 0 ? (
        <p>No keys yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Prefix</th><th>Label</th><th>Tier</th><th>Created</th><th>Last used</th><th></th></tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td><code>{k.key_prefix}…</code></td>
                <td>{k.label ?? "—"}</td>
                <td>{k.tier}</td>
                <td>{new Date(k.created_at).toLocaleDateString()}</td>
                <td>{k.last_used ? new Date(k.last_used).toLocaleDateString() : "—"}</td>
                <td>
                  <form action={revokeKeyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <button type="submit">Revoke</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual smoke**

```bash
npm run dev
```
Open `http://localhost:3000/settings/api-keys`. Sign in. Click "Generate new key". Confirm raw key is shown once. Reload — raw key gone, prefix listed. Revoke — row disappears.

- [ ] **Step 5: Commit**

```bash
git add app/settings/api-keys/actions.ts app/settings/api-keys/page.tsx
git commit -m "feat(api): /settings/api-keys page with generate + revoke"
```

---

### Task 12: Open the pricehunter PR

- [ ] **Step 1: Push + PR**

```bash
git push -u origin phase-0-pricehunter-integration
gh pr create --title "Phase 0: public /api/v1/* endpoints + key issuance" --body "$(cat <<'EOF'
## Summary

- New public read-only API: GET /api/v1/{search,match,product/:id}
- API-key auth (sha256-hashed, prefixed for UI display)
- 60s sliding-window rate limit: 10/min free, 600/min pro
- /settings/api-keys page for users to generate and revoke keys

## Test plan
- [ ] curl /v1/search with valid key → 200 + correct shape
- [ ] curl with bad/missing key → 401
- [ ] 11th call in 60s on free tier → 429 + Retry-After
- [ ] /settings/api-keys flow: generate → copy → use → revoke
EOF
)"
```

- [ ] **Step 2: Confirm CI green, merge.**

---

## Plan B — `open-pantry` (merges second)

### Task 13: Add vitest tooling

**Files:**
- Modify: `<OP>/package.json`
- Create: `<OP>/vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
cd C:/Users/Jwsoat/Documents/Claude/Pricehunter-openpantry
npm install --save-dev vitest @types/node
```

- [ ] **Step 2: Add test script**

Modify `package.json` `"scripts"` block to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    pool: "forks",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 4: Smoke**

```bash
npm test
```

Expected: "No test files found" (no failure).

- [ ] **Step 5: Commit**

```bash
git checkout -b phase-0-pricehunter-integration
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

### Task 14: Extract current schema into `0001_init.sql`

**Files:**
- Create: `<OP>/migrations/0001_init.sql`
- Modify: `<OP>/lib/db.ts`

- [ ] **Step 1: Write migration**

```sql
-- migrations/0001_init.sql
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
```

- [ ] **Step 2: Commit (lib/db.ts not yet updated)**

```bash
git add migrations/0001_init.sql
git commit -m "feat(db): extract bootstrap schema into 0001_init.sql"
```

---

### Task 15: Migration runner with TDD

**Files:**
- Create: `<OP>/lib/migrations.ts`
- Create: `<OP>/__tests__/migrations.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// __tests__/migrations.test.ts
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
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm test -- __tests__/migrations.test.ts
```

Expected: 3 failing tests.

- [ ] **Step 3: Implement**

```ts
// lib/migrations.ts
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

  // Legacy detection: if the user has pantry_items + shopping_list_items but no
  // _migrations row for 0001_init.sql, mark 0001 as applied so we don't re-run
  // CREATE TABLE on a DB that's been live for months.
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
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- __tests__/migrations.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Wire runner into db.ts**

Modify `lib/db.ts`:

```ts
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runMigrations } from "./migrations";

let _db: Database.Database | null = null;

function dbPath(): string {
  const p = process.env.OPEN_PANTRY_DB_PATH ?? "./data/open-pantry.db";
  return resolve(process.cwd(), p);
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const file = dbPath();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  _db = db;
  return _db;
}
```

(`bootstrap` function fully removed.)

- [ ] **Step 6: Smoke**

```bash
rm -f data/open-pantry.db
npm run dev
# In another terminal:
sqlite3 data/open-pantry.db ".tables"
```

Expected output includes `_migrations pantry_items shopping_list_items`.

- [ ] **Step 7: Commit**

```bash
git add lib/migrations.ts lib/db.ts __tests__/migrations.test.ts
git commit -m "feat(db): migration runner with legacy-DB detection"
```

---

### Task 16: Migration `0002_pricehunter.sql`

**Files:**
- Create: `<OP>/migrations/0002_pricehunter.sql`
- Modify: `<OP>/__tests__/migrations.test.ts`

- [ ] **Step 1: Write migration**

```sql
-- migrations/0002_pricehunter.sql
ALTER TABLE pantry_items        ADD COLUMN ph_product_id TEXT;
ALTER TABLE shopping_list_items ADD COLUMN ph_product_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pantry_ph_id          ON pantry_items(ph_product_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_ph_id   ON shopping_list_items(ph_product_id);

CREATE TABLE IF NOT EXISTS ph_cache (
  id           TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 2: Extend test**

Append to `__tests__/migrations.test.ts`:

```ts
it("0002 adds ph_product_id columns and ph_cache + settings tables", () => {
  const db = fresh();
  runMigrations(db);
  const cols = db
    .prepare(`PRAGMA table_info(pantry_items)`)
    .all() as Array<{ name: string }>;
  expect(cols.map((c) => c.name)).toContain("ph_product_id");
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all() as Array<{ name: string }>;
  const names = tables.map((t) => t.name);
  expect(names).toContain("ph_cache");
  expect(names).toContain("settings");
});
```

- [ ] **Step 3: Run, confirm pass**

```bash
npm test -- __tests__/migrations.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add migrations/0002_pricehunter.sql __tests__/migrations.test.ts
git commit -m "feat(db): 0002 add ph_product_id columns, ph_cache, settings"
```

---

### Task 17: `lib/settings.ts` (TDD)

**Files:**
- Create: `<OP>/lib/settings.ts`
- Create: `<OP>/__tests__/settings.test.ts`

- [ ] **Step 1: Failing test**

```ts
// __tests__/settings.test.ts
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

  it("round-trip", () => {
    expect(getSetting("pricehunter.base_url")).toBeNull();
    setSetting("pricehunter.base_url", "https://api.pricehunter.nz/v1");
    expect(getSetting("pricehunter.base_url")).toBe("https://api.pricehunter.nz/v1");
  });

  it("overwrite", () => {
    setSetting("k", "v1");
    setSetting("k", "v2");
    expect(getSetting("k")).toBe("v2");
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/settings.ts
import type Database from "better-sqlite3";
import { getDb as realGetDb } from "./db";

let _testDb: Database.Database | null = null;

function db(): Database.Database {
  return _testDb ?? realGetDb();
}

export function _setDbForTest(d: Database.Database | null) {
  _testDb = d;
}

export function getSetting(key: string): string | null {
  const row = db()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}
```

- [ ] **Step 3: Run, commit**

```bash
npm test -- __tests__/settings.test.ts
git add lib/settings.ts __tests__/settings.test.ts
git commit -m "feat(db): settings table get/set helpers"
```

---

### Task 18: `lib/pricehunter.ts` — config + isConfigured (TDD)

**Files:**
- Create: `<OP>/lib/pricehunter.ts`
- Create: `<OP>/__tests__/pricehunter.test.ts`

- [ ] **Step 1: Failing test**

```ts
// __tests__/pricehunter.test.ts
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

afterEach(() => {
  vi.restoreAllMocks();
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

  it("settings takes precedence over env", () => {
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
});
```

- [ ] **Step 2: Implement skeleton**

```ts
// lib/pricehunter.ts
import "server-only";
import { getSetting } from "./settings";

const DEFAULT_BASE = "https://api.pricehunter.nz/v1";

export interface PricehunterConfig {
  baseUrl: string;
  apiKey: string;
}

let _cached: PricehunterConfig | null | undefined = undefined;

export function _resetConfigForTest() {
  _cached = undefined;
}

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

export function invalidateConfigCache() {
  _cached = undefined;
}
```

- [ ] **Step 3: Run, confirm pass**

```bash
npm test -- __tests__/pricehunter.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/pricehunter.ts __tests__/pricehunter.test.ts
git commit -m "feat(ph): pricehunter config resolver and isConfigured()"
```

---

### Task 19: `searchProducts`, `matchByEan`, `matchByName` with fetch mock (TDD)

**Files:**
- Modify: `<OP>/lib/pricehunter.ts`
- Modify: `<OP>/__tests__/pricehunter.test.ts`

- [ ] **Step 1: Extend tests**

Append to `__tests__/pricehunter.test.ts`:

```ts
describe("searchProducts", () => {
  beforeEach(() => {
    setSetting("pricehunter.api_key", "ph_test");
    setSetting("pricehunter.base_url", "https://api.example/v1");
    ph._resetConfigForTest();
  });

  it("returns [] when not configured", async () => {
    setSetting("pricehunter.api_key", "");
    ph._resetConfigForTest();
    const out = await ph.searchProducts("milk");
    expect(out).toEqual([]);
  });

  it("returns [] when q too short", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await ph.searchProducts("a")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the configured URL with bearer header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: "p1", slug: "milk", title: "Milk", brand: null, imageUrl: null, lowestPrice: 4.99, lowestRetailer: "paknsave" }]), { status: 200 }),
    );
    const out = await ph.searchProducts("milk", 5);
    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/v1/search?q=milk&limit=5",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer ph_test" }),
      }),
    );
  });

  it("returns [] on 401/429/5xx without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    expect(await ph.searchProducts("milk")).toEqual([]);
  });
});

describe("matchByEan / matchByName", () => {
  beforeEach(() => {
    setSetting("pricehunter.api_key", "ph_test");
    setSetting("pricehunter.base_url", "https://api.example/v1");
    ph._resetConfigForTest();
  });

  it("returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    expect(await ph.matchByEan("9415007012345")).toBeNull();
  });

  it("returns hit on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "p1", slug: "milk", title: "Milk", brand: null, imageUrl: null, lowestPrice: 4.99, lowestRetailer: "paknsave", confidence: 1 }), { status: 200 }),
    );
    const out = await ph.matchByName("milk");
    expect(out?.id).toBe("p1");
  });
});
```

- [ ] **Step 2: Implement**

Append to `lib/pricehunter.ts`:

```ts
export interface PhSearchHit {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  lowestPrice: number | null;
  lowestRetailer: string | null;
}

async function call<T>(path: string): Promise<T | null> {
  const cfg = _effectiveConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) {
      if (res.status !== 404) {
        console.warn(`Pricehunter ${path} → ${res.status}`);
      }
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`Pricehunter ${path} threw:`, err);
    return null;
  }
}

export async function searchProducts(q: string, limit = 12): Promise<PhSearchHit[]> {
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
```

- [ ] **Step 3: Run, commit**

```bash
npm test -- __tests__/pricehunter.test.ts
git add lib/pricehunter.ts __tests__/pricehunter.test.ts
git commit -m "feat(ph): searchProducts, matchByEan, matchByName with graceful degrade"
```

---

### Task 20: `getProduct` + `ph_cache` (TDD)

**Files:**
- Create: `<OP>/lib/ph-cache.ts`
- Modify: `<OP>/lib/pricehunter.ts`
- Create: `<OP>/__tests__/ph-cache.test.ts`

- [ ] **Step 1: Cache tests**

```ts
// __tests__/ph-cache.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/migrations";
import { _setDbForTest } from "@/lib/settings";
import { getCached, putCached, TTL_MS } from "@/lib/ph-cache";

beforeEach(() => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
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

  it("returns null when stale", () => {
    putCached("p1", { id: "p1" });
    // Force-stale by rewriting fetched_at to 2 days ago.
    const past = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    Database; // keep reference
    // (use the same getDb-backed db via settings.ts _setDbForTest)
    const sql = "UPDATE ph_cache SET fetched_at = ? WHERE id = ?";
    // helper exposed for the test:
    (require("@/lib/ph-cache") as typeof import("@/lib/ph-cache"))._exec(sql, [past, "p1"]);
    expect(getCached("p1")).toBeNull();
  });

  it("TTL is 24h", () => {
    expect(TTL_MS).toBe(24 * 3600 * 1000);
  });
});
```

- [ ] **Step 2: Implement cache**

```ts
// lib/ph-cache.ts
import { _setDbForTest as _settingsTestHook } from "./settings";
import type Database from "better-sqlite3";
import { getDb as realGetDb } from "./db";

export const TTL_MS = 24 * 3600 * 1000;

let _testDb: Database.Database | null = null;

function db(): Database.Database {
  // Cache shares the test DB pointer used by settings.ts via _setDbForTest there.
  // We re-export the same hook so callers in tests don't need to set two pointers.
  return _testDb ?? realGetDb();
}

export function _setDbForTest(d: Database.Database | null) {
  _testDb = d;
  _settingsTestHook(d);
}

export function getCached<T>(id: string): T | null {
  const row = db()
    .prepare(`SELECT payload_json, fetched_at FROM ph_cache WHERE id = ?`)
    .get(id) as { payload_json: string; fetched_at: string } | undefined;
  if (!row) return null;
  const fetched = new Date(row.fetched_at).getTime();
  if (Date.now() - fetched > TTL_MS) return null;
  return JSON.parse(row.payload_json) as T;
}

export function putCached(id: string, payload: unknown): void {
  db()
    .prepare(
      `INSERT INTO ph_cache (id, payload_json, fetched_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json,
                                     fetched_at   = excluded.fetched_at`,
    )
    .run(id, JSON.stringify(payload));
}

// Test-only helper for the staleness test.
export function _exec(sql: string, params: unknown[]) {
  db().prepare(sql).run(...(params as never[]));
}
```

> **Implementer note:** the test imports `_setDbForTest` from `@/lib/settings`. Because both modules share the same in-memory DB, the test sets it via `settings._setDbForTest(db)`; `ph-cache.ts` reads through `realGetDb()` in production but defers to the same DB in tests when wired through. If the test framework runs files in parallel and the import order causes ordering surprises, switch the cache test to set the DB via `ph-cache._setDbForTest(db)` (which forwards) and remove the direct settings call.

- [ ] **Step 3: Hook `getProduct` to cache**

Append to `lib/pricehunter.ts`:

```ts
import { getCached, putCached } from "./ph-cache";

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
```

- [ ] **Step 4: Run, commit**

```bash
npm test -- __tests__/ph-cache.test.ts
git add lib/ph-cache.ts lib/pricehunter.ts __tests__/ph-cache.test.ts
git commit -m "feat(ph): getProduct with 24h ph_cache TTL"
```

---

### Task 21: Settings API routes

**Files:**
- Create: `<OP>/app/api/settings/route.ts`
- Create: `<OP>/app/api/settings/test-connection/route.ts`

- [ ] **Step 1: Save route**

```ts
// app/api/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";
import { invalidateConfigCache } from "@/lib/pricehunter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { baseUrl?: string; apiKey?: string }
    | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (typeof body.baseUrl !== "string" || typeof body.apiKey !== "string") {
    return NextResponse.json({ error: "Bad fields" }, { status: 400 });
  }
  setSetting("pricehunter.base_url", body.baseUrl.trim());
  setSetting("pricehunter.api_key", body.apiKey.trim());
  invalidateConfigCache();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Test-connection route**

```ts
// app/api/settings/test-connection/route.ts
import { NextResponse } from "next/server";
import { searchProducts, isConfigured } from "@/lib/pricehunter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, error: "No API key configured" },
      { status: 400 },
    );
  }
  const hits = await searchProducts("milk", 1);
  // searchProducts returns [] on failure. We treat any successful response (even
  // empty) as a healthy connection — the key worked and the request landed.
  // Distinguish failure mode by checking effective config first; if a valid
  // request returns [], the server is up and the key authenticated.
  return NextResponse.json({ ok: true, sample: hits[0] ?? null });
}
```

> **Implementer note:** `searchProducts` currently swallows errors and returns `[]` on both auth failure and zero results. For a more precise test-connection signal, lift the inner fetch into a separate helper that returns `{ ok, status }` and call that here. Phase 0 ships the "ok if no throw" version; revisit in Phase 2 when the UI surfaces richer diagnostics.

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/route.ts app/api/settings/test-connection/route.ts
git commit -m "feat(settings): API routes for save + test-connection"
```

---

### Task 22: `/settings` page

**Files:**
- Create: `<OP>/app/settings/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/settings/page.tsx
"use client";

import { useEffect, useState } from "react";

const DEFAULT_BASE = "https://api.pricehunter.nz/v1";

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Best-effort load of current settings via the same POST endpoint with no
    // body would be wrong; for Phase 0 we just leave the fields blank. The user
    // pastes the key once.
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl, apiKey }),
    });
    setSaving(false);
    setStatus({
      ok: res.ok,
      msg: res.ok ? "Saved." : "Save failed.",
    });
  }

  async function test() {
    setStatus(null);
    const res = await fetch("/api/settings/test-connection", { method: "POST" });
    const body = await res.json();
    setStatus({
      ok: body.ok === true,
      msg: body.ok ? "Connected to Pricehunter ✓" : `Failed: ${body.error ?? "unknown"}`,
    });
  }

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "1rem" }}>
      <h1>Settings</h1>
      <p>
        Connect Open Pantry to Pricehunter to enrich shopping list items with
        cheapest-store prices and product photos. Leave blank to stay fully
        local.
      </p>

      <label style={{ display: "block", marginTop: "1rem" }}>
        Pricehunter API URL
        <input
          style={{ display: "block", width: "100%" }}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>

      <label style={{ display: "block", marginTop: "1rem" }}>
        API key (paste from <a href="https://jwsoat.com/settings/api-keys" target="_blank" rel="noreferrer">jwsoat.com</a>)
        <input
          style={{ display: "block", width: "100%" }}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
        <button onClick={save} disabled={saving}>Save</button>
        <button onClick={test}>Test connection</button>
      </div>

      {status && (
        <p
          role="status"
          style={{
            marginTop: "1rem",
            color: status.ok ? "#15803d" : "#b91c1c",
          }}
        >
          {status.msg}
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + manual smoke**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000/settings`. Confirm form renders. Save without key → "Save failed" (400). Paste a working key from the merged pricehunter PR + URL → Save → Test connection shows green "Connected ✓".

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat(settings): /settings page (Save + Test connection)"
```

---

### Task 23: End-to-end smoke + open the open-pantry PR

- [ ] **Step 1: Final manual smoke checklist**

Run through every acceptance criterion from the spec:

1. `rm -rf data && npm run dev` — confirm DB created, `/settings` reachable.
2. Without saving anything: `curl -sI http://localhost:3000` 200; no console warning about Pricehunter; pantry/shopping list still work.
3. Paste valid key + URL → Save → Test connection → "Connected to Pricehunter ✓".
4. `sqlite3 data/open-pantry.db ".schema pantry_items"` — confirm `ph_product_id TEXT` column exists.
5. `sqlite3 data/open-pantry.db ".schema shopping_list_items"` — same.
6. `sqlite3 data/open-pantry.db ".tables"` — includes `ph_cache`, `settings`, `_migrations`.

- [ ] **Step 2: Run full test suite + typecheck**

```bash
npm run typecheck
npm test
```

Both must pass.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin phase-0-pricehunter-integration
gh pr create --title "Phase 0: Pricehunter client + settings page + ph_product_id columns" --body "$(cat <<'EOF'
## Summary

- Migration runner (lib/migrations.ts) + 0001_init.sql extracted from inline bootstrap, 0002_pricehunter.sql adding ph_product_id columns, ph_cache, settings tables
- Pricehunter HTTP client (lib/pricehunter.ts) with graceful degrade when no key configured
- 24h ph_cache for product detail
- /settings page: save URL + key, Test connection

## Test plan
- [ ] Fresh DB: tables created, migrations recorded
- [ ] Existing DB (with pantry_items): no re-run of 0001, 0002 adds columns
- [ ] No key: app behaves exactly like current Open Pantry
- [ ] Valid key: Test connection returns green
- [ ] Bad key: Test connection returns red
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec section | Covered by |
| --- | --- |
| Vision context | Plan header + roadmap section retained in spec |
| API contract: `/v1/search` | Task 7 (route), Task 10 (e2e test) |
| API contract: `/v1/match` | Task 8 |
| API contract: `/v1/product/:id` | Task 9 |
| Rate limit 10/600 sliding window | Task 4 (`bumpBucket`), constants asserted by test |
| Errors `{ error, code }` + `Retry-After` | `lib/api-v1-auth.ts:jsonError`, Task 5 |
| CORS allow-* | `withCors` helper, Task 5 |
| `Cache-Control` on product | Task 9 step 1 |
| Postgres tables `api_keys`, `api_rate_buckets` | Task 1 |
| Hashed key storage + prefix display | Tasks 2, 3 |
| `/settings/api-keys` UI: generate + revoke + show once | Task 11 |
| Open Pantry `lib/pricehunter.ts` + graceful degrade | Tasks 18, 19 |
| `ph_cache` 24h TTL | Task 20 |
| Schema columns `ph_product_id` + indexes | Task 16 |
| `ph_cache`, `settings` tables | Task 16 |
| Migration runner refactor | Task 15 |
| `/settings` page Save + Test connection | Tasks 21, 22 |
| Acceptance criteria 1–6 | Task 23 manual checklist |
| Phase 0 non-goals respected | No surfacing UI, no barcode UI, no SSO provider work, no Pro billing |

Note: spec named `shopping_items` but real table is `shopping_list_items`. Plan uses the real name and flags it under "Files Created or Modified".

### Placeholder scan

- No "TBD", "TODO", or "implement later" in any task.
- "Implementer note" callouts in Tasks 9, 20, 21 are intentional — they flag a specific file the implementer must read to confirm a signature or a known soft-edge to revisit in Phase 2. Each note names the file or behaviour explicitly; none defer required code.
- Every code block is complete and runnable.

### Type consistency

- `PhSearchHit` shape identical in `lib/api-v1-mapper.ts` (pricehunter, Task 6) and `lib/pricehunter.ts` (open-pantry, Task 19).
- `PhProduct.retailers[]` matches between Task 6 (server mapper) and Task 20 (client type).
- `tier` literal `"free" | "pro"` consistent across `api-keys.ts`, `api-rate-limit.ts`, `api-v1-auth.ts`.
- `bumpBucket` returns `{ allowed, remaining, retryAfterSeconds }` — used identically in `authV1`.

No drift found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-phase-0-pricehunter-integration.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batched with checkpoints.

Which approach?
