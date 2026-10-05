import { NextRequest, NextResponse } from "next/server";
import { cachedAiResponse } from "@/lib/aiCache";
import { loadAllSeasons } from "@/lib/seasonData";
import { profileInput, teamProfile } from "@/lib/teamProfile";
import { teamKey } from "@/lib/teamName";
import { REVIEW_FORMAT, writeTeamReview } from "@/lib/teamReviewAi";

// チーム総評の AI コメント（総評・持ち味・注目・勝つためには？）。材料はサーバーで組み立てる（画面から送られた数字は使わない）。
// 保存・更新のきまり（月1回など）は src/lib/aiCache.ts。

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const season = Number(p.get("season"));
  const division = p.get("div") ?? "";
  const team = p.get("team") ?? "";
  if (!Number.isInteger(season) || !division || !team || team.length > 60 || division.length > 30) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return cachedAiResponse(req, {
    key: `teamreview:${season}:${division}:${teamKey(team)}`,
    kind: "teamreview",
    season,
    format: REVIEW_FORMAT,
    dailyLimit: 60,
    ipLimit: 20,
    input: async () => {
      const { data } = await loadAllSeasons(new URL(req.url).origin);
      const profile = teamProfile(data, season, division, team);
      if (!profile || profile.stats.gp === 0) return { error: "no_data", message: "このシーズンの成績がまだ無いので、総評は作れません。" };
      return { input: profileInput(profile) };
    },
    write: writeTeamReview,
  });
}
