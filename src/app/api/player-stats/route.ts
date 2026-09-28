import { NextResponse } from "next/server";
import { buildStandingsSources } from "@/lib/standings";
import { currentSeasonNumber, seasonOrdinal } from "@/lib/schedule";
import { saveSeasonPlayers } from "@/lib/seasonSnapshot";
import { parsePlayersHtml, type PlayerStat } from "@/lib/playerStats";
import { decodePage } from "@/lib/scores";

export type { PlayerStat };

export const revalidate = 86400; // 1日（cronで毎日再生成する）

// 取得元は順位表ページ（個人成績は順位表の中に載っている）。
// URLは src/lib/standings.ts のシーズン自動判定と共通。読み取りは src/lib/playerStats.ts。

async function fetchDivisionPlayers(divisionLabel: string, url: string): Promise<PlayerStat[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 }, // ルートのISR(1日)と揃える
    });
    if (!res.ok) return [];
    return parsePlayersHtml(decodePage(Buffer.from(await res.arrayBuffer())), divisionLabel, url);
  } catch {
    return [];
  }
}

async function fetchSeasonPlayers(season: number): Promise<PlayerStat[]> {
  const results = await Promise.all(
    buildStandingsSources(season).map(({ label, url }) => fetchDivisionPlayers(label, url))
  );
  return results.flat();
}

function toSnapshot(players: PlayerStat[]) {
  return players.map(({ name, jersey, team, divisionLabel, divisionRank, gp, goals, assists, points, pim }) => ({
    name, jersey, team, divisionLabel, divisionRank, gp, goals, assists, points, pim,
  }));
}

/**
 * 今シーズンの個人成績だけを返す（前シーズンにはフォールバックしない）。
 * 過去シーズンは /api/prev-season-players（保存済み）から別に取る。
 * 開幕直後で今シーズンがまだ空のときは players: [] / pending: true を返す。
 */
export async function GET(): Promise<NextResponse> {
  const season = currentSeasonNumber();
  const players = await fetchSeasonPlayers(season);

  // シーズン番号付きで保存しておく（次シーズンの「過去シーズン」検索・前年比に使う）
  await saveSeasonPlayers(season, toSnapshot(players));

  // 今シーズンがまだ空の間は、前シーズンの公式ページが残っていれば取り直して保存を更新する
  // （最終更新を取り逃さないため。表示には使わない）
  if (players.length === 0) {
    await saveSeasonPlayers(season - 1, toSnapshot(await fetchSeasonPlayers(season - 1)));
  }

  return NextResponse.json({
    players,
    season: seasonOrdinal(season),
    // 空なのが想定内（開幕直後で未掲載）であることを cron の0件チェックに伝える
    pending: players.length === 0,
    lastUpdated: new Date().toISOString(),
  });
}
