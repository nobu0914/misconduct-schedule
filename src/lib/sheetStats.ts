// アップロードされたスコア表を、チームごとに集計する（データ → チーム の「スコア表から分かること」）。
// クライアントからも使うので依存は scoreSheet / teamName / schedule の純粋な関数だけ。
//
// - 同じ試合（日付・試合番号・ディビジョンが同じ）が何枚もあれば、最後に保存・修正されたものだけ数える
// - コンテニューコードは外に出さない

import { analyzeGame, goalSituations, parseClock, sheetId, type ScoreSheet, type Side } from "./scoreSheet";
import { teamKey } from "./teamName";

/** 1チーム・1試合の行 */
export interface SheetGameRow {
  season: number;
  date: string;
  gameNo: string;
  division: string;
  team: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  /** [前半, 後半, OT] */
  forByHalf: [number, number, number];
  againstByHalf: [number, number, number];
  shots: number | null;
  shotsAgainst: number | null;
  saves: number | null;
  ppGoals: number;
  shGoals: number;
  /** 相手の PP で取られた点 */
  ppAgainst: number;
  pim: number;
  scoredFirst: boolean;
  /** 先に取られた */
  concededFirst: boolean;
  result: "W" | "L" | "T";
  comeback: boolean;
  /** 5分ごとの得点・失点（前半0〜15分の4つ＋後半4つ） */
  bandsFor: number[];
  bandsAgainst: number[];
}

