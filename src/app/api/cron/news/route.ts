import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { isThrottled } from "@/lib/cronGuard";
import { generateNews } from "@/lib/newsStore";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * 週1回（金曜 7:00 JST）リーグニュースを作る。AI を使うので、CRON_SECRET が無い環境では
 * 金曜（JST）だけ・3日に1回しか動かないようにする（誰でも叩ける URL で、料金がかさんだり
 * 水曜に叩かれて金曜の本番が飛ばされたりしないように）。
 */
export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const jstDay = new Date(Date.now() + 9 * 3600_000).getUTCDay();
  if (!expectedSecret && jstDay !== 5) return NextResponse.json({ skipped: "only on Friday (JST)" });
  if (await isThrottled("news", 3 * 86400)) {
    return NextResponse.json({ skipped: "recently generated" });
  }
  try {
    const { edition } = await generateNews(new URL(request.url).origin);
    return NextResponse.json({ ok: true, items: edition.items.length });
  } catch (e) {
    console.error("league news cron failed", e);
    // 失敗したら同じ日のうちに再実行できるよう、3日間のロックを外す
    await kv.del("cron:lock:news").catch(() => {});
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 });
  }
}
