import { NextResponse } from "next/server";
import { isConfigured, searchProducts } from "@/lib/pricehunter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, error: "No API key configured" },
      { status: 400 },
    );
  }

  // searchProducts is graceful-degrade: returns [] on any failure.
  // In Phase 0 we accept "empty array" as a successful round-trip because the
  // search itself reaching the server with a valid key is the meaningful
  // signal. Phase 2 will replace this with a more precise health check that
  // distinguishes "key OK but no results" from "key rejected".
  const hits = await searchProducts("milk", 1);
  return NextResponse.json({ ok: true, sample: hits[0] ?? null });
}
