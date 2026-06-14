// Pure, client-safe helpers shared by the UI. No DB / node imports here so they
// can be used inside "use client" components.

export const PANTRY_LOCATIONS = ["pantry", "fridge", "freezer", "other"] as const;
export type PantryLocation = (typeof PANTRY_LOCATIONS)[number];

export const LOCATION_LABEL: Record<PantryLocation, string> = {
  pantry: "Pantry",
  fridge: "Fridge",
  freezer: "Freezer",
  other: "Other",
};

export function isPantryLocation(v: unknown): v is PantryLocation {
  return typeof v === "string" && (PANTRY_LOCATIONS as readonly string[]).includes(v);
}

export type ExpiryKind = "expired" | "today" | "soon" | "week" | "ok" | "none";

export interface ExpiryStatus {
  kind: ExpiryKind;
  /** Whole days until expiry; negative if past. Null when undated. */
  days: number | null;
  label: string;
}

function daysUntil(dateStr: string, now: Date): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** Classify expiry into the buckets the dashboard colour-codes. */
export function expiryStatus(expiryDate: string | null, now: Date = new Date()): ExpiryStatus {
  if (!expiryDate) return { kind: "none", days: null, label: "No expiry" };
  const days = daysUntil(expiryDate, now);
  if (days < 0) {
    const ago = Math.abs(days);
    return { kind: "expired", days, label: `Expired ${ago} day${ago === 1 ? "" : "s"} ago` };
  }
  if (days === 0) return { kind: "today", days, label: "Expires today" };
  if (days <= 3) return { kind: "soon", days, label: `${days} day${days === 1 ? "" : "s"} left` };
  if (days <= 7) return { kind: "week", days, label: `${days} days left` };
  return { kind: "ok", days, label: `${days} days left` };
}

/** CSS class for each expiry bucket's badge (see app/globals.css). */
export const EXPIRY_BADGE_CLASS: Record<ExpiryKind, string> = {
  expired: "badge badge-expired",
  today: "badge badge-expired",
  soon: "badge badge-soon",
  week: "badge badge-week",
  ok: "badge badge-ok",
  none: "badge badge-none",
};

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
