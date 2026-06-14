import { NextRequest, NextResponse } from "next/server";
import {
  addShoppingItem,
  updateShoppingItem,
  deleteShoppingItem,
  clearCheckedShoppingItems,
  type ShoppingPatch,
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
  if (name == null || quantity == null || unit == null || note == null) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const id = addShoppingItem({ name, quantity, unit, note });
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

  const patch: ShoppingPatch = {};
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
  if (b.checked !== undefined) {
    if (typeof b.checked !== "boolean")
      return NextResponse.json({ error: "Bad checked" }, { status: 400 });
    patch.checked = b.checked;
  }
  const ok = updateShoppingItem(id, patch);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (req.nextUrl.searchParams.get("clearChecked")) {
    clearCheckedShoppingItems();
    return NextResponse.json({ ok: true });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  deleteShoppingItem(id);
  return NextResponse.json({ ok: true });
}
