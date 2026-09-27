import { NextResponse } from "next/server";
import { currentSeasonNumber } from "@/lib/schedule";
import { loadSeasonTeams } from "@/lib/pastStandings";
import type { SeasonTeamEntry } from "@/lib/seasonSnapshot";

export type PrevSeasonEntry = SeasonTeamEntry;

export const revalidate = 86400; // 1日（保存データは順位表の取得のたびに更新される）

/**
 * シーズン別の最終順位（保存済み）。進行中・前・前々シーズンの3つを返す。
 *
 * TOP は「表示している試合のシーズン − 1」を選んで前シーズンとして使う。
 * 決め打ちにすると、9月（次シーズンの日程が並ぶ）や開幕後（前シーズンの試合も並ぶ）に、
 * 2シーズン前のデータを「前シーズン」と表示してしまう。
 */
export async function GET(): Promise<NextResponse> {
  const headers = { "Cache-Control": "s-maxage=86400, stale-while-revalidate=43200" };
  const current = currentSeasonNumber();
  const numbers = [current, current - 1, current - 2];
  const loaded = await Promise.all(numbers.map(loadSeasonTeams));

  const seasons: Record<string, PrevSeasonEntry[]> = {};
  numbers.forEach((n, i) => {
    if (loaded[i].length > 0) seasons[String(n)] = loaded[i];
  });

  // season / data は旧クライアント向け（読み込み済みの古い画面がそのまま動くように）
  return NextResponse.json(
    { season: current - 1, data: seasons[String(current - 1)] ?? [], seasons },
    { headers }
  );
}
