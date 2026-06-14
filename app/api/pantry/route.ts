import { NextRequest, NextResponse } from "next/server";
import {
  addPantryItem,
  updatePantryItem,
  deletePantryItem,
  isPantryLocation,
  type PantryPatch,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 200;

function asName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 || t.length > MAX_TEXT ? null : t;
}
function asOptText(v: unknown): string | null {
  if (v == null) return "";
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > MAX_TEXT ? null : t;
}
function asQuantity(v: unknown): number | null {
  if (v == null) return 1;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
}
function asExpiry(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? undefined : v;
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = asName(b.name);
  const quantity = asQuantity(b.quantity);
  const unit = asOptText(b.unit);
  const note = asOptText(b.note);
  const expiryDate = asExpiry(b.expiryDate);
  const location = b.location == null ? "pantry" : b.location;
  if (
    name == null ||
    quantity == null ||
    unit == null ||
    note == null ||
    expiryDate === undefined ||
    !isPantryLocation(location)
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const id = addPantryItem({ name, quantity, unit, location, expiryDate, note });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const patch: PantryPatch = {};
  if (b.name !== undefined) {
    const v = asName(b.name);
    if (v == null) return NextResponse.json({ error: "Bad name" }, { status: 400 });
    patch.name = v;
  }
  if (b.quantity !== undefined) {
    const v = asQuantity(b.quantity);
    if (v == null) return NextResponse.json({ error: "Bad quantity" }, { status: 400 });
    patch.quantity = v;
  }
  if (b.unit !== undefined) {
    const v = asOptText(b.unit);
    if (v == null) return NextResponse.json({ error: "Bad unit" }, { status: 400 });
    patch.unit = v;
  }
  if (b.note !== undefined) {
    const v = asOptText(b.note);
    if (v == null) return NextResponse.json({ error: "Bad note" }, { status: 400 });
    patch.note = v;
  }
  if (b.location !== undefined) {
    if (!isPantryLocation(b.location))
      return NextResponse.json({ error: "Bad location" }, { status: 400 });
    patch.location = b.location;
  }
  if (b.expiryDate !== undefined) {
    const v = asExpiry(b.expiryDate);
    if (v === undefined) return NextResponse.json({ error: "Bad expiry" }, { status: 400 });
    patch.expiryDate = v;
  }
  const ok = updatePantryItem(id, patch);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  deletePantryItem(id);
  return NextResponse.json({ ok: true });
}
