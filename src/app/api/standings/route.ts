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

// 第53シーズン DIVISION RESULT ページに掲載の standings ファイル
// 未公開ディビジョン（404）は自動スキップされる
const BASE = "https://misconduct.co.jp/wordpress/wp-content/uploads/";
const STANDINGS_URLS: { label: string; url: string }[] = [
  { label: "Platinum",   url: `${BASE}53rd_standings_platinum.htm` },
  { label: "Gold",       url: `${BASE}53rd_standings_gold.htm` },
  { label: "Silver",     url: `${BASE}53rd_standings_silver.htm` },
  { label: "Bronze",     url: `${BASE}53rd_standings_bronze.htm` },
  { label: "Brass",      url: `${BASE}53rd_standings_brass.htm` },
  { label: "Copper",     url: `${BASE}53rd_standings_copper.htm` },
  { label: "Iron",       url: `${BASE}53rd_standings_iron.htm` },
  { label: "Women Gold", url: `${BASE}53rd_standings_wg.htm` },
  { label: "35&Over",    url: `${BASE}53rd_standings_35over.htm` },
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
    const buf = Buffer.from(buffer);

    // BOM を検出してエンコーディングを自動判定
    // Excel HTML は UTF-16 LE (FF FE) で保存されることが多い
    let text: string;
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      text = iconv.decode(buf, "utf-16le");
    } else if (buf[0] === 0xfe && buf[1] === 0xff) {
      text = iconv.decode(buf, "utf-16be");
    } else {
      text = iconv.decode(buf, "shift_jis");
    }

    const $ = cheerio.load(text);

    let inTeamSection = false;

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

      const texts = cellData.map((c) => c.text);

      // チームスタンディングのヘッダー行: W（勝）と L（敗）を含む
      if (texts.includes("W") && texts.includes("L") && texts.includes("GP")) {
        inTeamSection = true;
        return;
      }

      // ゴーリー・プレイヤーセクションに入ったら終了 (PIM や Save% が目印)
      if (texts.includes("Save%") || texts.includes("PIM")) {
        inTeamSection = false;
        return;
      }

      if (!inTeamSection) return;

      // colspan=2 のセルをチーム名として検出（非空・非ヘッダー・非数値）
      const teamCellIdx = cellData.findIndex(
        (c) =>
          c.colspan === 2 &&
          c.text !== "" &&
          c.text !== "Team" &&
          !/^[\d\s\-\+]+$/.test(c.text)
      );
      if (teamCellIdx === -1) return;

      // デバッグ: 検出されたチーム名候補を記録
      if (debugMode) {
        result.colspan2Cells.push(`[${divisionLabel}] "${cellData[teamCellIdx].text}"`);
      }

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
