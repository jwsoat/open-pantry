import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";
import { invalidateConfigCache } from "@/lib/pricehunter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_URL_LEN = 500;
const MAX_KEY_LEN = 200;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { baseUrl?: unknown; apiKey?: unknown }
    | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (typeof body.baseUrl !== "string" || typeof body.apiKey !== "string") {
    return NextResponse.json(
      { error: "baseUrl and apiKey must be strings" },
      { status: 400 },
    );
  }

  const baseUrl = body.baseUrl.trim().replace(/\/+$/, ""); // strip trailing slashes
  const apiKey = body.apiKey.trim();

  if (baseUrl.length > MAX_URL_LEN || apiKey.length > MAX_KEY_LEN) {
    return NextResponse.json({ error: "Too long" }, { status: 400 });
  }

  // Empty values are allowed — they reset the config back to "not configured",
  // which is how self-hosters opt out of Pricehunter entirely.
  setSetting("pricehunter.base_url", baseUrl);
  setSetting("pricehunter.api_key", apiKey);
  invalidateConfigCache();

  return NextResponse.json({ ok: true });
}
