// チーム相性（同ディビジョンの2チーム比較）の集計。クライアントから使うので依存は teamName だけ。
//
// 8軸はすべて「そのシーズン・そのディビジョンの中での相対値」（最高=100、最低=10、全員同じなら55）。
// 直接対決だけは2チーム間の勝点の取り合い（全シーズン通算）。

import { teamKey } from "./teamName";

export interface StandingRow {
  team: string;
  divisionLabel: string;
  rank?: number;
  totalTeams?: number;
  gp?: number;
  wins?: number;
  losses?: number;
  ties?: number;
  points?: number;
}

export interface ScoreRow {
  date: string; // "2026/3/29"
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
  divisionLabel: string;
  season: string; // "53rd"
}

export interface PlayerRow {
  name: string;
  team: string;
  divisionLabel: string;
  goals: number;
  points: number;
  pim: number;
}

export interface TeamSeasonStats {
  key: string;
  team: string;
  rank?: number;
  totalTeams?: number;
  gp: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  /** スコア表から数えた消化試合数（得失点の分母） */
  games: number;
  goalsFor: number;
  goalsAgainst: number;
  /** 1点以上取った選手の数 */
  scorers: number;
  ace?: { name: string; points: number };
  pim: number;
}

function isPlayed(g: ScoreRow): g is ScoreRow & { awayScore: number; homeScore: number } {
  return g.awayScore !== null && g.homeScore !== null;
}

/** ディビジョン内の全チームの成績を、順位表・スコア・個人成績から組み立てる（順位順） */
export function buildDivisionStats(
  division: string,
  standings: StandingRow[],
  scores: ScoreRow[],
  players: PlayerRow[]
): TeamSeasonStats[] {
  const byKey = new Map<string, TeamSeasonStats>();
  const blank = (team: string): TeamSeasonStats => ({
    key: teamKey(team), team, gp: 0, wins: 0, losses: 0, ties: 0, points: 0,
    games: 0, goalsFor: 0, goalsAgainst: 0, scorers: 0, pim: 0,
  });

  for (const s of standings) {
    if (s.divisionLabel !== division) continue;
    const t = blank(s.team);
    t.rank = s.rank;
    t.totalTeams = s.totalTeams;
    t.gp = s.gp ?? 0;
    t.wins = s.wins ?? 0;
    t.losses = s.losses ?? 0;
    t.ties = s.ties ?? 0;
    t.points = s.points ?? 0;
    byKey.set(t.key, t);
  }

  // 得失点はスコア表から。順位表に勝敗が無い（52nd の一部）ときはここで数える
  const fromScores = new Map<string, { w: number; l: number; t: number }>();
  for (const g of scores) {
    if (g.divisionLabel !== division || !isPlayed(g)) continue;
    for (const [team, gf, ga] of [
      [g.awayTeam, g.awayScore, g.homeScore],
      [g.homeTeam, g.homeScore, g.awayScore],
    ] as const) {
      const key = teamKey(team);
      if (!byKey.has(key)) byKey.set(key, blank(team));
      const t = byKey.get(key)!;
      t.games += 1;
      t.goalsFor += gf;
      t.goalsAgainst += ga;
      const r = fromScores.get(key) ?? { w: 0, l: 0, t: 0 };
      if (gf > ga) r.w += 1;
      else if (gf < ga) r.l += 1;
      else r.t += 1;
      fromScores.set(key, r);
    }
  }
  for (const t of byKey.values()) {
    if (t.gp === 0 && t.games > 0) {
      const r = fromScores.get(t.key)!;
      t.gp = t.games;
      t.wins = r.w;
      t.losses = r.l;
      t.ties = r.t;
      t.points = r.w * 2 + r.t;
    }
  }

  for (const p of players) {
    if (p.divisionLabel !== division) continue;
    const t = byKey.get(teamKey(p.team));
    if (!t) continue;
    if (p.goals > 0) t.scorers += 1;
    t.pim += p.pim;
    if (!t.ace || p.points > t.ace.points) t.ace = { name: p.name, points: p.points };
  }

  return [...byKey.values()].sort(
    (a, b) => (a.rank ?? 999) - (b.rank ?? 999) || b.points - a.points || a.team.localeCompare(b.team)
  );
}

export interface HeadToHead {
  games: (ScoreRow & { awayScore: number; homeScore: number })[];
  aWins: number;
  bWins: number;
  ties: number;
  aGoals: number;
  bGoals: number;
}

/** 2チームの直接対決（渡したスコア全部から。シーズン・ディビジョンをまたいでよい）。新しい順 */
export function headToHead(scores: ScoreRow[], aTeam: string, bTeam: string): HeadToHead {
  const a = teamKey(aTeam);
  const b = teamKey(bTeam);
  const result: HeadToHead = { games: [], aWins: 0, bWins: 0, ties: 0, aGoals: 0, bGoals: 0 };
  for (const g of scores) {
    if (!isPlayed(g)) continue;
    const away = teamKey(g.awayTeam);
    const home = teamKey(g.homeTeam);
    let aGoals: number;
    let bGoals: number;
    if (away === a && home === b) [aGoals, bGoals] = [g.awayScore, g.homeScore];
    else if (away === b && home === a) [aGoals, bGoals] = [g.homeScore, g.awayScore];
    else continue;
    result.games.push(g);
    result.aGoals += aGoals;
    result.bGoals += bGoals;
    if (aGoals > bGoals) result.aWins += 1;
    else if (aGoals < bGoals) result.bWins += 1;
    else result.ties += 1;
  }
  result.games.sort((x, y) => dateValue(y.date) - dateValue(x.date));
  return result;
}

