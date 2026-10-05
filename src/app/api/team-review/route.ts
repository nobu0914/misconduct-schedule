import { kv } from "@vercel/kv";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { loadAllSeasons } from "@/lib/seasonData";
import { currentSeasonNumber } from "@/lib/schedule";
import { profileInput, teamProfile } from "@/lib/teamProfile";
import { teamKey } from "@/lib/teamName";
import { writeTeamReview, type TeamReview } from "@/lib/teamReviewAi";

// チーム総評の AI コメント。材料はサーバーで組み立てる（画面から送られた数字は使わない）。
// 一度作ったら保存分を使い回す（ユーザー指示 2026-10-05: 毎回 AI に作らせない・更新は月1回）。
// 今シーズンの総評は、作った月（日本時間）が変わったら次に開かれたときに作り直す。
// 終わったシーズンは数字が変わらないので作り直さない。キーにシーズンが入っているので新しいシーズンは別に作る。期限なしで残す。
// 料金がかかるので、新しく作るのは全体で1日60件・同じ回線から1日20件まで。作り直せないときは前の総評を返す。

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAILY_LIMIT = 60;
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

interface Stored {
  hash: string;
  review: TeamReview;
}

export async function POST(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const season = Number(p.get("season"));
  const division = p.get("div") ?? "";
  const team = p.get("team") ?? "";
  if (!Number.isInteger(season) || !division || !team || team.length > 60 || division.length > 30) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const key = `teamreview:${season}:${division}:${teamKey(team)}`;
  const stored = await kv.get<Stored>(key).catch(() => null);
  // 「勝つためには？」を足す前（10/5）に作ったものは1回だけ作り直す。今シーズンは月が変わったら作り直す
  const month = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 7);
  const finished = season < currentSeasonNumber();
  if (stored?.review.howToBeat && (finished || month(stored.review.createdAt) === month(new Date().toISOString()))) {
    return NextResponse.json({ review: stored.review });
  }

  const { data } = await loadAllSeasons(new URL(req.url).origin);
  const profile = teamProfile(data, season, division, team);
  if (!profile || profile.stats.gp === 0) {
    return NextResponse.json({ error: "no_data", message: "このシーズンの成績がまだ無いので、総評は作れません。" }, { status: 404 });
  }
  const input = profileInput(profile);
  // どの材料で書いたかの記録（作り直しの判定には使わない）
  const hash = createHash("sha1").update(input).digest("hex").slice(0, 16);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no_key", message: "AI総評は準備中です。", review: stored?.review }, { status: 503 });

  // 同じチームを同時に作らない／料金の上限
  if (!(await kv.set(`${key}:lock`, 1, { nx: true, ex: 90 }).catch(() => "OK"))) {
    return NextResponse.json({ error: "busy", message: "作成中です。少し待ってから開き直してください。", review: stored?.review }, { status: 409 });
  }
  const counter = `teamreview:count:${today()}`;
  const release = () => kv.del(`${key}:lock`).catch(() => {});
  try {
    if (await isRateLimited(`teamreview:${clientIp(req)}`, 20, 86400)) {
      await release();
      return NextResponse.json({ error: "limit", message: "今日はこれ以上作れません。", review: stored?.review }, { status: 429 });
    }
    const used = await kv.incr(counter);
    if (used === 1) await kv.expire(counter, 2 * 86400);
    if (used > DAILY_LIMIT) {
      await Promise.all([kv.decr(counter), release()]);
      return NextResponse.json({ error: "limit", message: "今日の AI総評の上限に達しました。明日また開いてください。", review: stored?.review }, { status: 429 });
    }
    const review = await writeTeamReview(input);
    await kv.set(key, { hash, review } satisfies Stored);
    await release();
    return NextResponse.json({ review });
  } catch (e) {
    console.error("team review error", e);
    await Promise.all([kv.decr(counter).catch(() => {}), release()]);
    return NextResponse.json({ error: "failed", message: "総評を作れませんでした。時間をおいて開き直してください。", review: stored?.review }, { status: 503 });
  }
}
