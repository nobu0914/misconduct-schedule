import { listArchived, loadArchivedByPrefix } from "./archive";
import { parseSeasonNumber, seasonOrdinal } from "./season";
import type { GameScore } from "./scores";
import season52Scores from "@/data/scores-52nd.json";

// 過去シーズンのスコアの読み出し。スコアタブの「過去シーズン」用。
//
// - 53rd 以降: 取得のたびに KV に保存しているもの（`archive:scores:{シーズン}/{ディビジョン}`）
// - 52nd: 公式ページが保存の仕組みを入れる前に消えていたため、Wayback Machine から
//   scripts/fetch-wayback-scores.mts で取り直した固定データ（src/data/scores-52nd.json）

const STATIC_SEASONS: Record<number, GameScore[]> = {
  52: season52Scores as GameScore[],
};

export async function loadPastScores(season: number): Promise<GameScore[]> {
  const archived = await loadArchivedByPrefix<GameScore>("scores", `${seasonOrdinal(season)}/`);
  const games = archived.flatMap((e) => e.items);
  return games.length > 0 ? games : STATIC_SEASONS[season] ?? [];
}

/** 過去シーズン（今シーズンより前）のうち、スコアがあるものを新しい順に */
export async function availablePastScoreSeasons(current: number): Promise<number[]> {
  const set = new Set<number>();
  for (const label of await listArchived("scores")) {
    const n = parseSeasonNumber(label.split("/")[0]);
    if (n !== undefined && n < current) set.add(n);
  }
  for (const [n, games] of Object.entries(STATIC_SEASONS)) {
    if (games.length > 0 && Number(n) < current) set.add(Number(n));
  }
  return Array.from(set).sort((a, b) => b - a);
}
