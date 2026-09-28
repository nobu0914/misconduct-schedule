import * as cheerio from "cheerio";

// 順位表ページに載っている個人成績の読み取り。/api/player-stats と
// Wayback Machine から過去シーズンを取り直すスクリプト（scripts/fetch-wayback-standings.mts）で共有する。

export interface PlayerStat {
  name: string;
  jersey: number;
  team: string;
  divisionLabel: string;
  divisionRank: number; // ディビジョン内全体順位
  teamRank: number;     // チーム内順位
  gp: number;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  sourceUrl: string;    // ディビジョンのランキングページURL
}

function cleanText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

/** 順位表ページのHTMLから個人成績を読む（チーム内順位も付ける） */
export function parsePlayersHtml(text: string, divisionLabel: string, url: string): PlayerStat[] {
  const $ = cheerio.load(text);
  type Section = "none" | "goalie" | "player";
  let section: Section = "none";

  type RawPlayer = {
    divisionRank: number;
    name: string;
    jersey: number;
    team: string;
    gp: number;
    goals: number;
    assists: number;
    points: number;
    pim: number;
  };
  const rawPlayers: RawPlayer[] = [];

  $("tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length === 0) return;
    const texts = tds.map((_, td) => cleanText($(td).text())).get() as string[];

    if (texts.includes("Save%") || texts.includes("SOG")) { section = "goalie"; return; }
    if (texts.includes("PIM") && !texts.includes("Save%") && !texts.includes("SOG")) { section = "player"; return; }
    if (section !== "player") return;

    if (texts.length < 9) return;

    const rank = parseInt(texts[1], 10);
    if (isNaN(rank) || rank <= 0 || String(rank) !== texts[1]) return;

    const name = cleanText(texts[2]);
    if (!name || name === "Name" || name === "-") return;

    const jersey = parseInt(texts[3], 10);
    const team = cleanText(texts[4]);
    if (!team || team === "Team") return;

    rawPlayers.push({
      divisionRank: rank,
      name,
      jersey: isNaN(jersey) ? 0 : jersey,
      team,
      gp:      parseInt(texts[5], 10) || 0,
      goals:   parseInt(texts[6], 10) || 0,
      assists: parseInt(texts[7], 10) || 0,
      points:  parseInt(texts[8], 10) || 0,
      pim:     parseInt(texts[9] ?? "", 10) || 0,
    });
  });

  // チーム内ランキングを計算（得点降順）
  const teamGroups: Record<string, RawPlayer[]> = {};
  for (const p of rawPlayers) {
    if (!teamGroups[p.team]) teamGroups[p.team] = [];
    teamGroups[p.team].push(p);
  }
  const teamRankMap = new Map<RawPlayer, number>();
  for (const players of Object.values(teamGroups)) {
    const sorted = [...players].sort((a, b) => b.points - a.points || b.goals - a.goals);
    sorted.forEach((p, i) => teamRankMap.set(p, i + 1));
  }

  return rawPlayers.map((p) => ({
    ...p,
    divisionLabel,
    teamRank: teamRankMap.get(p) ?? 0,
    sourceUrl: url,
  }));
}
