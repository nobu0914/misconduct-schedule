import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { buildStandingsSources } from "@/lib/standings";
import { currentSeasonNumber, seasonOrdinal } from "@/lib/schedule";

export const revalidate = 259200; // 3日

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

// 取得元は順位表ページ（個人成績は順位表の中に載っている）。
// URLは src/lib/standings.ts のシーズン自動判定と共通。

function cleanText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchDivisionPlayers(divisionLabel: string, url: string): Promise<PlayerStat[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 259200 }, // ルートのISR(3日)と揃える
    });
    if (!res.ok) return [];

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
  } catch {
    return [];
  }
}

async function fetchSeasonPlayers(season: number): Promise<PlayerStat[]> {
  const results = await Promise.all(
    buildStandingsSources(season).map(({ label, url }) => fetchDivisionPlayers(label, url))
  );
  return results.flat();
}

export async function GET(): Promise<NextResponse> {
  // 順位表と同じく、進行中シーズンが未公開なら前シーズンにフォールバックする
  const season = currentSeasonNumber();
  let used = season;
  let players = await fetchSeasonPlayers(season);
  if (players.length === 0) {
    used = season - 1;
    players = await fetchSeasonPlayers(used);
  }

  return NextResponse.json({
    players,
    season: seasonOrdinal(used),
    lastUpdated: new Date().toISOString(),
  });
}
