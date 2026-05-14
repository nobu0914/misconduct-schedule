import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGES = ["/", "/player-ranking", "/rental", "/events", "/contact", "/disclaimer", "/changelog"];
const EVENT_TYPES = ["search", "card", "rank-search"];

export async function GET(req: NextRequest) {
  const passcode = req.headers.get("x-admin-passcode");
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected || !passcode || passcode.toUpperCase() !== expected.toUpperCase()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const dateStrs: string[] = [];
  for (let i = 0; i < 180; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateStrs.push(d.toISOString().slice(0, 10));
  }

  // 全日付のtotalを一括取得
  const totalKeys = dateStrs.map((ds) => `pv:${ds}:total`);
  const totals = await kv.mget<(number | null)[]>(...totalKeys);

  // データがある日だけページ別を取得
  const activeDates = dateStrs.filter((_, i) => (totals[i] ?? 0) > 0);

  // ページ別PVを並列で一括取得
  const allPageKeys = activeDates.flatMap((ds) => PAGES.map((p) => `pv:${ds}:${p}`));
  const allPageValues = allPageKeys.length > 0
    ? await kv.mget<(number | null)[]>(...allPageKeys)
    : [];

  const days: { date: string; total: number; pages: Record<string, number> }[] = [];
  let offset = 0;
  for (const ds of activeDates) {
    const idx = dateStrs.indexOf(ds);
    const pages: Record<string, number> = {};
    for (let j = 0; j < PAGES.length; j++) {
      const v = allPageValues[offset + j] ?? 0;
      if (v > 0) pages[PAGES[j]] = v;
    }
    offset += PAGES.length;
    days.push({ date: ds, total: (totals[idx] as number) ?? 0, pages });
  }

  // イベントデータ（過去7日分を並列取得）
  const events: Record<string, Record<string, number>> = {};
  const eventPromises = EVENT_TYPES.map(async (ev) => {
    const merged: Record<string, number> = {};
    const results = await Promise.all(
      dateStrs.slice(0, 7).map((ds) => kv.hgetall<Record<string, number>>(`ev:${ds}:${ev}`))
    );
    for (const data of results) {
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          merged[k] = (merged[k] ?? 0) + v;
        }
      }
    }
    if (Object.keys(merged).length > 0) events[ev] = merged;
  });
  await Promise.all(eventPromises);

  return NextResponse.json({ days, events });
}
