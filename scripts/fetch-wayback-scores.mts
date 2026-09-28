// 過去シーズンのスコア表を Wayback Machine から取り直し、src/data/scores-{シーズン}.json に書き出す。
//
// 公式サイトのスコア表はシーズンが終わると非公開になる。53rd 以降は取得のたびに KV に保存しているが、
// 52nd は保存の仕組みを入れる前に消えていたため、アーカイブから復元する。
//
// 使い方（ネットワークに出られる手元のPCで）:
//   npx tsx scripts/fetch-wayback-scores.mts 52
//
// 各ディビジョンの最新のスナップショット（シーズン終了後＝最終結果）を使う。
// パーサーはサイトと同じ parseScoresHtml なので、書き出した JSON はそのまま /api/past-scores で使える。

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SCORE_DIVISIONS, decodePage, parseScoresHtml, type GameScore } from "../src/lib/scores";
import { seasonOrdinal } from "../src/lib/season";
import { findLatestSnapshots, politePause, type Fetch } from "./wayback.mts";

export interface WaybackResult {
  games: GameScore[];
  /** ディビジョンごとの取得結果（件数とスナップショット） */
  report: { division: string; count: number; snapshot?: string; note?: string }[];
}

export async function fetchWaybackScores(season: number, fetchImpl: Fetch = fetch): Promise<WaybackResult> {
  const ord = seasonOrdinal(season);
  const latest = await findLatestSnapshots(`${ord}_score_`, fetchImpl);

  const games: GameScore[] = [];
  const report: WaybackResult["report"] = [];
  for (const { label, slug } of SCORE_DIVISIONS) {
    const snap = latest.get(slug);
    if (!snap) {
      report.push({ division: label, count: 0, note: "アーカイブ無し（このシーズンに無いディビジョンの可能性）" });
      continue;
    }
    const page = await fetchImpl(snap.raw);
    if (!page.ok) {
      report.push({ division: label, count: 0, snapshot: snap.raw, note: `HTTP ${page.status}` });
      continue;
    }
    // 画面の「公式サイトで見る」は、消えた公式ページではなくアーカイブを指す
    const parsed = parseScoresHtml(decodePage(Buffer.from(await page.arrayBuffer())), label, snap.view, ord);
    games.push(...parsed);
    report.push({ division: label, count: parsed.length, snapshot: snap.raw });
    await politePause();
  }

  const unknown = [...latest.keys()].filter((slug) => !SCORE_DIVISIONS.some((d) => d.slug === slug));
  for (const slug of unknown) report.push({ division: slug, count: 0, note: "対応するディビジョンが無い（SCORE_DIVISIONS に追加が必要かも）" });

  return { games, report };
}

async function main() {
  const season = Number(process.argv[2] ?? 52);
  if (!Number.isInteger(season) || season < 1) throw new Error("シーズン番号を指定してください（例: 52）");
  const { games, report } = await fetchWaybackScores(season);
  for (const r of report) {
    console.log(`${r.division.padEnd(14)} ${String(r.count).padStart(4)}件  ${r.note ?? r.snapshot ?? ""}`);
  }
  if (games.length === 0) throw new Error("1件も取れませんでした。ファイルは書き出していません");
  const out = `src/data/scores-${seasonOrdinal(season)}.json`;
  writeFileSync(out, JSON.stringify(games, null, 1) + "\n");
  console.log(`\n${games.length} 件を ${out} に書き出しました`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
