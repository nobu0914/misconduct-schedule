import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { generateAnalyticsReport } from "@/lib/analyticsReport";
import { isThrottled } from "@/lib/cronGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 週1回（月曜 7:00 JST）アクセス解析のレポートを作る。AI を使うので、CRON_SECRET が無い環境では
 * 月曜（JST）だけ・3日に1回しか動かない（誰でも叩ける URL のため）。失敗したらロックを外して当日中に再実行できる。
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const jstDay = new Date(Date.now() + 9 * 3600_000).getUTCDay();
  if (!expectedSecret && jstDay !== 1) return NextResponse.json({ skipped: "only on Monday (JST)" });
  if (await isThrottled("analytics-report", 3 * 86400)) return NextResponse.json({ skipped: "recently generated" });
  try {
    const { report } = await generateAnalyticsReport();
    return NextResponse.json({ ok: true, pv: report.week.pv });
  } catch (e) {
    console.error("analytics report cron failed", e);
    await kv.del("cron:lock:analytics-report").catch(() => {});
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 });
  }
}
