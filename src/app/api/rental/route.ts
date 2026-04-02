import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

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

interface RentalData {
  entries: RentalEntry[];
  lastUpdated: string;
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
      next: { revalidate: 259200 },
    });
    if (!res.ok) return entries;

    const buffer = await res.arrayBuffer();
    const text = iconv.decode(Buffer.from(buffer), "shift_jis");

    // CSSから黄色（インラインホッケー等）と青（MHL公式）のクラスを抽出
    const styleMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const css = styleMatch ? styleMatch[1] : "";
    const yellowClasses = extractClassesByBackground(css, "yellow");
    const blueClasses = extractClassesByBackground(css, "blue");

    const $ = cheerio.load(text);

    $("tr").each((_: number, row: any) => {
      const tds = $(row).find("td");
      if (tds.length < 3) return;

      const firstCell = $(tds[0]).text().replace(/\u00a0/g, " ").trim();
      const dayNum = parseInt(firstCell, 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) return;

      const weekdayCell = $(tds[1]).text().replace(/\u00a0/g, " ").trim();

      let colPos = 0;
      tds.each((_: number, td: any) => {
        const colspan = parseInt($(td).attr("colspan") || "1", 10);
        const cls = ($(td).attr("class") || "").trim();
        const isYellow = yellowClasses.has(cls);
        const isBlue = blueClasses.has(cls);

        if (colPos >= 2 && (isYellow || isBlue)) {
          const cellText = $(td).text().replace(/\u00a0/g, " ").trim();
          if (cellText) {
            const timeStart = colToTime(colPos);
            const timeEnd = colToTime(colPos + colspan);
            entries.push({
              date: `${year}/${monthNum}/${dayNum}`,
              weekday: weekdayCell,
              timeStart,
              timeEnd,
              label: cellText,
              month,
              sourceUrl: url,
              isOfficial: isBlue,
            });
          }
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

  function dateTimeToMs(date: string, time: string): number {
    const [y, m, d] = date.split("/").map(Number);
    const [h, min] = time.split(":").map(Number);
    return new Date(y, m - 1, d, h, min).getTime();
  }

  allEntries.sort((a, b) => dateTimeToMs(a.date, a.timeStart) - dateTimeToMs(b.date, b.timeStart));

  return NextResponse.json({
    entries: allEntries,
    lastUpdated: new Date().toISOString(),
  });
}