function dateValue(date: string): number {
  const [y, m, d] = date.split("/").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export interface RadarAxis {
  key: string;
  label: string;
  /** 0〜100（八角形の半径の割合） */
  a: number;
  b: number;
  rawA: string;
  rawB: string;
  hint: string;
}

type Metric = {
  key: string;
  label: string;
  hint: string;
  /** null = データなし */
  value: (t: TeamSeasonStats) => number | null;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
};

const perGame = (n: number, games: number) => (games > 0 ? n / games : null);

export const METRICS: Metric[] = [
  {
    key: "winRate", label: "勝率", hint: "（勝ち＋引き分け×0.5）÷ 試合数",
    value: (t) => (t.gp > 0 ? (t.wins + t.ties * 0.5) / t.gp : null),
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "attack", label: "FW力", hint: "1試合あたりの得点",
    value: (t) => perGame(t.goalsFor, t.games),
    format: (v) => v.toFixed(1),
  },
  {
    key: "defense", label: "DF力", hint: "1試合あたりの失点（少ないほど高い）",
    value: (t) => perGame(t.goalsAgainst, t.games),
    format: (v) => v.toFixed(1),
    lowerIsBetter: true,
  },
  {
    key: "goalDiff", label: "得失点差", hint: "1試合あたりの得失点差",
    value: (t) => perGame(t.goalsFor - t.goalsAgainst, t.games),
    format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
  },
  {
    key: "depth", label: "得点の層", hint: "1点以上取った選手の数",
    value: (t) => (t.scorers > 0 ? t.scorers : null),
    format: (v) => `${v}人`,
  },
  {
    key: "ace", label: "エース力", hint: "チーム最多ポイントの選手",
    value: (t) => t.ace?.points ?? null,
    format: (v) => `${v}pt`,
  },
  {
    key: "discipline", label: "規律", hint: "1試合あたりのペナルティ時間（少ないほど高い）",
    value: (t) => (t.gp > 0 && t.scorers > 0 ? t.pim / t.gp : null),
    format: (v) => `${v.toFixed(1)}分`,
    lowerIsBetter: true,
  },
];

const FLOOR = 10;
const EVEN = 55;

/** ディビジョン内での相対値（最高=100、最低=10、全員同じなら55、データなし=0） */
function relative(value: number | null, all: number[], lowerIsBetter = false): number {
  if (value === null || all.length === 0) return 0;
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (max === min) return EVEN;
  const ratio = lowerIsBetter ? (max - value) / (max - min) : (value - min) / (max - min);
  return FLOOR + (100 - FLOOR) * ratio;
}

/** 八角形の8軸（7指標＋直接対決） */
export function radarAxes(
  division: TeamSeasonStats[],
  a: TeamSeasonStats,
  b: TeamSeasonStats,
  h2h: HeadToHead
): RadarAxis[] {
  const axes: RadarAxis[] = METRICS.map((m) => {
    const all = division.map(m.value).filter((v): v is number => v !== null);
    const va = m.value(a);
    const vb = m.value(b);
    return {
      key: m.key,
      label: m.label,
      hint: m.hint,
      a: relative(va, all, m.lowerIsBetter),
      b: relative(vb, all, m.lowerIsBetter),
      rawA: va === null ? "—" : m.format(va),
      rawB: vb === null ? "—" : m.format(vb),
    };
  });

  // 直接対決: 勝ち2・引き分け1で勝点を取り合った割合
  const aPts = h2h.aWins * 2 + h2h.ties;
  const bPts = h2h.bWins * 2 + h2h.ties;
  const total = aPts + bPts;
  const record = (w: number, l: number) => `${w}勝${l}敗${h2h.ties}分`;
  axes.push({
    key: "h2h",
    label: "直接対決",
    hint: "直接対決で取った勝点の割合（全シーズン）",
    a: total === 0 ? EVEN : FLOOR + (100 - FLOOR) * (aPts / total),
    b: total === 0 ? EVEN : FLOOR + (100 - FLOOR) * (bPts / total),
    rawA: h2h.games.length ? record(h2h.aWins, h2h.bWins) : "対戦なし",
    rawB: h2h.games.length ? record(h2h.bWins, h2h.aWins) : "対戦なし",
  });
  return axes;
}

/** 差がこれ未満の軸は「互角」とみなす */
export const EVEN_MARGIN = 5;

export function countAdvantages(axes: RadarAxis[]): { a: number; b: number; even: number } {
  let a = 0;
  let b = 0;
  let even = 0;
  for (const x of axes) {
    if (x.a === 0 && x.b === 0) continue;
    if (Math.abs(x.a - x.b) < EVEN_MARGIN) even += 1;
    else if (x.a > x.b) a += 1;
    else b += 1;
  }
  return { a, b, even };
}
