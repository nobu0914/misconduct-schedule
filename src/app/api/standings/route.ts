import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

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

interface ParseResult {
  label: string;
  status: number;
  rowCount: number;
  colspan2Cells: string[];
  standings: TeamStanding[];
  error?: string;
}

async function fetchAndParseStandings(
  divisionLabel: string,
  url: string,
  debugMode: boolean
): Promise<ParseResult> {
  const result: ParseResult = {
    label: divisionLabel,
    status: 0,
    rowCount: 0,
    colspan2Cells: [],
    standings: [],
  };

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    result.status = res.status;
    if (!res.ok) return result;

    const buffer = await res.arrayBuffer();
    const raw = iconv.decode(Buffer.from(buffer), "shift_jis");

    // MHTML 形式（Excel HTML エクスポート）の場合、<html>...</html> 部分のみ抽出
    const htmlMatch = raw.match(/<html[\s\S]*?<\/html>/i);
    const text = htmlMatch ? htmlMatch[0] : raw;

    const $ = cheerio.load(text);

    $("tr").each((_, row) => {
      result.rowCount++;
      const tds = $(row).find("td");
      if (tds.length === 0) return;

      const cellData: Array<{ text: string; colspan: number }> = [];
      tds.each((_, td) => {
        cellData.push({
          text: cleanText($(td).text()),
          colspan: parseInt($(td).attr("colspan") ?? "1", 10),
        });
      });

      // デバッグ: colspan=2 のセルをすべて記録
      if (debugMode) {
        cellData
          .filter((c) => c.colspan === 2)
          .forEach((c) => result.colspan2Cells.push(`[${divisionLabel}] "${c.text}"`));
      }

      const teamCellIdx = cellData.findIndex(
        (c) =>
          c.colspan === 2 &&
          c.text !== "" &&
          c.text !== "Team" &&
          !/^[\d\s\-\+]+$/.test(c.text)
      );
      if (teamCellIdx === -1) return;

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
      if (isNaN(gp)) return;

      result.standings.push({ rank, team: teamName, divisionLabel, points, gp });
    });
  } catch (e) {
    result.error = String(e);
  }

  return result;
}

export async function GET(req: Request): Promise<NextResponse> {
  const debugMode = new URL(req.url).searchParams.has("debug");

  const results = await Promise.all(
    STANDINGS_URLS.map(({ label, url }) =>
      fetchAndParseStandings(label, url, debugMode)
    )
  );

  const allStandings = results.flatMap((r) => r.standings);

  if (debugMode) {
    return NextResponse.json(
      {
        debug: results.map((r) => ({
          label: r.label,
          httpStatus: r.status,
          rowCount: r.rowCount,
          colspan2Cells: r.colspan2Cells,
          found: r.standings.length,
          error: r.error,
        })),
        standings: allStandings,
        lastUpdated: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { standings: allStandings, lastUpdated: new Date().toISOString() } satisfies StandingsData,
    { headers: { "Cache-Control": "no-store" } }
  );
}
