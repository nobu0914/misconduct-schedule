import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";
import { ACTIVITY_LOG_KEY, ACTIVITY_LOG_MAX, type ActivityEntry } from "@/lib/analyticsConstants";

// 管理者用: 行動ログ（端末ごとのページ表示・機能の利用、新しい順）。記録は /api/track

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: auth.status });
  try {
    const entries = await kv.lrange<ActivityEntry>(ACTIVITY_LOG_KEY, 0, ACTIVITY_LOG_MAX - 1);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("activity log read failed", e);
    return NextResponse.json({ entries: [], error: "unavailable" }, { status: 503 });
  }
}
