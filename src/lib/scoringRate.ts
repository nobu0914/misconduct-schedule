// 個人ランクの「得点率」（1試合あたりのゴール・ポイント）と、ディビジョン平均・チーム勝率。クライアントから使う。
//
// ディビジョン平均は「ディビジョンの全ゴール ÷ 全選手の出場試合数の合計」（＝選手1人が1試合で挙げる平均）。
// 出場0試合の選手は分母に入れない。公式に「出場した試合ごとの勝敗」は無いので、勝率は所属チームの勝率。

import { teamKey } from "./teamName";

export interface RatePlayer {
  team: string;
  divisionLabel: string;
  gp: number;
  goals: number;
  points: number;
}

export interface RateStanding {
  team: string;
  divisionLabel: string;
  rank?: number;
  totalTeams?: number;
  gp?: number;
  wins?: number;
  losses?: number;
  ties?: number;
}

export interface Rates {
  goals: number;
  points: number;
}

/** 選手本人の1試合あたり（出場0試合なら undefined） */
export function playerRates(p: RatePlayer): Rates | undefined {
  return p.gp > 0 ? { goals: p.goals / p.gp, points: p.points / p.gp } : undefined;
}

/** ディビジョンの1試合あたり平均（データが無ければ undefined） */
export function divisionRates(players: RatePlayer[], division: string): (Rates & { players: number }) | undefined {
  let gp = 0;
  let goals = 0;
  let points = 0;
  let count = 0;
  for (const p of players) {
    if (p.divisionLabel !== division || p.gp <= 0) continue;
    gp += p.gp;
    goals += p.goals;
    points += p.points;
    count += 1;
  }
  return gp > 0 ? { goals: goals / gp, points: points / gp, players: count } : undefined;
}

/** 1試合あたりの値でのディビジョン内順位（出場1試合以上の選手の中で、同じ値は同順位） */
export function rateRank(
  players: RatePlayer[],
  division: string,
  kind: keyof Rates,
  value: number
): { rank: number; of: number } {
  const rates = players
    .filter((p) => p.divisionLabel === division && p.gp > 0)
    .map((p) => (kind === "goals" ? p.goals : p.points) / p.gp);
  return { rank: 1 + rates.filter((r) => r > value + 1e-9).length, of: rates.length };
}

export interface TeamRecord {
  winRate: number;
  wins: number;
  losses: number;
  ties: number;
  rank?: number;
  totalTeams?: number;
}

/** 所属チームの勝率（引き分けは0.5勝）。順位表に勝敗が無ければ undefined */
export function teamRecord(standings: RateStanding[], team: string, division: string): TeamRecord | undefined {
  const key = teamKey(team);
  const s = standings.find((x) => x.divisionLabel === division && teamKey(x.team) === key);
  if (!s || typeof s.wins !== "number" || !s.gp) return undefined;
  const ties = s.ties ?? 0;
  return {
    winRate: (s.wins + ties * 0.5) / s.gp,
    wins: s.wins,
    losses: s.losses ?? 0,
    ties,
    rank: s.rank,
    totalTeams: s.totalTeams ?? standings.filter((x) => x.divisionLabel === division).length,
  };
}
