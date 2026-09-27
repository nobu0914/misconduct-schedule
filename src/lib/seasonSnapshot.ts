import { kv } from "@vercel/kv";

/**
 * シーズンごとの最終順位・個人成績の保存（KV）。
 *
 * 公式サイトの順位表ページはシーズンが終わると予告なく非公開になる（52nd は消えたため
 * Wayback Machine から復元した）。順位表・個人成績を取得するたびにシーズン番号付きで
 * 保存しておき、次シーズンの「前シーズン」表示や前年比の計算に使う。
 *
 * キーは既存の 52nd データと同じ形式: `season:{N}:data` / `season:{N}:players`
 */

export interface SeasonTeamEntry {
  team: string;
  divisionLabel: string;
  rank: number;
  totalTeams: number;
  // 52nd（Wayback Machine 由来）には無い
  gp?: number;
  wins?: number;
  losses?: number;
  ties?: number;
  points?: number;
}

export interface SeasonPlayerEntry {
  name: string;
  jersey: number;
  team: string;
  divisionLabel: string;
  divisionRank: number;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  pim: number;
}

export function seasonTeamsKey(season: number): string {
  return `season:${season}:data`;
}

export function seasonPlayersKey(season: number): string {
  return `season:${season}:players`;
}

/**
 * ディビジョン単位で差し替える。今回取れなかったディビジョン（ページが先に消えた等）は
 * 前回保存分を残す。全体を丸ごと上書きすると、一部のページが消えた日に残りのデータまで失う。
 */
export function mergeByDivision<T extends { divisionLabel: string }>(saved: T[], fresh: T[]): T[] {
  const freshDivisions = new Set(fresh.map((x) => x.divisionLabel));
  return [...saved.filter((x) => !freshDivisions.has(x.divisionLabel)), ...fresh];
}

async function saveMerged<T extends { divisionLabel: string }>(key: string, fresh: T[]): Promise<void> {
  if (fresh.length === 0) return; // 空で上書きしない
  try {
    const saved = (await kv.get<T[]>(key)) ?? [];
    await kv.set(key, mergeByDivision(saved, fresh));
  } catch (e) {
    console.error(`season snapshot save failed (${key}):`, e);
  }
}

export async function saveSeasonTeams(season: number, entries: SeasonTeamEntry[]): Promise<void> {
  await saveMerged(seasonTeamsKey(season), entries);
}

export async function saveSeasonPlayers(season: number, players: SeasonPlayerEntry[]): Promise<void> {
  await saveMerged(seasonPlayersKey(season), players);
}

/** 保存データがあるシーズンだけを返す（中身は読まない） */
export async function seasonsWithSnapshot(keys: { season: number; key: string }[]): Promise<number[]> {
  try {
    const found = await Promise.all(keys.map(({ key }) => kv.exists(key)));
    return keys.filter((_, i) => found[i] > 0).map((k) => k.season);
  } catch {
    return [];
  }
}

export async function loadSeasonSnapshot<T>(key: string): Promise<T[]> {
  try {
    return (await kv.get<T[]>(key)) ?? [];
  } catch {
    return [];
  }
}

/** 順位表の行から保存用の形に変換（ディビジョン内のチーム数を付ける） */
export function toSeasonTeamEntries(
  standings: {
    team: string; divisionLabel: string; rank: number;
    gp: number; wins: number; losses: number; ties: number; points: number;
  }[]
): SeasonTeamEntry[] {
  const totals: Record<string, number> = {};
  for (const s of standings) totals[s.divisionLabel] = (totals[s.divisionLabel] ?? 0) + 1;
  return standings.map((s) => ({
    team: s.team,
    divisionLabel: s.divisionLabel,
    rank: s.rank,
    totalTeams: totals[s.divisionLabel],
    gp: s.gp,
    wins: s.wins,
    losses: s.losses,
    ties: s.ties,
    points: s.points,
  }));
}
