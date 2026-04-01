import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

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

    let inTeamSection = false;

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

      const texts = cellData.map((c) => c.text);

      // チームスタンディングのヘッダー行（GP と P 列が存在する）
      if (texts.includes("GP") && texts.includes("P")) {
        inTeamSection = true;
        return;
      }

      // ゴーリー・プレイヤーセクション開始で終了
      if (texts.some((t) => t === "Save%" || t === "SOG" || t === "Saves")) {
        inTeamSection = false;
        return;
      }

      if (!inTeamSection) return;

      // colspan=2 のセルをチーム名として検出
      const teamCellIdx = cellData.findIndex(
        (c) =>
          c.colspan === 2 &&
          c.text !== "" &&
          c.text !== "Team" &&
          !/^[\d\-\+]+$/.test(c.text)
      );
      if (teamCellIdx === -1) return;

      // チーム名セルより前の正の整数を順位として取得
      let rank = 0;
      for (let i = 0; i < teamCellIdx; i++) {
        const n = parseInt(cellData[i].text, 10);
        if (!isNaN(n) && n > 0) {
          rank = n;
          break;
        }
      }
      if (rank === 0) return;

      const teamName = cellData[teamCellIdx].text;
      const gp = parseInt(cellData[teamCellIdx + 1]?.text ?? "0", 10);
      const points = parseInt(cellData[teamCellIdx + 2]?.text ?? "0", 10);

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
      const standings = await fetchAndParseStandings(label, url);
      allStandings.push(...standings);
    })
  );

  return NextResponse.json({
    standings: allStandings,
    lastUpdated: new Date().toISOString(),
  });
}
