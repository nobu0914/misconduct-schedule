// 過去シーズンの順位表（チーム順位＋個人成績）を Wayback Machine から取り直し、
// src/data/standings-{シーズン}.json と src/data/players-{シーズン}.json に書き出す。
//
// 53rd 以降は取得のたびに KV に保存しているが、52nd は保存の仕組みを入れる前に公式ページが消えており、
// 以前手で復元したデータ（src/lib/pastStandings.ts / prev-season-players の固定データ）は
// Women Bronze が欠けていた。これで全ディビジョンを取り直す。
//
// 使い方（ネットワークに出られる手元のPCで）:
//   npx tsx scripts/fetch-wayback-standings.mts 52
//
// パーサーはサイトと同じ parseStandingsHtml / parsePlayersHtml。

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STANDINGS_DIVISIONS, parseStandingsHtml } from "../src/lib/standings";
import { parsePlayersHtml } from "../src/lib/playerStats";
import { SCORE_DIVISIONS, decodePage } from "../src/lib/scores";
import { seasonOrdinal } from "../src/lib/season";
import { toSeasonTeamEntries, type SeasonPlayerEntry, type SeasonTeamEntry } from "../src/lib/seasonSnapshot";
import { findLatestSnapshots, politePause, type Fetch } from "./wayback.mts";

export interface WaybackStandingsResult {
  teams: SeasonTeamEntry[];
  players: SeasonPlayerEntry[];
  report: { division: string; teams: number; players: number; snapshot?: string; note?: string }[];
}

export async function fetchWaybackStandings(
  season: number,
  fetchImpl: Fetch = fetch
): Promise<WaybackStandingsResult> {
  const ord = seasonOrdinal(season);
  const latest = await findLatestSnapshots(`${ord}_standings_`, fetchImpl);

  // 順位表のファイル名は Women Gold = wg など短い綴り。古いシーズンでスコア表と同じ綴りの可能性もあるので両方見る
  const slugsFor = (label: string) =>
    [
      STANDINGS_DIVISIONS.find((d) => d.label === label)?.slug,
      SCORE_DIVISIONS.find((d) => d.label === label)?.slug,
    ].filter((s): s is string => Boolean(s));

  const standingRows: Parameters<typeof toSeasonTeamEntries>[0] = [];
  const players: SeasonPlayerEntry[] = [];
  const report: WaybackStandingsResult["report"] = [];
  const used = new Set<string>();

  for (const { label } of STANDINGS_DIVISIONS) {
    const slug = slugsFor(label).find((s) => latest.has(s));
    if (!slug) {
      report.push({ division: label, teams: 0, players: 0, note: "アーカイブ無し（このシーズンに無いディビジョンの可能性）" });
      continue;
    }
    used.add(slug);
    const snap = latest.get(slug)!;
    const page = await fetchImpl(snap.raw);
    if (!page.ok) {
      report.push({ division: label, teams: 0, players: 0, snapshot: snap.raw, note: `HTTP ${page.status}` });
      continue;
    }
    const text = decodePage(Buffer.from(await page.arrayBuffer()));
    const { standings } = parseStandingsHtml(text, label, snap.view);
    const divisionPlayers = parsePlayersHtml(text, label, snap.view);
    standingRows.push(...standings);
    players.push(
      ...divisionPlayers.map(({ name, jersey, team, divisionLabel, divisionRank, gp, goals, assists, points, pim }) => ({
        name, jersey, team, divisionLabel, divisionRank, gp, goals, assists, points, pim,
      }))
    );
    report.push({ division: label, teams: standings.length, players: divisionPlayers.length, snapshot: snap.raw });
    await politePause();
  }

  for (const slug of latest.keys()) {
    if (!used.has(slug)) {
      report.push({ division: slug, teams: 0, players: 0, note: "対応するディビジョンが無い（STANDINGS_DIVISIONS に追加が必要かも）" });
    }
  }

  return { teams: toSeasonTeamEntries(standingRows), players, report };
}

async function main() {
  const season = Number(process.argv[2] ?? 52);
  if (!Number.isInteger(season) || season < 1) throw new Error("シーズン番号を指定してください（例: 52）");
  const { teams, players, report } = await fetchWaybackStandings(season);
  for (const r of report) {
    console.log(
      `${r.division.padEnd(14)} チーム${String(r.teams).padStart(3)}  選手${String(r.players).padStart(4)}  ${r.note ?? r.snapshot ?? ""}`
    );
  }
  if (teams.length === 0) throw new Error("チーム順位が1件も取れませんでした。ファイルは書き出していません");
  const ord = seasonOrdinal(season);
  writeFileSync(`src/data/standings-${ord}.json`, JSON.stringify(teams, null, 1) + "\n");
  writeFileSync(`src/data/players-${ord}.json`, JSON.stringify(players, null, 1) + "\n");
  console.log(`\nチーム ${teams.length} 件 → src/data/standings-${ord}.json`);
  console.log(`選手 ${players.length} 件 → src/data/players-${ord}.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
