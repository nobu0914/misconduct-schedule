import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

export const revalidate = 259200; // 3日（72時間）

export interface TeamStanding {
  rank: number;
  team: string;
  divisionLabel: string;
  points: number;
  gp: number;
  wins: number;
  losses: number;
  ties: number;
  topScorers: number[]; // 得点上位3名の背番号
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
  sectionLog: string[];
  playersByTeamDebug: Record<string, { jersey: number; points: number }[]>;
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
    sectionLog: [],
    playersByTeamDebug: {},
    standings: [],
  };

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 259200 },
    });
    result.status = res.status;
    if (!res.ok) return result;

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

    // セクションフラグ
    type Section = "none" | "team" | "goalie" | "player";
    let section: Section = "none";

    // チームごとの選手データ（プレイヤーセクションで収集）
    const playersByTeam: Record<string, { jersey: number; points: number }[]> = {};

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

      // ─── セクション判定 ───
      // チームセクション: W・L・GP を含むヘッダー
      if (texts.includes("W") && texts.includes("L") && texts.includes("GP")) {
        section = "team";
        if (debugMode) result.sectionLog.push(`row${result.rowCount}→team: [${texts.join(",")}]`);
        return;
      }
      // ゴーリーセクション: Save% または SOG を含むヘッダー
      if (texts.includes("Save%") || texts.includes("SOG")) {
        section = "goalie";
        if (debugMode) result.sectionLog.push(`row${result.rowCount}→goalie: [${texts.join(",")}]`);
        return;
      }
      // プレイヤーセクション: PIM を含むがSave%・SOGを含まないヘッダー
      if (texts.includes("PIM") && !texts.includes("Save%") && !texts.includes("SOG")) {
        section = "player";
        if (debugMode) result.sectionLog.push(`row${result.rowCount}→player: [${texts.join(",")}]`);
        return;
      }

      // ─── チームセクション解析 ───
      if (section === "team") {
        const teamCellIdx = cellData.findIndex(
          (c) =>
            c.colspan === 2 &&
            c.text !== "" &&
            c.text !== "Team" &&
            !/^[\d\s\-\+]+$/.test(c.text)
        );
        if (teamCellIdx === -1) return;

        if (debugMode) {
          result.colspan2Cells.push(`[${divisionLabel}] "${cellData[teamCellIdx].text}"`);
        }

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
        const gp     = parseInt(cellData[teamCellIdx + 1]?.text ?? "", 10);
        const points = parseInt(cellData[teamCellIdx + 2]?.text ?? "", 10);
        const wins   = parseInt(cellData[teamCellIdx + 3]?.text ?? "", 10);
        const losses = parseInt(cellData[teamCellIdx + 4]?.text ?? "", 10);
        const ties   = parseInt(cellData[teamCellIdx + 5]?.text ?? "", 10);
        if (isNaN(gp)) return;

        result.standings.push({
          rank, team: teamName, divisionLabel,
          points, gp,
          wins:   isNaN(wins)   ? 0 : wins,
          losses: isNaN(losses) ? 0 : losses,
          ties:   isNaN(ties)   ? 0 : ties,
          topScorers: [], // 後で埋める
        });
        return;
      }

      // ─── プレイヤーセクション解析 ───
      // 行構造（raw td）: [0]Rank [1]Name [2]# [3]Team [4]GP [5]G [6]A [7]P [8]PIM
      // Name・Team は colspan=2 の場合もあるが raw td インデックスは同じ
      if (section === "player") {
        if (cellData.length < 4) return;

        const rank = parseInt(cellData[0].text, 10);
        if (isNaN(rank) || rank <= 0 || String(rank) !== cellData[0].text) return;

        const jersey = parseInt(cellData[2].text, 10);
        if (isNaN(jersey) || jersey <= 0) return;

        const teamName = cleanText(cellData[3].text);
        if (!teamName || teamName === "Team") return;

        // P列（得点）: [0]Rank [1]Name [2]# [3]Team [4]GP [5]G [6]A [7]P [8]PIM
        const pts = parseInt(cellData[7]?.text ?? "", 10);

        if (!playersByTeam[teamName]) playersByTeam[teamName] = [];
        playersByTeam[teamName].push({ jersey, points: isNaN(pts) ? 0 : pts });
      }
    });

    // デバッグ用にプレイヤーデータを記録
    if (debugMode) result.playersByTeamDebug = playersByTeam;

    // 各チームの topScorers を設定（チーム内得点順上位3名・大文字小文字を無視して照合）
    for (const standing of result.standings) {
      const key = Object.keys(playersByTeam).find(
        (k) => k.toLowerCase() === standing.team.toLowerCase()
      );
      standing.topScorers = key
        ? [...playersByTeam[key]]
            .sort((a, b) => b.points - a.points)
            .slice(0, 3)
            .map((p) => p.jersey)
        : [];
    }

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
    return NextResponse.json({
      debug: results.map((r) => ({
        label: r.label,
        httpStatus: r.status,
        rowCount: r.rowCount,
        colspan2Cells: r.colspan2Cells,
        sectionLog: r.sectionLog,
        playersByTeam: r.playersByTeamDebug,
        found: r.standings.length,
        error: r.error,
      })),
      standings: allStandings,
      lastUpdated: new Date().toISOString(),
    });
  }

  return NextResponse.json(
    { standings: allStandings, lastUpdated: new Date().toISOString() } satisfies StandingsData
  );
}
