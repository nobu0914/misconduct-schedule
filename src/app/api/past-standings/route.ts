import { NextRequest, NextResponse } from "next/server";
import { currentSeasonNumber } from "@/lib/schedule";
import { OLDEST_SEASON, availablePastTeamSeasons, loadSeasonTeams } from "@/lib/pastStandings";

/**
 * 過去シーズンの最終順位（保存済み）。`?season=53` で指定、省略時は前シーズン。
 * チームランキングの「過去シーズン」表示用。データがある過去シーズンの一覧 `available` も返す。
 * 今シーズンは /api/standings（公式ページから取得）を使う。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const current = currentSeasonNumber();
  const requested = Number(req.nextUrl.searchParams.get("season") ?? current - 1);
  // KVのキーになるので範囲を検証する
  if (!Number.isInteger(requested) || requested < OLDEST_SEASON || requested >= current) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }

  const [data, available] = await Promise.all([
    loadSeasonTeams(requested),
    availablePastTeamSeasons(current),
  ]);
  return NextResponse.json(
    { season: requested, data, available },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=3600" } }
  );
}
