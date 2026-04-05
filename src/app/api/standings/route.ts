import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAndParseStandings, STANDINGS_URLS } from "@/lib/standings";
import type { TeamStanding } from "@/lib/standings";

export type { TeamStanding };

export const revalidate = 172800; // 2日（48時間）

interface StandingsData {
  standings: TeamStanding[];
  lastUpdated: string;
}

export async function GET(): Promise<NextResponse> {
  const results = await Promise.all(
    STANDINGS_URLS.map(({ label, url }) =>
      fetchAndParseStandings(label, url, false)
    )
  );

  const allStandings = results.flatMap((r) => r.standings);

  // KV を使って前回のランキングと比較し rankChange を設定
  try {
    const prevSnap = await kv.get<Record<string, number>>("standings:last") ?? {};
    const currentSnap: Record<string, number> = {};
    for (const s of allStandings) {
      const key = `${s.divisionLabel}|${s.team}`;
      currentSnap[key] = s.rank;
      const prev = prevSnap[key];
      if (prev !== undefined) s.rankChange = prev - s.rank;
    }
    await kv.set("standings:last", currentSnap);
  } catch {
    // KV エラーは無視（rankChange=0 のまま返す）
  }

  return NextResponse.json(
    { standings: allStandings, lastUpdated: new Date().toISOString() } satisfies StandingsData,
    { headers: { "Cache-Control": "s-maxage=172800, stale-while-revalidate=86400" } }
  );
}
