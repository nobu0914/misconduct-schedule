// 過去シーズンの順位表のうち、保存ページがスコア表より古いディビジョンをスコアから集計し直す。
//
// Wayback Machine の保存時期はページごとにばらばらで、52nd は Copper・Iron・Platinum の順位表が
// シーズン途中の保存しか無かった（例: Iron は45試合中18試合分）。スコア表の方が新しい場合は、
// スコアから勝敗・勝点を数えて順位を付け直す。
//
// 使い方（ネットワーク不要。fetch-wayback-standings.mts / fetch-wayback-scores.mts の後に）:
//   npx tsx scripts/fill-standings-from-scores.mts 52
//
// 勝点は 勝ち2・引き分け1（52nd の順位表で全チーム確認済み）。
// 同じ勝点の並びは 得失点差 → 総得点 の順で決める。公式の決め方は不明なので、同点があれば報告する。

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { GameScore } from "../src/lib/scores";
import type { SeasonTeamEntry } from "../src/lib/seasonSnapshot";
import { seasonOrdinal } from "../src/lib/season";
import { normalizeName } from "../src/lib/teamName";

/** 1ディビジョン分の順位をスコアから集計する。表記は順位表側の綴りを優先する */
export function standingsFromScores(
  games: GameScore[],
  division: string,
  preferredNames: string[] = []
): { entries: SeasonTeamEntry[]; ties: string[][] } {
  const names = new Map(preferredNames.map((n) => [normalizeName(n), n]));
  const rec = new Map<string, { gp: number; w: number; l: number; t: number; gf: number; ga: number }>();
  const get = (team: string) => {
    const key = normalizeName(team);
    if (!names.has(key)) names.set(key, team);
    if (!rec.has(key)) rec.set(key, { gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 });
    return rec.get(key)!;
  };

  for (const g of games) {
    if (g.divisionLabel !== division || !g.played || g.awayScore === null || g.homeScore === null) continue;
    const away = get(g.awayTeam);
    const home = get(g.homeTeam);
    away.gp++; home.gp++;
    away.gf += g.awayScore; away.ga += g.homeScore;
    home.gf += g.homeScore; home.ga += g.awayScore;
    if (g.awayScore > g.homeScore) { away.w++; home.l++; }
    else if (g.awayScore < g.homeScore) { home.w++; away.l++; }
    else { away.t++; home.t++; }
  }

  const rows = [...rec.entries()]
    .map(([key, r]) => ({ team: names.get(key)!, ...r, points: 2 * r.w + r.t, gd: r.gf - r.ga }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);

  // 勝点が並んだ組（得失点差で順位を付けたが、公式の決め方と違う可能性がある）
  const byPoints = new Map<number, string[]>();
  for (const r of rows) byPoints.set(r.points, [...(byPoints.get(r.points) ?? []), r.team]);
  const ties = [...byPoints.values()].filter((teams) => teams.length > 1);

  return {
    entries: rows.map((r, i) => ({
      team: r.team, divisionLabel: division, rank: i + 1, totalTeams: rows.length,
      gp: r.gp, wins: r.w, losses: r.l, ties: r.t, points: r.points,
    })),
    ties,
  };
}

/**
 * 保存ページの順位表とスコアを比べ、スコアの方が多くの試合を含むディビジョンだけ差し替える。
 * 保存ページの方が新しい（スコア表の保存が結果掲載前だった）ディビジョンはそのまま。
 */
export function fillStandingsFromScores(
  standings: SeasonTeamEntry[],
  games: GameScore[]
): { standings: SeasonTeamEntry[]; report: { division: string; standingsGames: number; scoreGames: number; replaced: boolean; ties: string[][] }[] } {
  const divisions = [...new Set([...standings.map((s) => s.divisionLabel), ...games.map((g) => g.divisionLabel)])];
  const out: SeasonTeamEntry[] = [];
  const report = [];
  for (const division of divisions) {
    const current = standings.filter((s) => s.divisionLabel === division);
    const standingsGames = current.reduce((n, s) => n + (s.gp ?? 0), 0) / 2;
    const scoreGames = games.filter((g) => g.divisionLabel === division && g.played).length;
    if (scoreGames > standingsGames) {
      const { entries, ties } = standingsFromScores(games, division, current.map((s) => s.team));
      out.push(...entries);
      report.push({ division, standingsGames, scoreGames, replaced: true, ties });
    } else {
      out.push(...current);
      report.push({ division, standingsGames, scoreGames, replaced: false, ties: [] });
    }
  }
  return { standings: out, report };
}

function main() {
  const season = Number(process.argv[2] ?? 52);
  if (!Number.isInteger(season) || season < 1) throw new Error("シーズン番号を指定してください（例: 52）");
  const ord = seasonOrdinal(season);
  const standingsPath = `src/data/standings-${ord}.json`;
  const standings = JSON.parse(readFileSync(standingsPath, "utf8")) as SeasonTeamEntry[];
  const games = JSON.parse(readFileSync(`src/data/scores-${ord}.json`, "utf8")) as GameScore[];
  if (standings.length === 0 || games.length === 0) throw new Error("順位表かスコアのデータが空です。先に取得スクリプトを実行してください");

  const { standings: filled, report } = fillStandingsFromScores(standings, games);
  for (const r of report) {
    const what = r.replaced ? "スコアから集計" : "保存ページのまま";
    console.log(`${r.division.padEnd(14)} 順位表${String(r.standingsGames).padStart(3)}試合 / スコア${String(r.scoreGames).padStart(3)}試合  ${what}`);
    for (const t of r.ties) console.log(`  勝点が同じ: ${t.join(" / ")}（得失点差で順位付け）`);
  }
  writeFileSync(standingsPath, JSON.stringify(filled, null, 1) + "\n");
  console.log(`\n${standingsPath} を更新しました（${filled.length} チーム）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
