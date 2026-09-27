import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchCurrentStandings } from "@/lib/standings";
import type { TeamStanding } from "@/lib/standings";

export type { TeamStanding };

export const revalidate = 86400; // 1日（cronで毎日再生成する）

interface StandingsData {
  standings: TeamStanding[];
  season: string; // 実際に取得できたシーズン（"53rd" など）
  lastUpdated: string;
}

export async function GET(): Promise<NextResponse> {
  const { season, results } = await fetchCurrentStandings(false);
  const allStandings = results.flatMap((r) => r.standings);

  // KV を使って前回のランキングと比較し rankChange を設定
  try {
    // シーズンごとに比較用スナップショットを分ける（シーズン切替で順位変動が壊れないように）
    const snapKey = `standings:last:${season}`;
    const prevSnap = await kv.get<Record<string, number>>(snapKey) ?? {};
    const currentSnap: Record<string, number> = {};
    for (const s of allStandings) {
      const key = `${s.divisionLabel}|${s.team}`;
      currentSnap[key] = s.rank;
      const prev = prevSnap[key];
      if (prev !== undefined) s.rankChange = prev - s.rank;
    }
    await kv.set(snapKey, currentSnap);
  } catch {
    // KV エラーは無視（rankChange=0 のまま返す）
  }

  return NextResponse.json(
    { standings: allStandings, season, lastUpdated: new Date().toISOString() } satisfies StandingsData,
    { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } }
  );
}
