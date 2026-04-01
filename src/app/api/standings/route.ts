import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

// キャッシュを無効化して常に最新データを返す
export const dynamic = "force-dynamic";

export interface TeamStanding {
  rank: number;
  team: string;
  divisionLabel: string;
  points: number;
  gp: number;
}

interface StandingsData {
  standings: TeamStanding[];
  lastUpdated: string;
}

// standings ページのリンクを直接参照
// MHL が新シーズンのファイルに差し替えたら URL を更新すること
const STANDINGS_URLS: { label: string; url: string }[] = [
  { label: "Gold",     url: "https://misconduct.co.jp/wordpress/wp-content/uploads/2025-3rd-gold.htm" },
  { label: "Silver",   url: "https://misconduct.co.jp/wordpress/wp-content/uploads/2025-3rd-silver.htm" },
  { label: "Bronze-A", url: "https://misconduct.co.jp/wordpress/wp-content/uploads/2025-3rd-bronze-a.htm" },
  { label: "Bronze-B", url: "https://misconduct.co.jp/wordpress/wp-content/uploads/2025-3rd-bronze-b.htm" },
  { label: "Kid's",    url: "https://misconduct.co.jp/wordpress/wp-content/uploads/2025-3rd-kids.htm" },
];

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAndParseStandings(
  divisionLabel: string,
  url: string
): Promise<TeamStanding[]> {
  const standings: TeamStanding[] = [];

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return standings;

    const buffer = await res.arrayBuffer();
    const text = iconv.decode(Buffer.from(buffer), "shift_jis");
    const $ = cheerio.load(text);

    $("tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length === 0) return;

      const cellData: Array<{ text: string; colspan: number }> = [];
      tds.each((_, td) => {
        cellData.push({
          text: cleanText($(td).text()),
          colspan: parseInt($(td).attr("colspan") ?? "1", 10),
        });
      });

      // colspan=2 のセルを探す（チーム名セル）
      // 非空・非ヘッダー・非数値であること
      const teamCellIdx = cellData.findIndex(
        (c) =>
          c.colspan === 2 &&
          c.text !== "" &&
          c.text !== "Team" &&
          !/^[\d\s\-\+]+$/.test(c.text)
      );
      if (teamCellIdx === -1) return;

      // チーム名セルより前のセルから順位（整数）を探す
      let rank = 0;
      for (let i = 0; i < teamCellIdx; i++) {
        const n = parseInt(cellData[i].text, 10);
        if (!isNaN(n) && n > 0 && String(n) === cellData[i].text) {
          rank = n;
          break;
        }
      }
      if (rank === 0) return;

      const teamName = cellData[teamCellIdx].text;
      const gp = parseInt(cellData[teamCellIdx + 1]?.text ?? "", 10);
      const points = parseInt(cellData[teamCellIdx + 2]?.text ?? "", 10);

      // GP が数値でない場合は不正な行として除外
      if (isNaN(gp)) return;

      standings.push({ rank, team: teamName, divisionLabel, points, gp });
    });
  } catch (e) {
    console.error(`Failed to parse standings for ${divisionLabel} (${url}):`, e);
  }

  return standings;
}

export async function GET(): Promise<NextResponse<StandingsData>> {
  const allStandings: TeamStanding[] = [];

  await Promise.all(
    STANDINGS_URLS.map(async ({ label, url }) => {
      const s = await fetchAndParseStandings(label, url);
      allStandings.push(...s);
    })
  );

  return NextResponse.json(
    { standings: allStandings, lastUpdated: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
