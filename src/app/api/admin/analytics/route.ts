import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { EVENT_TYPES, TRACKED_PAGES } from "@/lib/analyticsConstants";
import { verifyAdminPasscode } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const PAGES: readonly string[] = TRACKED_PAGES;

export async function GET(req: NextRequest) {
  const auth = await verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: auth.status });
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

  return NextResponse.json({ days, events, visitors: await visitorStats(dateStrs) });
}

/** 日ごとのハッシュを期間分足し合わせる */
async function sumHashes(prefix: string, dates: string[]): Promise<Record<string, number>> {
  const all = await Promise.all(dates.map((ds) => kv.hgetall<Record<string, number>>(`${prefix}:${ds}`)));
  const merged: Record<string, number> = {};
  for (const h of all) {
    if (!h) continue;
    for (const [k, v] of Object.entries(h)) merged[k] = (merged[k] ?? 0) + Number(v);
  }
  return merged;
}

/** 訪問者・リピート・端末・流入元・時間帯・滞在時間（/api/track で記録したもの） */
async function visitorStats(dateStrs: string[]) {
  const last7 = dateStrs.slice(0, 7);
  const last14 = dateStrs.slice(0, 14);
  const last30 = dateStrs.slice(0, 30);
  // HyperLogLog は複数キーを渡すと「期間内の重複なしの人数」になる
  const unique = (prefix: string, dates: string[]) => {
    const [first, ...rest] = dates.map((ds) => `${prefix}:${ds}`);
    return kv.pfcount(first, ...rest);
  };

  const [uv7, ret7, uv30, ret30, sessionCounts, daily, devices, browsers, referrers, hours, dwell, visitHistogram, since] =
    await Promise.all([
      unique("uv", last7),
      unique("uvret", last7),
      unique("uv", last30),
      unique("uvret", last30),
      kv.mget<(number | null)[]>(...last14.map((ds) => `ss:${ds}`)),
      Promise.all(
        last14.map(async (ds) => ({
          date: ds,
          visitors: await kv.pfcount(`uv:${ds}`),
          returning: await kv.pfcount(`uvret:${ds}`),
        }))
      ),
      sumHashes("dev", last7),
      sumHashes("br", last7),
      sumHashes("ref", last7),
      sumHashes("hr", last7),
      sumHashes("dw", last7),
      kv.hgetall<Record<string, number>>("vhist"),
      kv.get<string>("analytics:since"),
    ]);

  return {
    since: since ?? null,
    uv7,
    returning7: ret7,
    uv30,
    returning30: ret30,
    sessions7: sessionCounts.slice(0, 7).reduce<number>((s, v) => s + (Number(v) || 0), 0),
    daily: daily.map((d, i) => ({ ...d, sessions: Number(sessionCounts[i]) || 0 })),
    devices,
    browsers,
    referrers,
    hours,
    dwellSeconds: dwell,
    visitHistogram: visitHistogram ?? {},
  };
}
