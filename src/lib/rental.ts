import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { monthLabel, type SourceStatus } from "./schedule";
import { reconcileWithArchive } from "./archive";

export interface RentalEntry {
  date: string;
  weekday: string;
  timeStart: string;
  timeEnd: string;
  label: string;
  month: string;
  sourceUrl: string;
  isOfficial: boolean; // MHLプログラム枠（青）
}

export interface RentalResult {
  entries: RentalEntry[];
  sources: SourceStatus[];
  fetchedAt: string;
}

const BASE = "https://misconduct.co.jp/wordpress/wp-content/uploads/";

/** 取得間隔（秒）。ルートのISRと内部fetchで同じ値を使う。 */
export const RENTAL_REVALIDATE = 86400; // 1日

// 現在月を基準にした取得ウィンドウ（過去8か月〜先6か月）
const MONTHS_BACK = 8;
const MONTHS_AHEAD = 6;

/**
 * 取得対象URLを日付から自動生成する。
 * rent_YYYYMM.htm は毎月追加されるため、固定リストだと
 * 翌月分が出た時点で「予定なし」になってしまう。
 */
export function buildRentalSources(
  now: Date = new Date()
): { year: number; monthNum: number; label: string; url: string }[] {
  const sources: { year: number; monthNum: number; label: string; url: string }[] = [];
  // サーバーはUTCで動くため JST 基準の年月を起点にする
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  for (let offset = -MONTHS_BACK; offset <= MONTHS_AHEAD; offset++) {
    const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + offset, 1));
    const year = d.getUTCFullYear();
    const monthNum = d.getUTCMonth() + 1;
    const ym = `${year}${String(monthNum).padStart(2, "0")}`;
    sources.push({ year, monthNum, label: ym, url: `${BASE}rent_${ym}.htm` });
  }
  return sources;
}

// CSSから特定背景色のクラス名を抽出
function extractClassesByBackground(css: string, color: string): Set<string> {
  const set = new Set<string>();
  const re = /\.(xl\d+)[^{]*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[2].includes(`background:${color}`)) {
      set.add(m[1]);
    }
  }
  return set;
}

// 列インデックス → 時刻（7:00 始まり、2列 = 1時間）
function colToTime(colIndex: number): string {
  const halfHours = colIndex - 2;
  const totalMinutes = 7 * 60 + halfHours * 30;
  const h = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

export async function fetchAndParseRental(
  source: { year: number; monthNum: number; label: string; url: string },
  opts: { noStore?: boolean; now?: Date } = {}
): Promise<{ entries: RentalEntry[]; source: SourceStatus }> {
  const { year, monthNum, label, url } = source;
  const now = opts.now ?? new Date();
  const entries: RentalEntry[] = [];
  const status: SourceStatus = { label, url, status: 0, count: 0 };

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
      ...(opts.noStore
        ? { cache: "no-store" as const }
        : { next: { revalidate: RENTAL_REVALIDATE } }),
    });
    status.status = res.status;

    if (!res.ok) {
      // 未公開の月は404になるため、404はエラー扱いしない
      if (res.status !== 404) status.error = `HTTP ${res.status}`;
      return { entries, source: status };
    }

    const buffer = await res.arrayBuffer();
    const text = iconv.decode(Buffer.from(buffer), "shift_jis");

    // CSSから黄色（インラインホッケー等）と青（MHL公式）のクラスを抽出
    const styleMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const css = styleMatch ? styleMatch[1] : "";
    const yellowClasses = extractClassesByBackground(css, "yellow");
    const blueClasses = extractClassesByBackground(css, "blue");

    const $ = cheerio.load(text);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $("tr").each((_: number, row: any) => {
      const tds = $(row).find("td");
      if (tds.length < 3) return;

      const firstCell = $(tds[0]).text().replace(/ /g, " ").trim();
      const dayNum = parseInt(firstCell, 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) return;

      const weekdayCell = $(tds[1]).text().replace(/ /g, " ").trim();

      let colPos = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tds.each((_: number, td: any) => {
        const colspan = parseInt($(td).attr("colspan") || "1", 10);
        const cls = ($(td).attr("class") || "").trim();
        const isYellow = yellowClasses.has(cls);
        const isBlue = blueClasses.has(cls);

        if (colPos >= 2 && (isYellow || isBlue)) {
          const cellText = $(td).text().replace(/ /g, " ").trim();
          if (cellText) {
            const timeStart = colToTime(colPos);
            const timeEnd = colToTime(colPos + colspan);
            const date = `${year}/${monthNum}/${dayNum}`;
            entries.push({
              date,
              weekday: weekdayCell,
              timeStart,
              timeEnd,
              label: cellText,
              month: monthLabel(date, now),
              sourceUrl: url,
              isOfficial: isBlue,
            });
          }
        }
        colPos += colspan;
      });
    });

    // 公開直後で予定が0件の月は普通にあるため、0件自体は異常としない
    status.count = entries.length;
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e);
    console.error(`Failed to fetch/parse ${url}:`, e);
  }

  return { entries, source: status };
}

function dateTimeToMs(date: string, time: string): number {
  const [y, m, d] = date.split("/").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

/** 全取得対象を並列に取得し、日時順に整列して返す */
export async function fetchAllRentalEntries(
  opts: { noStore?: boolean; now?: Date } = {}
): Promise<RentalResult> {
  const now = opts.now ?? new Date();
  const results = await Promise.all(
    buildRentalSources(now).map((source) => fetchAndParseRental(source, { ...opts, now }))
  );

  const perSource = await reconcileWithArchive(
    "rental",
    results.map((r) => ({ items: r.entries, source: r.source })),
    (items) => items.map((e) => ({ ...e, month: monthLabel(e.date, now) })),
    opts.noStore === true
  );

  const entries = perSource.flat();
  entries.sort((a, b) => dateTimeToMs(a.date, a.timeStart) - dateTimeToMs(b.date, b.timeStart));

  return {
    entries,
    sources: results.map((r) => r.source),
    fetchedAt: new Date().toISOString(),
  };
}