/** シーズン番号（10月開幕〜翌9月。schedule.ts の currentSeasonNumber と同じ数え方） */
export function seasonOfDate(date: string): number | undefined {
  const m = date.match(/^(\d{4})\/(\d{1,2})\//);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // 54th = 2026年10月開幕
  return 54 + (mo >= 10 ? y : y - 1) - 2026;
}

function bands(s: ScoreSheet, side: Side): number[] {
  const out = Array(8).fill(0);
  for (const g of s.goals) {
    if (g.side !== side || g.half === 3) continue;
    const sec = parseClock(g.time);
    if (sec === null) continue;
    const i = Math.min(3, Math.floor(sec / 300)) + (g.half === 2 ? 4 : 0);
    out[i] += 1;
  }
  return out;
}

/** 1枚のスコア表から、両チームの行を作る（日付・ディビジョン・チーム名が無ければ作らない） */
export function rowsOfSheet(s: ScoreSheet): SheetGameRow[] {
  const season = seasonOfDate(s.date);
  if (season === undefined || !s.division || !s.visitor.name || !s.home.name) return [];
  const a = analyzeGame(s);
  const sit = goalSituations(s);
  return (["visitor", "home"] as Side[]).map((side) => {
    const x = a[side];
    const opp: Side = side === "visitor" ? "home" : "visitor";
    return {
      season,
      date: s.date,
      gameNo: s.gameNo,
      division: s.division,
      team: x.team,
      opponent: x.opponent,
      goalsFor: x.goalsFor,
      goalsAgainst: x.goalsAgainst,
      forByHalf: [...x.byHalf.for] as [number, number, number],
      againstByHalf: [...x.byHalf.against] as [number, number, number],
      shots: x.shots,
      shotsAgainst: x.shotsAgainst,
      saves: x.goalie.saves,
      ppGoals: x.powerPlayGoals,
      shGoals: x.shortHandedGoals,
      ppAgainst: sit.filter((v, i) => v === "PP" && s.goals[i].side === opp).length,
      pim: x.penaltyMinutes,
      scoredFirst: x.scoredFirst,
      concededFirst: s.goals.length > 0 && !x.scoredFirst,
      result: x.result,
      comeback: x.comeback,
      bandsFor: bands(s, side),
      bandsAgainst: bands(s, opp),
    };
  });
}

/** 同じ試合は最後に保存・修正されたものだけにして、全試合の行を作る */
export function rowsOfSheets(sheets: ScoreSheet[]): SheetGameRow[] {
  const latest = new Map<string, ScoreSheet>();
  const stamp = (s: ScoreSheet) => s.editedAt ?? s.savedAt ?? "";
  for (const s of sheets) {
    const id = sheetId(s);
    if (!id) continue;
    const cur = latest.get(id);
    if (!cur || stamp(s) > stamp(cur)) latest.set(id, s);
  }
  return [...latest.values()].flatMap(rowsOfSheet);
}

export interface SheetTeamSummary {
  team: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  forByHalf: [number, number, number];
  againstByHalf: [number, number, number];
  /** 失点のうち後半に取られた割合（0〜1）。失点0なら null */
  secondHalfAgainstShare: number | null;
  secondHalfForShare: number | null;
  /** 1試合あたりの後半失点 */
  secondHalfAgainstPerGame: number;
  shootingPct: number | null;
  savePct: number | null;
  ppGoals: number;
  shGoals: number;
  ppAgainst: number;
  pimPerGame: number;
  /** 先制した試合 / そのうち勝ち、先に取られた試合 / そのうち勝ち */
  scoredFirst: { games: number; wins: number };
  concededFirst: { games: number; wins: number };
  comebacks: number;
  bandsFor: number[];
  bandsAgainst: number[];
}

/** 行（同じチーム）をまとめる */
export function summarize(rows: SheetGameRow[]): SheetTeamSummary | undefined {
  if (!rows.length) return undefined;
  const sum = (f: (r: SheetGameRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const half = (f: (r: SheetGameRow) => number[]) => [0, 1, 2].map((i) => sum((r) => f(r)[i])) as [number, number, number];
  const forByHalf = half((r) => r.forByHalf);
  const againstByHalf = half((r) => r.againstByHalf);
  const ga = sum((r) => r.goalsAgainst);
  const gf = sum((r) => r.goalsFor);
  const withShots = rows.filter((r) => r.shots !== null);
  const withSaves = rows.filter((r) => r.shotsAgainst !== null && r.saves !== null);
  const shots = withShots.reduce((n, r) => n + (r.shots ?? 0), 0);
  const faced = withSaves.reduce((n, r) => n + (r.shotsAgainst ?? 0), 0);
  const first = rows.filter((r) => r.scoredFirst);
  const behind = rows.filter((r) => r.concededFirst);
  return {
    team: rows[0].team,
    games: rows.length,
    wins: rows.filter((r) => r.result === "W").length,
    losses: rows.filter((r) => r.result === "L").length,
    ties: rows.filter((r) => r.result === "T").length,
    goalsFor: gf,
    goalsAgainst: ga,
    forByHalf,
    againstByHalf,
    secondHalfAgainstShare: ga > 0 ? againstByHalf[1] / ga : null,
    secondHalfForShare: gf > 0 ? forByHalf[1] / gf : null,
    secondHalfAgainstPerGame: againstByHalf[1] / rows.length,
    shootingPct: shots > 0 ? withShots.reduce((n, r) => n + r.goalsFor, 0) / shots : null,
    savePct: faced > 0 ? withSaves.reduce((n, r) => n + (r.saves ?? 0), 0) / faced : null,
    ppGoals: sum((r) => r.ppGoals),
    shGoals: sum((r) => r.shGoals),
    ppAgainst: sum((r) => r.ppAgainst),
    pimPerGame: sum((r) => r.pim) / rows.length,
    scoredFirst: { games: first.length, wins: first.filter((r) => r.result === "W").length },
    concededFirst: { games: behind.length, wins: behind.filter((r) => r.result === "W").length },
    comebacks: rows.filter((r) => r.comeback).length,
    bandsFor: Array.from({ length: 8 }, (_, i) => sum((r) => r.bandsFor[i])),
    bandsAgainst: Array.from({ length: 8 }, (_, i) => sum((r) => r.bandsAgainst[i])),
  };
}

/** あるディビジョンの行を、チーム（teamKey）ごとに分ける。season を渡せばそのシーズンだけ */
export function rowsByTeam(rows: SheetGameRow[], division: string, season?: number): Map<string, SheetGameRow[]> {
  const out = new Map<string, SheetGameRow[]>();
  for (const r of rows) {
    if (r.division !== division || (season !== undefined && r.season !== season)) continue;
    const k = teamKey(r.team);
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  for (const list of out.values()) list.sort((a, b) => b.date.localeCompare(a.date, "ja", { numeric: true }));
  return out;
}

/** AI の材料にする1チームのスコア表の通算（アップロードされた試合だけなので、試合数を必ず添える） */
export function sheetSummaryText(sum: SheetTeamSummary | undefined): string {
  if (!sum) return "";
  const p = (v: number | null) => (v === null ? "不明" : `${Math.round(v * 100)}%`);
  return [
    `スコア表（アップロードされた ${sum.games} 試合だけ。公式の全試合ではない）: ${sum.wins}勝${sum.losses}敗${sum.ties}分 得点 ${sum.goalsFor} 失点 ${sum.goalsAgainst}`,
    `前半 得点${sum.forByHalf[0]} 失点${sum.againstByHalf[0]} / 後半 得点${sum.forByHalf[1]} 失点${sum.againstByHalf[1]} / 後半失点率 ${p(sum.secondHalfAgainstShare)} / 後半得点率 ${p(sum.secondHalfForShare)}`,
    `先制した試合 ${sum.scoredFirst.wins}勝/${sum.scoredFirst.games}試合 / 先に取られた試合 ${sum.concededFirst.wins}勝/${sum.concededFirst.games}試合 / 逆転勝ち ${sum.comebacks}`,
    `決定率 ${p(sum.shootingPct)} / セーブ率 ${p(sum.savePct)} / PP得点 ${sum.ppGoals} / SH得点 ${sum.shGoals} / 相手のPPで失点 ${sum.ppAgainst} / 反則 1試合 ${sum.pimPerGame.toFixed(1)}分`,
    `5分ごとの失点（前半0-5,5-10,10-15,15-20,後半0-5,5-10,10-15,15-20）: ${sum.bandsAgainst.join(",")} / 得点: ${sum.bandsFor.join(",")}`,
  ].join("\n");
}

/** サーバー: あるシーズン・ディビジョン・チームのスコア表の通算（AI の材料） */
export function teamSheetSummary(rows: SheetGameRow[], season: number, division: string, team: string): SheetTeamSummary | undefined {
  return summarize(rowsByTeam(rows, division, season).get(teamKey(team)) ?? []);
}
