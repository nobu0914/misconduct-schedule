import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

export interface Match {
  no: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  awayTeam: string;
  homeTeam: string;
  division: string;
  month: string;
  sourceUrl: string;
}

interface ScheduleData {
  matches: Match[];
  lastUpdated: string;
}

const SCHEDULE_URLS: { month: string; url: string }[] = [
  {
    month: "3月",
    url: "https://misconduct.co.jp/wordpress/wp-content/uploads/53rd_schedule_march.htm",
  },
  {
    month: "4月",
    url: "https://misconduct.co.jp/wordpress/wp-content/uploads/53rd_schedule_april.htm",
  },
  {
    month: "5月",
    url: "https://misconduct.co.jp/wordpress/wp-content/uploads/53rd_schedule_may.htm",
  },
  {
    month: "6月",
    url: "https://misconduct.co.jp/wordpress/wp-content/uploads/53rd_schedule_june.htm",
  },
  {
    month: "7月",
    url: "https://misconduct.co.jp/wordpress/wp-content/uploads/53rd_schedule_july.htm",
  },
  {
    month: "9月",
    url: "https://misconduct.co.jp/wordpress/wp-content/uploads/53rd_schedule_september.htm",
  },
];

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")  // &nbsp;
    .replace(/\u3000/g, " ")  // 全角スペース
    .replace(/\s+/g, " ")
    .trim();
}

// 行の構造 (10列):
// [0]no  [1]start  [2]〜  [3]end  [4]awayName  [5]awaySub  [6]vs  [7]homeSub  [8]homeName  [9]division
async function fetchAndParseSchedule(
  month: string,
  url: string
): Promise<Match[]> {
  const matches: Match[] = [];

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`HTTP ${res.status} for ${url}`);
      return matches;
    }

    // Shift-JIS でデコード
    const buffer = await res.arrayBuffer();
    const text = iconv.decode(Buffer.from(buffer), "shift_jis");

    const $ = cheerio.load(text);
    let currentDate = "";

    // colspanを展開して論理列配列を返す
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function expandCells(row: any): string[] {
      const result: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $(row).find("td").each((_: number, td: any) => {
        const text = cleanText($(td).text());
        const colspan = parseInt($(td).attr("colspan") || "1", 10);
        for (let i = 0; i < colspan; i++) result.push(text);
      });
      return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $("tr").each((_: number, row: any) => {
      const tds = $(row).find("td");
      if (tds.length === 0) return;

      // colspan展開前のテキスト配列（日付検出用）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawCells = tds.map((_: number, td: any) => cleanText($(td).text())).get() as string[];

      // 日付ヘッダー行: いずれかのセルが "YYYY/M/D" パターンを含む
      const dateCell = rawCells.find((c) => /\d{4}\/\d{1,2}\/\d{1,2}/.test(c));
      if (dateCell) {
        const m = dateCell.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
        if (m) currentDate = m[1];
        return;
      }

      if (!currentDate) return;

      // colspanを展開した論理列で試合行を判定
      // ビジター枠(colspan=3)があっても論理10列になる
      const cells = expandCells(row);

      // 試合行: 論理10列以上 & col[0]が数字 & col[1]が時刻
      if (cells.length < 10) return;
      if (!/^\d+$/.test(cells[0])) return;

      const timeStart = cells[1];
      const timeEnd = cells[3];
      if (!/^\d{1,2}:\d{2}$/.test(timeStart)) return;

      // col[6]="vs"なら通常試合、それ以外(ビジター等)はサブ情報なしとして扱う
      const isNormal = cells[6] === "vs";
      const awaySub = isNormal && cells[5] ? `(${cells[5]})` : "";
      const awayTeam = [cells[4], awaySub].filter(Boolean).join(" ");
      const homeSub = isNormal && cells[7] ? `(${cells[7]})` : "";
      const homeTeam = [cells[8], homeSub].filter(Boolean).join(" ");
      const division = cells[9];

      matches.push({
        no: cells[0],
        date: currentDate,
        timeStart,
        timeEnd,
        awayTeam,
        homeTeam,
        division,
        month,
        sourceUrl: url,
      });
    });
  } catch (e) {
    console.error(`Failed to fetch/parse ${url}:`, e);
  }

  return matches;
}

export async function GET(): Promise<NextResponse<ScheduleData>> {
  const allMatches: Match[] = [];

  await Promise.all(
    SCHEDULE_URLS.map(async ({ month, url }) => {
      const matches = await fetchAndParseSchedule(month, url);
      allMatches.push(...matches);
    })
  );

  allMatches.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.timeStart.localeCompare(b.timeStart);
  });

  return NextResponse.json({
    matches: allMatches,
    lastUpdated: new Date().toISOString(),
  });
}
