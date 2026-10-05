import { NextRequest, NextResponse } from "next/server";
import { cachedAiResponse } from "@/lib/aiCache";
import { MATCHUP_FORMAT, matchupInput, matchupKey, writeMatchupReview } from "@/lib/matchupReviewAi";
import { loadAllSeasons } from "@/lib/seasonData";
import { loadIndexedSheets } from "@/lib/scoreSheetIndex";
import { rowsOfSheets, sheetSummaryText, teamSheetSummary } from "@/lib/sheetStats";

// 対戦カード（チーム相性）の AI総評と「相手に勝つには」。2チームの順番を入れ替えても同じものを使う。
// 保存・更新のきまり（月1回など）は src/lib/aiCache.ts。

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const season = Number(p.get("season"));
  const division = p.get("div") ?? "";
  const a = p.get("a") ?? "";
  const b = p.get("b") ?? "";
  if (!Number.isInteger(season) || !division || !a || !b || a.length > 60 || b.length > 60 || division.length > 30) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return cachedAiResponse(req, {
    key: matchupKey(season, division, a, b),
    kind: "matchupreview",
    season,
    format: MATCHUP_FORMAT,
    dailyLimit: 60,
    ipLimit: 20,
    input: async () => {
      const [{ data }, sheets] = await Promise.all([loadAllSeasons(new URL(req.url).origin), loadIndexedSheets()]);
      const input = matchupInput(data, season, division, a, b);
      if (!input) return { error: "no_data", message: "このシーズンの成績がまだ無いので、総評は作れません。" };
      // アップロードされたスコア表があれば、それぞれのチームの分を材料に足す
      const rows = rowsOfSheets(sheets);
      const extra = [a, b]
        .map((t) => {
          const text = sheetSummaryText(teamSheetSummary(rows, season, division, t));
          return text ? `■ ${t} のスコア表\n${text}` : "";
        })
        .filter(Boolean);
      return { input: [input, ...extra].join("\n\n") };
    },
    write: (input) => writeMatchupReview(input, a, b),
  });
}
