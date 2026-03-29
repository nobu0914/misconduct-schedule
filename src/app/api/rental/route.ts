import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

export interface RentalEntry {
  date: string;      // "2026/3/15"
  weekday: string;   // "日"
  timeStart: string; // "11:00"
  timeEnd: string;   // "13:00"
  label: string;     // "インラインホッケー/ボールホッケー/ローラーホッケー" etc
  month: string;     // "3月"
  sourceUrl: string;
}

interface RentalData {
  entries: RentalEntry[];
  lastUpdated: string;
}

// 対象キーワード
const TARGET_KEYWORDS = [
  "インラインホッケー",
  "ボールホッケー",
  "ローラーホッケー",
  "ball hockey",
];

function isTarget(text: string): boolean {
  const lower = text.toLowerCase();
  return TARGET_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

// 列インデックス → 時刻文字列
// 時間ヘッダーは 7〜24 を各 2列（30分刻み）で表現
// 本文データ列の先頭インデックスは 2（0始まり: col0=日, col1=曜日）
function colToTime(colIndex: number): string {
  // colIndex は 0始まりで、2列目から時刻開始
  const halfHours = colIndex - 2; // 0 = 7:00
  const totalMinutes = 7 * 60 + halfHours * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const RENT_URLS: { month: string; year: number; monthNum: number; url: string }[] = [
  { month: "1月", year: 2026, monthNum: 1, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202601.htm" },
  { month: "2月", year: 2026, monthNum: 2, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202602.htm" },
  { month: "3月", year: 2026, monthNum: 3, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202603.htm" },
  { month: "4月", year: 2026, monthNum: 4, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202604.htm" },
  { month: "5月", year: 2026, monthNum: 5, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202605.htm" },
  { month: "6月", year: 2026, monthNum: 6, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202606.htm" },
  { month: "7月", year: 2026, monthNum: 7, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202607.htm" },
  { month: "8月", year: 2026, monthNum: 8, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202608.htm" },
  { month: "9月", year: 2026, monthNum: 9, url: "https://misconduct.co.jp/wordpress/wp-content/uploads/rent_202609.htm" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

async function fetchAndParseRental(
  month: string,
  year: number,
  monthNum: number,
  url: string
): Promise<RentalEntry[]> {
  const entries: RentalEntry[] = [];

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return entries;

    const buffer = await res.arrayBuffer();
    const text = iconv.decode(Buffer.from(buffer), "shift_jis");
    const $ = cheerio.load(text);

    $("tr").each((_: number, row: any) => {
      const tds = $(row).find("td");
      if (tds.length < 3) return;

      // 最初のセルが日付（数字）か確認
      const firstCell = $(tds[0]).text().replace(/\u00a0/g, " ").trim();
      const dayNum = parseInt(firstCell, 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) return;

      // 曜日
      const weekdayCell = $(tds[1]).text().replace(/\u00a0/g, " ").trim();

      // 各セルをcolspanを考慮しながら走査
      let colPos = 0;
      tds.each((_: number, td: any) => {
        const colspan = parseInt($(td).attr("colspan") || "1", 10);
        const cellText = $(td).text().replace(/\u00a0/g, " ").trim();

        if (colPos >= 2 && isTarget(cellText)) {
          const timeStart = colToTime(colPos);
          const timeEnd = colToTime(colPos + colspan);
          const date = `${year}/${monthNum}/${dayNum}`;

          entries.push({
            date,
            weekday: weekdayCell,
            timeStart,
            timeEnd,
            label: cellText,
            month,
            sourceUrl: url,
          });
        }
        colPos += colspan;
      });
    });
  } catch (e) {
    console.error(`Failed to fetch/parse ${url}:`, e);
  }

  return entries;
}

export async function GET(): Promise<NextResponse<RentalData>> {
  const allEntries: RentalEntry[] = [];

  await Promise.all(
    RENT_URLS.map(async ({ month, year, monthNum, url }) => {
      const entries = await fetchAndParseRental(month, year, monthNum, url);
      allEntries.push(...entries);
    })
  );

  allEntries.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.timeStart.localeCompare(b.timeStart);
  });

  return NextResponse.json({
    entries: allEntries,
    lastUpdated: new Date().toISOString(),
  });
}
