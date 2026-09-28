import { NextRequest, NextResponse } from "next/server";
import { currentSeasonNumber } from "@/lib/schedule";
import { availablePastScoreSeasons, loadPastScores } from "@/lib/pastScores";

/** 保存データの最古シーズン。これより前は存在しない */
const OLDEST_SEASON = 52;

/**
 * 過去シーズンのスコア（保存済み）。`?season=52` で指定、省略時は前シーズン。
 * スコアタブの「過去シーズン」表示用。データがある過去シーズンの一覧 `available` も返す。
 * 今シーズンは /api/scores（公式ページから取得）を使う。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const current = currentSeasonNumber();
  const requested = Number(req.nextUrl.searchParams.get("season") ?? current - 1);
  // KVのキーの接頭辞になるので範囲を検証する
  if (!Number.isInteger(requested) || requested < OLDEST_SEASON || requested >= current) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }

  const [games, available] = await Promise.all([
    loadPastScores(requested),
    availablePastScoreSeasons(current),
  ]);
  return NextResponse.json(
    { season: requested, games, available },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=3600" } }
  );
}
