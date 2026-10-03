// 個人ランクの詳細スタッツ（1試合あたりの率・ディビジョン内での位置・チームへの貢献）。クライアントから使う。
//
// 公式の個人成績にあるのは GP・G・A・P・PIM だけ。そこに順位表（チームの試合数・勝敗）と
// スコア表（チームの総得点）を組み合わせて出せるものを出す。
// - ディビジョン平均は「ディビジョン全体の合計 ÷ 全選手の出場試合数の合計」（選手1人が1試合で挙げる平均）
// - 順位・上位%・偏差値は、そのディビジョンで出場1試合以上の選手の中で
// - 公式に「個人が出場した試合ごとの結果」は無いので、勝率は所属チームの勝率（引き分けは0.5勝）

import { normalizeName, teamKey } from "./teamName";

export interface RatePlayer {
  name: string;
  team: string;
  divisionLabel: string;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  pim: number;
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

export interface RateGame {
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
  divisionLabel: string;
}

/** 1シーズン分の材料 */
export interface SeasonContext {
  players: RatePlayer[];
  standings?: RateStanding[];
  /** そのシーズンのスコア（チームの総得点に使う） */
  games?: RateGame[];
}

export type RateKind = "goals" | "assists" | "points" | "pim";

export interface Ranked {
  value: number;
  rank: number;
  of: number;
  /** ディビジョン平均 */
  avg: number;
}

export interface TeamRecord {
  winRate: number;
  wins: number;
  losses: number;
  ties: number;
  rank?: number;
  totalTeams?: number;
}

export interface PlayerProfile {
  team: string;
  gp: number;
  goals: Ranked;
  assists: Ranked;
  points: Ranked;
  /** 少ないほど上位 */
  pim: Ranked;
  /** ポイント/試合 ÷ ディビジョン平均 */
  pointsVsAvg?: number;
  goalsVsAvg?: number;
  /** ポイント/試合での上位%（1〜100） */
  topPercent: number;
  /** ポイント/試合の偏差値（全員同じなら50） */
  deviation: number;
  teamGoals?: { total: number; from: "scores" | "players" };
  /** 本人のポイント ÷ チーム総得点 */
  involvement?: number;
  /** 本人のゴール ÷ チーム総得点 */
  goalShare?: number;
  teamGames?: number;
  /** 本人の GP ÷ チームの試合数（1を超えたら1） */
  attendance?: number;
  style?: "ゴール型" | "アシスト型" | "バランス型";
  teamRecord?: TeamRecord;
}

const per = (p: RatePlayer, kind: RateKind) => p[kind] / p.gp;

function ranked(division: RatePlayer[], me: RatePlayer, kind: RateKind, lowerIsBetter = false): Ranked {
  const value = per(me, kind);
  const values = division.map((p) => per(p, kind));
  const better = values.filter((v) => (lowerIsBetter ? v < value - 1e-9 : v > value + 1e-9)).length;
  const totalGp = division.reduce((s, p) => s + p.gp, 0);
  const avg = division.reduce((s, p) => s + p[kind], 0) / totalGp;
  return { value, rank: better + 1, of: values.length, avg };
}

/** そのシーズン・ディビジョンでの本人（名前の表記ゆれは吸収） */
export function findPlayer(players: RatePlayer[], name: string, division: string): RatePlayer | undefined {
  const key = normalizeName(name);
  return players.find((p) => p.divisionLabel === division && normalizeName(p.name) === key);
}

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

/** チームの総得点。スコア表があればそこから、無ければ所属選手のゴールの合計 */
function teamGoals(ctx: SeasonContext, team: string, division: string): PlayerProfile["teamGoals"] {
  const key = teamKey(team);
  const games = (ctx.games ?? []).filter(
    (g) => g.divisionLabel === division && g.awayScore !== null && g.homeScore !== null
  );
  let total = 0;
  let found = false;
  for (const g of games) {
    if (teamKey(g.awayTeam) === key) [total, found] = [total + g.awayScore!, true];
    else if (teamKey(g.homeTeam) === key) [total, found] = [total + g.homeScore!, true];
  }
  if (found) return { total, from: "scores" };
  const fromPlayers = ctx.players
    .filter((p) => p.divisionLabel === division && teamKey(p.team) === key)
    .reduce((s, p) => s + p.goals, 0);
  return fromPlayers > 0 ? { total: fromPlayers, from: "players" } : undefined;
}

function styleOf(p: RatePlayer): PlayerProfile["style"] {
  if (p.points === 0) return undefined;
  const g = p.goals / p.points;
  return g >= 0.6 ? "ゴール型" : g <= 0.4 ? "アシスト型" : "バランス型";
}

/** 本人の詳細スタッツ（出場0試合・見つからなければ undefined） */
export function playerProfile(ctx: SeasonContext, name: string, division: string): PlayerProfile | undefined {
  const me = findPlayer(ctx.players, name, division);
  if (!me || me.gp <= 0) return undefined;
  const div = ctx.players.filter((p) => p.divisionLabel === division && p.gp > 0);

  const points = ranked(div, me, "points");
  const goals = ranked(div, me, "goals");
  const ppg = div.map((p) => per(p, "points"));
  const mean = ppg.reduce((s, v) => s + v, 0) / ppg.length;
  const sd = Math.sqrt(ppg.reduce((s, v) => s + (v - mean) ** 2, 0) / ppg.length);

  const tg = teamGoals(ctx, me.team, division);
  const standing = ctx.standings?.find((s) => s.divisionLabel === division && teamKey(s.team) === teamKey(me.team));
  const teamGames =
    standing?.gp ||
    Math.max(0, ...ctx.players.filter((p) => p.divisionLabel === division && teamKey(p.team) === teamKey(me.team)).map((p) => p.gp)) ||
    undefined;

  return {
    team: me.team,
    gp: me.gp,
    goals,
    assists: ranked(div, me, "assists"),
    points,
    pim: ranked(div, me, "pim", true),
    pointsVsAvg: points.avg > 0 ? points.value / points.avg : undefined,
    goalsVsAvg: goals.avg > 0 ? goals.value / goals.avg : undefined,
    topPercent: Math.max(1, Math.ceil((points.rank / points.of) * 100)),
    deviation: sd > 0 ? 50 + (10 * (points.value - mean)) / sd : 50,
    teamGoals: tg,
    involvement: tg && tg.total > 0 ? Math.min(1, me.points / tg.total) : undefined,
    goalShare: tg && tg.total > 0 ? Math.min(1, me.goals / tg.total) : undefined,
    teamGames,
    attendance: teamGames ? Math.min(1, me.gp / teamGames) : undefined,
    style: styleOf(me),
    teamRecord: ctx.standings ? teamRecord(ctx.standings, me.team, division) : undefined,
  };
}

export interface MultiDivisionTotal {
  divisions: { division: string; team: string }[];
  gp: number;
  goals: number;
  assists: number;
  points: number;
  pim: number;
}

/** 同じ名前の選手が複数のディビジョンに出ていれば、その合計（1つだけなら undefined） */
export function multiDivisionTotal(players: RatePlayer[], name: string): MultiDivisionTotal | undefined {
  const key = normalizeName(name);
  const mine = players.filter((p) => normalizeName(p.name) === key);
  if (new Set(mine.map((p) => p.divisionLabel)).size < 2) return undefined;
  const sum = (k: RateKind | "gp") => mine.reduce((s, p) => s + p[k], 0);
  return {
    divisions: mine.map((p) => ({ division: p.divisionLabel, team: p.team })),
    gp: sum("gp"),
    goals: sum("goals"),
    assists: sum("assists"),
    points: sum("points"),
    pim: sum("pim"),
  };
}
