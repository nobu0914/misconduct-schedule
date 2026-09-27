import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { currentSeasonNumber, seasonOrdinal } from "./schedule";
import { normalizeName } from "./teamName";

export interface TeamStanding {
  rank: number;
  team: string;
  divisionLabel: string;
  points: number;
  gp: number;
  wins: number;
  losses: number;
  ties: number;
  topScorers: number[];
  sourceUrl: string;
  rankChange: number;
}

export interface ParseResult {
  label: string;
  status: number;
  rowCount: number;
  colspan2Cells: string[];
  sectionLog: string[];
  playersByTeamDebug: Record<string, { jersey: number; points: number }[]>;
  standings: TeamStanding[];
  error?: string;
}

const BASE = "https://misconduct.co.jp/wordpress/wp-content/uploads/";

/** ディビジョン表示名 → 順位表のファイル名スラッグ（スコア表とは綴りが違う: Women Gold = wg） */
export const STANDINGS_DIVISIONS: { label: string; slug: string }[] = [
  { label: "Platinum",     slug: "platinum" },
  { label: "Gold",         slug: "gold" },
  { label: "Silver",       slug: "silver" },
  { label: "Bronze",       slug: "bronze" },
  { label: "Brass",        slug: "brass" },
  { label: "Copper",       slug: "copper" },
  { label: "Iron",         slug: "iron" },
  { label: "Women Gold",   slug: "wg" },
  { label: "Women Bronze", slug: "wb" }, // 54thで新設（未公開なら404でスキップ）
  { label: "35&Over",      slug: "35over" },
];

export function buildStandingsSources(season: number): { label: string; url: string }[] {
  const slug = seasonOrdinal(season);
  return STANDINGS_DIVISIONS.map((d) => ({
    label: d.label,
    url: `${BASE}${slug}_standings_${d.slug}.htm`,
  }));
}

/**
 * 指定シーズンの順位表を全ディビジョン分取得する。
 * 順位表は「今の順位」なので複数シーズンを混ぜない（同じディビジョンの行が二重になる）。
 */
export async function fetchSeasonStandings(
  season: number,
  debugMode = false
): Promise<{ season: string; results: ParseResult[] }> {
  const results = await Promise.all(
    buildStandingsSources(season).map(({ label, url }) =>
      fetchAndParseStandings(label, url, debugMode)
    )
  );
  return { season: seasonOrdinal(season), results };
}

/**
 * 進行中シーズンの順位表。前シーズンにはフォールバックしない
 * （チームランキングは「今シーズン」と「過去シーズン（保存済み）」を分けて持つ）。
 * 開幕直後は全ディビジョン空になる。
 */
export async function fetchCurrentStandings(
  debugMode = false,
  now: Date = new Date()
): Promise<{ season: string; results: ParseResult[] }> {
  return fetchSeasonStandings(currentSeasonNumber(now), debugMode);
}

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchAndParseStandings(
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
      next: { revalidate: 86400 }, // ルートのISR(1日)と揃える
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

    type Section = "none" | "team" | "goalie" | "player";
    let section: Section = "none";

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

      if (texts.includes("W") && texts.includes("L") && texts.includes("GP")) {
        section = "team";
        if (debugMode) result.sectionLog.push(`row${result.rowCount}→team: [${texts.join(",")}]`);
        return;
      }
      if (texts.includes("Save%") || texts.includes("SOG")) {
        section = "goalie";
        if (debugMode) result.sectionLog.push(`row${result.rowCount}→goalie: [${texts.join(",")}]`);
        return;
      }
      if (texts.includes("PIM") && !texts.includes("Save%") && !texts.includes("SOG")) {
        section = "player";
        if (debugMode) result.sectionLog.push(`row${result.rowCount}→player: [${texts.join(",")}]`);
        return;
      }

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
          topScorers: [],
          sourceUrl: url,
          rankChange: 0,
        });
        return;
      }

      if (section === "player") {
        if (cellData.length < 5) return;

        const rank = parseInt(cellData[1].text, 10);
        if (isNaN(rank) || rank <= 0 || String(rank) !== cellData[1].text) return;

        const jersey = parseInt(cellData[3].text, 10);
        if (isNaN(jersey) || jersey <= 0) return;

        const teamName = cleanText(cellData[4].text);
        if (!teamName || teamName === "Team") return;

        const pts = parseInt(cellData[8]?.text ?? "", 10);

        if (!playersByTeam[teamName]) playersByTeam[teamName] = [];
        playersByTeam[teamName].push({ jersey, points: isNaN(pts) ? 0 : pts });
      }
    });

    if (debugMode) result.playersByTeamDebug = playersByTeam;

    for (const standing of result.standings) {
      const key = Object.keys(playersByTeam).find(
        (k) => normalizeName(k) === normalizeName(standing.team)
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
