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

const UPLOADS = "misconduct.co.jp/wordpress/wp-content/uploads/";

type Fetch = (url: string) => Promise<Response>;

export interface WaybackResult {
  games: GameScore[];
  /** ディビジョンごとの取得結果（件数とスナップショット） */
  report: { division: string; count: number; snapshot?: string; note?: string }[];
}

export async function fetchWaybackScores(season: number, fetchImpl: Fetch = fetch): Promise<WaybackResult> {
  const ord = seasonOrdinal(season);

  // シーズンのスコア表をまとめて検索し、ファイルごとに最新のスナップショットを選ぶ
  const cdx =
    "https://web.archive.org/cdx/search/cdx?output=json&filter=statuscode:200&fl=timestamp,original" +
    `&url=${encodeURIComponent(`${UPLOADS}${ord}_score_*`)}`;
  const res = await fetchImpl(cdx);
  if (!res.ok) throw new Error(`CDX 検索に失敗: HTTP ${res.status}`);
  const rows = ((await res.json()) as string[][]).slice(1); // 先頭行は見出し

  const latest = new Map<string, { timestamp: string; original: string }>();
  for (const [timestamp, original] of rows) {
    const slug = original.match(/_score_([a-z0-9]+)\.htm/i)?.[1]?.toLowerCase();
    if (!slug) continue;
    const cur = latest.get(slug);
    if (!cur || timestamp > cur.timestamp) latest.set(slug, { timestamp, original });
  }

  const games: GameScore[] = [];
  const report: WaybackResult["report"] = [];
  for (const { label, slug } of SCORE_DIVISIONS) {
    const snap = latest.get(slug);
    if (!snap) {
      report.push({ division: label, count: 0, note: "アーカイブ無し（このシーズンに無いディビジョンの可能性）" });
      continue;
    }
    // id_ を付けると Wayback のツールバー等を挟まない元のバイト列が返る（Shift-JIS のまま）
    const raw = `https://web.archive.org/web/${snap.timestamp}id_/${snap.original}`;
    const page = await fetchImpl(raw);
    if (!page.ok) {
      report.push({ division: label, count: 0, snapshot: raw, note: `HTTP ${page.status}` });
      continue;
    }
    // 画面の「公式サイトで見る」は、消えた公式ページではなくアーカイブを指す
    const viewUrl = `https://web.archive.org/web/${snap.timestamp}/${snap.original}`;
    const parsed = parseScoresHtml(decodePage(Buffer.from(await page.arrayBuffer())), label, viewUrl, ord);
    games.push(...parsed);
    report.push({ division: label, count: parsed.length, snapshot: raw });
    await new Promise((r) => setTimeout(r, 500)); // アーカイブに負荷をかけない
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
