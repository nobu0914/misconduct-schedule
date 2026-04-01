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

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchStandingsLinks(): Promise<{ label: string; url: string }[]> {
  try {
    const res = await fetch("https://misconduct.co.jp/standings/", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return [];

    const text = await res.text();
    const $ = cheerio.load(text);
    const links: { label: string; url: string }[] = [];

    $("a[href*='wp-content/uploads']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (href.toLowerCase().endsWith(".htm") || href.toLowerCase().endsWith(".html")) {
        const label = cleanText($(el).text());
        if (label) links.push({ label, url: href });
      }
    });

    return links;
  } catch (e) {
    console.error("Failed to fetch standings links:", e);
    return [];
  }
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

      // チームスタンディングのヘッダー行を検出（GP と P 列が存在する）
      if (texts.includes("GP") && texts.includes("P")) {
        inTeamSection = true;
        return;
      }

      // ゴーリーセクション開始で終了
      if (texts.some((t) => t === "Save%" || t === "SOG" || t === "Saves")) {
        inTeamSection = false;
        return;
      }

      if (!inTeamSection) return;

      // colspan=2 のセルをチーム名セルとして検出
      const teamCellIdx = cellData.findIndex(
        (c) =>
          c.colspan === 2 &&
          c.text !== "" &&
          c.text !== "Team" &&
          !/^[\d\-\+]+$/.test(c.text)
      );
      if (teamCellIdx === -1) return;

      // チーム名セルより前の数値セルを順位として取得
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
      // colspan=2 なので次のセルは実際の次のtd要素
      const gp = parseInt(cellData[teamCellIdx + 1]?.text ?? "0", 10);
      const points = parseInt(cellData[teamCellIdx + 2]?.text ?? "0", 10);

      standings.push({
        rank,
        team: teamName,
        divisionLabel,
        points,
        gp,
      });
    });
  } catch (e) {
    console.error(`Failed to parse standings for ${divisionLabel} (${url}):`, e);
  }

  return standings;
}

export async function GET(): Promise<NextResponse<StandingsData>> {
  const links = await fetchStandingsLinks();

  const allStandings: TeamStanding[] = [];

  await Promise.all(
    links.map(async ({ label, url }) => {
      const standings = await fetchAndParseStandings(label, url);
      allStandings.push(...standings);
    })
  );

  return NextResponse.json({
    standings: allStandings,
    lastUpdated: new Date().toISOString(),
  });
}
