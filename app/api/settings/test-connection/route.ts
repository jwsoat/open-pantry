import { NextResponse } from "next/server";
import { pingPricehunter } from "@/lib/pricehunter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const r = await pingPricehunter();
  if (!r.ok) {
    // status null = no config or network failure → 400 (client-fixable)
    // status 401/403/404 = bad config → 400
    // status 5xx → 502 (Pricehunter side issue, not the user's)
    const httpStatus = r.status != null && r.status >= 500 ? 502 : 400;
    return NextResponse.json(
      { ok: false, error: r.error, status: r.status },
      { status: httpStatus },
    );
  }
  return NextResponse.json({ ok: true, sample: r.sample ?? null });
}
