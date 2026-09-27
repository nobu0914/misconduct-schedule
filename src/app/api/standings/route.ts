import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchCurrentStandings, fetchSeasonStandings } from "@/lib/standings";
import type { TeamStanding } from "@/lib/standings";
import { parseSeasonNumber } from "@/lib/season";
import { saveSeasonTeams, toSeasonTeamEntries } from "@/lib/seasonSnapshot";

export type { TeamStanding };

export const revalidate = 86400; // 1日（cronで毎日再生成する）

interface StandingsData {
  standings: TeamStanding[];
  season: string; // 今シーズン（"54th" など）。前シーズンにはフォールバックしない
  pending: boolean;
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

  // シーズン番号付きで保存しておく（公式ページが消えた後の「前シーズン」「過去シーズン」表示に使う）
  const seasonNum = parseSeasonNumber(season);
  if (seasonNum !== undefined) {
    await saveSeasonTeams(seasonNum, toSeasonTeamEntries(allStandings));
    // 今シーズンがまだ空の間は、前シーズンの公式ページが残っていれば取り直して保存を更新する
    // （最終順位を取り逃さないため。表示には使わない）
    if (allStandings.length === 0) {
      const prev = await fetchSeasonStandings(seasonNum - 1);
      await saveSeasonTeams(seasonNum - 1, toSeasonTeamEntries(prev.results.flatMap((r) => r.standings)));
    }
  }

  return NextResponse.json(
    {
      standings: allStandings,
      season,
      // 空なのが想定内（開幕直後で未掲載）であることを cron の0件チェックに伝える
      pending: allStandings.length === 0,
      lastUpdated: new Date().toISOString(),
    } satisfies StandingsData,
    { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } }
  );
}
