// 今シーズン（公式ページ）と保存済みの過去シーズンの、順位表・スコア・個人成績をまとめて読む。
// チーム相性・チーム総評（画面）と、チーム総評の AI（サーバー、origin を渡す）で共有する。

import { parseSeasonNumber } from "./season";
import type { PlayerRow, ScoreRow, StandingRow } from "./matchup";

export interface SeasonData {
  standings: StandingRow[];
  scores: ScoreRow[];
  players: (PlayerRow & { assists?: number })[];
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** 全シーズン分（シーズン番号 → データ）と今シーズンの番号 */
export async function loadAllSeasons(origin = "", init?: RequestInit): Promise<{ data: Record<number, SeasonData>; current?: number }> {
  const [cur, curScores, curPlayers, pastIndex] = await Promise.all([
    getJson<{ standings?: StandingRow[]; season?: string }>(`${origin}/api/standings`, init),
    getJson<{ games?: ScoreRow[] }>(`${origin}/api/scores`, init),
    getJson<{ players?: PlayerRow[] }>(`${origin}/api/player-stats`, init),
    getJson<{ season?: number; data?: StandingRow[]; available?: number[] }>(`${origin}/api/past-standings`, init),
  ]);
  const data: Record<number, SeasonData> = {};
  const current = parseSeasonNumber(cur?.season);
  if (current !== undefined) {
    data[current] = {
      standings: cur?.standings ?? [],
      scores: (curScores?.games ?? []).filter((g) => g.season === cur?.season),
      players: curPlayers?.players ?? [],
    };
  }
  const past = await Promise.all(
    (pastIndex?.available ?? []).map(async (n) => {
      const [st, sc, pl] = await Promise.all([
        n === pastIndex?.season
          ? Promise.resolve(pastIndex)
          : getJson<{ data?: StandingRow[] }>(`${origin}/api/past-standings?season=${n}`, init),
        getJson<{ games?: ScoreRow[] }>(`${origin}/api/past-scores?season=${n}`, init),
        getJson<{ players?: PlayerRow[] }>(`${origin}/api/prev-season-players?season=${n}`, init),
      ]);
      return [n, { standings: st?.data ?? [], scores: sc?.games ?? [], players: pl?.players ?? [] }] as const;
    })
  );
  for (const [n, d] of past) data[n] = d;
  return { data, current };
}

/** 試合が1つでもあるか（開幕直後の今シーズンは出さないため） */
export function hasPlayedGame(d: SeasonData): boolean {
  return d.scores.some((g) => g.awayScore !== null && g.homeScore !== null);
}
