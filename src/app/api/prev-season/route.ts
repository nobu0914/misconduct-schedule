import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export interface PrevSeasonEntry {
  team: string;
  divisionLabel: string;
  rank: number;
  totalTeams: number;
}

const KV_KEY = "season:52:data";

// 52ndシーズン確定データ（Wayback Machine より取得・KVにバックアップ）
// 出典: https://web.archive.org/web/2025-2026/
//       https://misconduct.co.jp/wordpress/wp-content/uploads/52nd_standings_*.htm
const SEASON_52_DATA: PrevSeasonEntry[] = [
  // Platinum (3チーム)
  { team: "かんだ食堂",        divisionLabel: "Platinum", rank: 1,  totalTeams: 3 },
  { team: "Flying Penguins",   divisionLabel: "Platinum", rank: 2,  totalTeams: 3 },
  { team: "EUROSPORT MAVIN",   divisionLabel: "Platinum", rank: 3,  totalTeams: 3 },

  // Gold (3チーム)
  { team: "SONIDO",            divisionLabel: "Gold", rank: 1, totalTeams: 3 },
  { team: "DROP HAMMER",       divisionLabel: "Gold", rank: 2, totalTeams: 3 },
  { team: "Primo Terra",       divisionLabel: "Gold", rank: 3, totalTeams: 3 },

  // Silver (7チーム)
  { team: "Flying Penguins Silver", divisionLabel: "Silver", rank: 1, totalTeams: 7 },
  { team: "STIGA Silver",           divisionLabel: "Silver", rank: 2, totalTeams: 7 },
  { team: "SYGMA",                  divisionLabel: "Silver", rank: 3, totalTeams: 7 },
  { team: "ダイナモ 2nd",           divisionLabel: "Silver", rank: 4, totalTeams: 7 },
  { team: "ダイナモ",               divisionLabel: "Silver", rank: 5, totalTeams: 7 },
  { team: "名無しBoyz Starz",       divisionLabel: "Silver", rank: 6, totalTeams: 7 },
  { team: "NRK",                    divisionLabel: "Silver", rank: 7, totalTeams: 7 },

  // Bronze (10チーム)
  { team: "STIGA Bronze",      divisionLabel: "Bronze", rank: 1,  totalTeams: 10 },
  { team: "WHITE WOLF",        divisionLabel: "Bronze", rank: 2,  totalTeams: 10 },
  { team: "日体大DREAMS",      divisionLabel: "Bronze", rank: 3,  totalTeams: 10 },
  { team: "Millennium Falcons",divisionLabel: "Bronze", rank: 4,  totalTeams: 10 },
  { team: "RASTAS",            divisionLabel: "Bronze", rank: 5,  totalTeams: 10 },
  { team: "名無しBoyzⅡ",      divisionLabel: "Bronze", rank: 6,  totalTeams: 10 },
  { team: "Dark sales",        divisionLabel: "Bronze", rank: 7,  totalTeams: 10 },
  { team: "サイコペッカーズ",  divisionLabel: "Bronze", rank: 8,  totalTeams: 10 },
  // rank 9: 文字化けにより不明
  { team: "noboundarys",       divisionLabel: "Bronze", rank: 10, totalTeams: 10 },

  // Brass (11チーム)
  { team: "サイコ",            divisionLabel: "Brass", rank: 1,  totalTeams: 11 },
  { team: "Evolving Discus",   divisionLabel: "Brass", rank: 2,  totalTeams: 11 },
  { team: "Team Apples",       divisionLabel: "Brass", rank: 3,  totalTeams: 11 },
  { team: "WSJ",               divisionLabel: "Brass", rank: 4,  totalTeams: 11 },
  { team: "Abouters",          divisionLabel: "Brass", rank: 5,  totalTeams: 11 },
  { team: "EarlyBird",         divisionLabel: "Brass", rank: 6,  totalTeams: 11 },
  { team: "team TOKO",         divisionLabel: "Brass", rank: 7,  totalTeams: 11 },
  { team: "風神雷神",          divisionLabel: "Brass", rank: 8,  totalTeams: 11 },
  { team: "Individuals Brass", divisionLabel: "Brass", rank: 9,  totalTeams: 11 },
  { team: "NASDAQ",            divisionLabel: "Brass", rank: 10, totalTeams: 11 },
  { team: "名無しBoyz",        divisionLabel: "Brass", rank: 11, totalTeams: 11 },

  // Copper (11チーム)
  { team: "ブックレインズ",      divisionLabel: "Copper", rank: 1,  totalTeams: 11 },
  { team: "伊王島観光協会",      divisionLabel: "Copper", rank: 2,  totalTeams: 11 },
  { team: "MASSIVE ATTACK",      divisionLabel: "Copper", rank: 3,  totalTeams: 11 },
  { team: "NWC",                 divisionLabel: "Copper", rank: 4,  totalTeams: 11 },
  { team: "HCNK Copper",         divisionLabel: "Copper", rank: 5,  totalTeams: 11 },
  { team: "change-zero",         divisionLabel: "Copper", rank: 6,  totalTeams: 11 },
  { team: "Discus One",          divisionLabel: "Copper", rank: 7,  totalTeams: 11 },
  { team: "Prairie Dogs",        divisionLabel: "Copper", rank: 8,  totalTeams: 11 },
  { team: "ドラッカーズ",        divisionLabel: "Copper", rank: 9,  totalTeams: 11 },
  { team: "Individuals Copper",  divisionLabel: "Copper", rank: 10, totalTeams: 11 },
  { team: "日体大DREAMS Copper", divisionLabel: "Copper", rank: 11, totalTeams: 11 },

  // Iron (9チーム)
  { team: "風神雷神 Iron",    divisionLabel: "Iron", rank: 1, totalTeams: 9 },
  { team: "サイコスクエア",   divisionLabel: "Iron", rank: 2, totalTeams: 9 },
  { team: "Over50's",         divisionLabel: "Iron", rank: 3, totalTeams: 9 },
  { team: "HCNK",             divisionLabel: "Iron", rank: 4, totalTeams: 9 },
  { team: "Flying Joke",      divisionLabel: "Iron", rank: 5, totalTeams: 9 },
  { team: "BigGate",          divisionLabel: "Iron", rank: 6, totalTeams: 9 },
  { team: "Individuals Iron", divisionLabel: "Iron", rank: 7, totalTeams: 9 },
  { team: "ブルーフラグス",   divisionLabel: "Iron", rank: 8, totalTeams: 9 },
  { team: "青学 Quzilax",     divisionLabel: "Iron", rank: 9, totalTeams: 9 },

  // Women Gold (4チーム)
  { team: "Team SONIC",       divisionLabel: "Women Gold", rank: 1, totalTeams: 4 },
  { team: "Peanuts",          divisionLabel: "Women Gold", rank: 2, totalTeams: 4 },
  { team: "日体大DREAMS WG",  divisionLabel: "Women Gold", rank: 3, totalTeams: 4 },
  { team: "WeLLs",            divisionLabel: "Women Gold", rank: 4, totalTeams: 4 },

  // 35&Over (5チーム) ※最終確定スナップショット 2026/02/15
  { team: "Flying Penguins 35",    divisionLabel: "35&Over", rank: 1, totalTeams: 5 },
  { team: "武田園",                divisionLabel: "35&Over", rank: 2, totalTeams: 5 },
  { team: "STIGA 35",              divisionLabel: "35&Over", rank: 3, totalTeams: 5 },
  { team: "たたかえ！！ホイジンガー", divisionLabel: "35&Over", rank: 4, totalTeams: 5 },
  { team: "Individuals 35",        divisionLabel: "35&Over", rank: 5, totalTeams: 5 },
];

export async function GET(): Promise<NextResponse> {
  // KVキャッシュを確認（ページが消えた後もデータを保持するためのバックアップ）
  try {
    const cached = await kv.get<PrevSeasonEntry[]>(KV_KEY);
    if (cached && cached.length > 0) {
      return NextResponse.json({ season: 52, data: cached });
    }
  } catch {}

  // KVに保存（初回または再保存）
  try {
    await kv.set(KV_KEY, SEASON_52_DATA);
  } catch {}

  return NextResponse.json({ season: 52, data: SEASON_52_DATA });
}
