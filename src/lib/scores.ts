import * as cheerio from "cheerio";
import iconv from "iconv-lite";

export interface GameScore {
  gameNo: number;
  date: string;        // "2026/3/29"
  dayOfWeek: string;   // "Sun"
  timeStart: string;   // "17:30"
  timeEnd: string;     // "18:30"
  awayTeam: string;
  awayScore: number | null;
  homeTeam: string;
  homeScore: number | null;
  divisionLabel: string;
  played: boolean;
}

const BASE = "https://misconduct.co.jp/wordpress/wp-content/uploads/";
export const SCORE_URLS: { label: string; url: string }[] = [
  { label: "Platinum",   url: `${BASE}53rd_score_platinum.htm` },
  { label: "Gold",       url: `${BASE}53rd_score_gold.htm` },
  { label: "Silver",     url: `${BASE}53rd_score_silver.htm` },
  { label: "Bronze",     url: `${BASE}53rd_score_bronze.htm` },
  { label: "Brass",      url: `${BASE}53rd_score_brass.htm` },
  { label: "Copper",     url: `${BASE}53rd_score_copper.htm` },
  { label: "Iron",       url: `${BASE}53rd_score_iron.htm` },
  { label: "Women Gold", url: `${BASE}53rd_score_womengold.htm` },
  { label: "35&Over",    url: `${BASE}53rd_score_35over.htm` },
];

function cleanText(text: string): string {
  return text.replace(/ /g, " ").replace(/　/g, " ").replace(/\s+/g, " ").trim();
}

const DATE_RE = /^(\d{4}\/\d{1,2}\/\d{1,2})\s+(\S+)$/;

export async function fetchAndParseScores(divisionLabel: string, url: string): Promise<GameScore[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 259200 },
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
    const games: GameScore[] = [];
    let currentDate = "";
    let currentDay = "";

    $("tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length === 0) return;
      const texts = tds.map((_, td) => cleanText($(td).text())).get() as string[];

      // 日付ヘッダー行: TD[1] が "YYYY/M/D Day"
      const dateMatch = texts[1]?.match(DATE_RE);
      if (dateMatch) {
        currentDate = dateMatch[1];
        currentDay = dateMatch[2];
        return;
      }

      // 試合行: TD[0]=試合番号, TD[1]=開始, TD[3]=終了, TD[4]=away, TD[5]=awayScore, TD[7]=homeScore, TD[8]=home
      if (texts.length < 10) return;
      const gameNo = parseInt(texts[0], 10);
      if (isNaN(gameNo) || gameNo <= 0 || String(gameNo) !== texts[0]) return;
      if (!currentDate) return;

      const timeStart = texts[1];
      const timeEnd = texts[3];
      const awayTeam = texts[4];
      const homeTeam = texts[8];
      if (!awayTeam || !homeTeam) return;

      const awayScoreNum = parseInt(texts[5], 10);
      const homeScoreNum = parseInt(texts[7], 10);
      const awayScore = isNaN(awayScoreNum) ? null : awayScoreNum;
      const homeScore = isNaN(homeScoreNum) ? null : homeScoreNum;

      games.push({
        gameNo,
        date: currentDate,
        dayOfWeek: currentDay,
        timeStart,
        timeEnd,
        awayTeam,
        awayScore,
        homeTeam,
        homeScore,
        divisionLabel,
        played: awayScore !== null && homeScore !== null,
      });
    });

    return games;
  } catch {
    return [];
  }
}
