import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { normalizeContinueCode, type ScoreSheet } from "@/lib/scoreSheet";
import { AiReadError, reviewScoreSheet } from "@/lib/scoreSheetAi";
import { gameLabel, logSheetEvent } from "@/lib/scoreSheetLog";

// AI 総評。コンテニューコードの試合について一度だけ作り、試合のデータと一緒に保存する（2回目からは保存分を返す）。
// 文章だけの軽い呼び出しだが料金がかかるので、全体で1日100件まで（アップロードの40件とは別）。

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAILY_LIMIT = 100;
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export async function POST(req: NextRequest) {
  const code = normalizeContinueCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!code) return NextResponse.json({ error: "bad_code" }, { status: 400 });
  const key = `scoresheet:cc:${code}`;
  let sheet: ScoreSheet | null;
  try {
    sheet = await kv.get<ScoreSheet>(key);
  } catch {
    return NextResponse.json({ error: "unavailable", message: "いまは総評を作れません。" }, { status: 503 });
  }
  if (!sheet) return NextResponse.json({ error: "not_found", message: "この試合のデータが見つかりません。" }, { status: 404 });
  if (sheet.review) return NextResponse.json({ review: sheet.review });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no_key", message: "AI総評は準備中です。" }, { status: 503 });
  if (sheet.goals.length === 0) return NextResponse.json({ error: "empty", message: "得点の記録が無いので総評を作れません。" }, { status: 400 });

  // 同じ試合を同時に何度も作らないよう、作成中の印を付ける
  const lock = `scoresheet:review-lock:${code}`;
  const counter = `scoresheet:review:${today()}`;
  try {
    if (!(await kv.set(lock, 1, { nx: true, ex: 90 }))) {
      return NextResponse.json({ error: "busy", message: "総評を作っています。少し待ってから開き直してください。" }, { status: 409 });
    }
    const n = await kv.incr(counter);
    if (n === 1) await kv.expire(counter, 2 * 86400);
    if (n > DAILY_LIMIT) {
      await Promise.all([kv.decr(counter), kv.del(lock)]);
      return NextResponse.json({ error: "limit", message: "今日のAI総評は上限に達しました。明日0時に戻ります。" }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "unavailable", message: "いまは総評を作れません。" }, { status: 503 });
  }

  try {
    const review = await reviewScoreSheet(sheet);
    // 作っている間に修正・削除されたら保存しない（修正前の数字で上書きしないため）
    const latest = await kv.get<ScoreSheet>(key);
    if (!latest || (latest.editedAt ?? "") !== (sheet.editedAt ?? "")) {
      return NextResponse.json({ error: "changed", message: "試合のデータが修正されたので、開き直すと新しい総評を作ります。" }, { status: 409 });
    }
    await kv.set(key, { ...latest, review }, { keepTtl: true, xx: true });
    await logSheetEvent(req, { action: "review", code, game: gameLabel(sheet) });
    return NextResponse.json({ review });
  } catch (e) {
    await kv.decr(counter).catch(() => {});
    console.error("score sheet review error", e instanceof AiReadError ? e.message : e);
    return NextResponse.json({ error: "failed", message: "総評を作れませんでした。時間をおいて開き直してください。" }, { status: 502 });
  } finally {
    await kv.del(lock).catch(() => {});
  }
}
