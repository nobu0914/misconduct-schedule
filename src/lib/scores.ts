import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { currentSeasonNumber, seasonOrdinal, type SourceStatus } from "./schedule";
import { reconcileWithArchive } from "./archive";

export interface GameScore {
  gameNo: number;
  date: string;        // "2026/3/29"
  dayOfWeek: string;   // "Sun"
  timeStart: string;   // "17:30"
  timeEnd: string;     // "18:30"
  awayTeam: string;
  awayScore: number | null;
  homeTeam: string;
  homeScore: number | null;
  divisionLabel: string;
  played: boolean;
  season: string;     // "53rd" / "54th"
  sourceUrl: string;  // 掲載元の公式スコア表URL
}

const BASE = "https://misconduct.co.jp/wordpress/wp-content/uploads/";

/** ディビジョン表示名 → ファイル名スラッグ */
export const SCORE_DIVISIONS: { label: string; slug: string }[] = [
  { label: "Platinum",     slug: "platinum" },
  { label: "Gold",         slug: "gold" },
  { label: "Silver",       slug: "silver" },
  { label: "Bronze",       slug: "bronze" },
  { label: "Brass",        slug: "brass" },
  { label: "Copper",       slug: "copper" },
  { label: "Iron",         slug: "iron" },
  { label: "Women Gold",   slug: "womengold" },
  { label: "Women Bronze", slug: "womenbronze" }, // 54thで新設
  { label: "35&Over",      slug: "35over" },
];

/**
 * スコア表URLを日付から生成する。
 * スケジュールと同じく、進行中シーズンと次シーズンの両方を見る
 * （シーズン切替直後に前シーズンの結果が消えないようにするため）。
 * 存在しないファイルは404でスキップされる。
 */
export function buildScoreSources(
  now: Date = new Date()
): { label: string; season: string; url: string }[] {
  const season = currentSeasonNumber(now);
  const sources: { label: string; season: string; url: string }[] = [];
  for (const s of [season, season + 1]) {
    const slug = seasonOrdinal(s);
    for (const d of SCORE_DIVISIONS) {
      sources.push({ label: d.label, season: slug, url: `${BASE}${slug}_score_${d.slug}.htm` });
    }
  }
  return sources;
}

function cleanText(text: string): string {
  return text.replace(/ /g, " ").replace(/　/g, " ").replace(/\s+/g, " ").trim();
}

const DATE_RE = /^(\d{4}\/\d{1,2}\/\d{1,2})\s+(\S+)$/;

export async function fetchAndParseScores(
  divisionLabel: string,
  url: string,
  season = "",
  opts: { noStore?: boolean } = {}
): Promise<{ games: GameScore[]; source: SourceStatus }> {
  const source: SourceStatus = { label: `${season}/${divisionLabel}`, url, status: 0, count: 0 };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      ...(opts.noStore
        ? { cache: "no-store" as const }
        : { next: { revalidate: 259200 } }), // ルートのISR(3日)と揃える
    });
    source.status = res.status;
    if (!res.ok) {
      // 未公開のシーズン・ディビジョンは404になる
      if (res.status !== 404) source.error = `HTTP ${res.status}`;
      return { games: [], source };
    }

    const buffer = await res.arrayBuffer();
    const buf = Buffer.from(buffer);
    let text: string;
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      text = iconv.decode(buf, "utf-16le");
    } else if (buf[0] === 0xfe && buf[1] === 0xff) {
      text = iconv.decode(buf, "utf-16be");
    } else {
      text = iconv.decode(buf, "shift_jis");
    }

    const $ = cheerio.load(text);
    const games: GameScore[] = [];
    let currentDate = "";
    let currentDay = "";

    $("tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length === 0) return;
      const texts = tds.map((_, td) => cleanText($(td).text())).get() as string[];

      // 日付ヘッダー行: TD[1] が "YYYY/M/D Day"
      const dateMatch = texts[1]?.match(DATE_RE);
      if (dateMatch) {
        currentDate = dateMatch[1];
        currentDay = dateMatch[2];
        return;
      }

      // 試合行: TD[0]=試合番号, TD[1]=開始, TD[3]=終了, TD[4]=away, TD[5]=awayScore, TD[7]=homeScore, TD[8]=home
      if (texts.length < 10) return;
      const gameNo = parseInt(texts[0], 10);
      if (isNaN(gameNo) || gameNo <= 0 || String(gameNo) !== texts[0]) return;
      if (!currentDate) return;

      const timeStart = texts[1];
      const timeEnd = texts[3];
      const awayTeam = texts[4];
      const homeTeam = texts[8];
      if (!awayTeam || !homeTeam) return;

      const awayScoreNum = parseInt(texts[5], 10);
      const homeScoreNum = parseInt(texts[7], 10);
      const awayScore = isNaN(awayScoreNum) ? null : awayScoreNum;
      const homeScore = isNaN(homeScoreNum) ? null : homeScoreNum;

      games.push({
        gameNo,
        date: currentDate,
        dayOfWeek: currentDay,
        timeStart,
        timeEnd,
        awayTeam,
        awayScore,
        homeTeam,
        homeScore,
        divisionLabel,
        played: awayScore !== null && homeScore !== null,
        season,
        sourceUrl: url,
      });
    });

    source.count = games.length;
    return { games, source };
  } catch (e) {
    source.error = e instanceof Error ? e.message : String(e);
    return { games: [], source };
  }
}

/** 全スコア表を取得し、日付の新しい順に並べて返す */
export async function fetchAllScores(
  opts: { noStore?: boolean; now?: Date } = {}
): Promise<{ games: GameScore[]; sources: SourceStatus[] }> {
  const now = opts.now ?? new Date();
  const results = await Promise.all(
    buildScoreSources(now).map(({ label, season, url }) =>
      fetchAndParseScores(label, url, season, opts)
    )
  );
  const perSource = await reconcileWithArchive(
    "scores",
    results.map((r) => ({ items: r.games, source: r.source })),
    undefined,
    opts.noStore === true
  );

  return {
    games: perSource.flat(),
    sources: results.map((r) => r.source),
  };
}
