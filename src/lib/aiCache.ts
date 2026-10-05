// AI で作る総評（チーム総評・対戦カードの総評）を「一度作ったら保存して使い回す」ための共通処理（サーバー専用）。
//
// ユーザー指示（2026-10-05）: 毎回 AI に作らせない。今シーズンの分は月1回更新。
// - 今シーズン: 作った月（JST）が変わったら、次に開かれたときに作り直す
// - 終わったシーズン: シーズン中に作ったもの（途中の内容）だけ、終わってから1回作り直す。あとは作り直さない
// - 書き方（format）を変えたら、古い書き方のものを1回だけ作り直す
// - 材料が読めない・上限・失敗のときは前に作ったものを返す
// 料金がかかるので、新しく作るのは種類ごとに全体で1日 dailyLimit 件・同じ回線から ipLimit 件まで。KV に期限なしで残す。

import { kv } from "@vercel/kv";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "./rateLimit";
import { currentSeasonNumber } from "./schedule";

export interface CachedAi {
  createdAt: string;
  format?: number;
}

const jstMonth = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 7);
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 保存してあるものをそのまま使ってよいか */
export function isFresh(r: CachedAi | undefined, season: number, format: number, now = new Date()): boolean {
  if (!r || (r.format ?? 0) < format) return false;
  const finished = season < currentSeasonNumber(now);
  return finished ? currentSeasonNumber(new Date(r.createdAt)) > season : jstMonth(r.createdAt) === jstMonth(now.toISOString());
}

interface Stored<T> {
  hash: string;
  review: T;
}

export async function cachedAiResponse<T extends CachedAi>(
  req: NextRequest,
  opts: {
    /** 保存先のキー（例 teamreview:53:Brass:サイコ） */
    key: string;
    /** 回数を数えるときの種類（例 teamreview） */
    kind: string;
    season: number;
    format: number;
    dailyLimit: number;
    ipLimit: number;
    /** 材料（事実の文章）。作れない（成績が無い）ときは null と理由 */
    input: () => Promise<{ input: string } | { error: string; message: string }>;
    write: (input: string) => Promise<T>;
  }
): Promise<NextResponse> {
  const { key } = opts;
  const stored = await kv.get<Stored<T>>(key).catch(() => null);
  if (stored && isFresh(stored.review, opts.season, opts.format)) return NextResponse.json({ review: stored.review });
  const old = stored?.review;

  const made = await opts.input();
  if ("error" in made) {
    if (old) return NextResponse.json({ review: old });
    return NextResponse.json({ error: made.error, message: made.message }, { status: 404 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no_key", message: "AI総評は準備中です。", review: old }, { status: 503 });
  const hash = createHash("sha1").update(made.input).digest("hex").slice(0, 16);

  // 同じものを同時に作らない／料金の上限（全体の上限を先に見てから、回線ごとの回数を数える）
  if (!(await kv.set(`${key}:lock`, 1, { nx: true, ex: 90 }).catch(() => "OK"))) {
    return NextResponse.json({ error: "busy", message: "作成中です。少し待ってから開き直してください。", review: old }, { status: 409 });
  }
  const counter = `${opts.kind}:count:${jstToday()}`;
  const release = () => kv.del(`${key}:lock`).catch(() => {});
  let charged = false;
  try {
    const used = await kv.incr(counter);
    if (used === 1) await kv.expire(counter, 2 * 86400);
    charged = true;
    if (used > opts.dailyLimit) {
      await Promise.all([kv.decr(counter), release()]);
      return NextResponse.json({ error: "limit", message: "今日の AI総評の上限に達しました。明日また開いてください。", review: old }, { status: 429 });
    }
    if (await isRateLimited(`${opts.kind}:ip:${clientIp(req)}`, opts.ipLimit, 86400)) {
      await Promise.all([kv.decr(counter), release()]);
      return NextResponse.json({ error: "limit", message: "今日はこれ以上作れません。", review: old }, { status: 429 });
    }
    const review = await opts.write(made.input);
    // ここから先の失敗は、AI の料金はかかっているのでカウンタは戻さない
    charged = false;
    await kv.set(key, { hash, review } satisfies Stored<T>).catch((e) => console.error(`${opts.kind} save failed`, e));
    await release();
    return NextResponse.json({ review });
  } catch (e) {
    console.error(`${opts.kind} error`, e);
    await Promise.all([charged ? kv.decr(counter).catch(() => {}) : null, release()]);
    return NextResponse.json({ error: "failed", message: "総評を作れませんでした。時間をおいて開き直してください。", review: old }, { status: 503 });
  }
}
