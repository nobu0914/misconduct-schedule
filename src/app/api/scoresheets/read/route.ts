import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/rateLimit";
import { AiReadError, readScoreSheetImage } from "@/lib/scoreSheetAi";
import { gameLabel, logSheetEvent } from "@/lib/scoreSheetLog";

// スコア表の写真を AI で読み取る（誰でも使える）。写真は保存しない。
// 料金がかかるので、1日のアップロード（読み取り）は**全体で40件まで**（ユーザー指示）。1人で使い切られないよう
// IP ごとにも10件まで。読み取りに失敗した分は数えない。KV が使えないときは読み取りを止める（手入力は使える）。
// GET で今日の残り件数を返す（画面のカウンター用）。

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DAILY_LIMIT = 40;
const PER_IP_PER_DAY = 10;
const MAX_BASE64 = 4_000_000; // 約3MB の画像（Vercel の受け付け上限 4.5MB 未満。元の写真は画面側で10MBまで）
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** 日本時間の日付（カウンターは日本時間の0時に戻る） */
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const totalKey = (day: string) => `scoresheet:ai:${day}:total`;
const ipKey = (day: string, ip: string) => `scoresheet:ai:${day}:${ip}`;

async function used(): Promise<number | null> {
  try {
    return Number((await kv.get<number>(totalKey(today()))) ?? 0);
  } catch {
    return null;
  }
}

/** 1件分の枠を取る。上限なら取らない */
async function reserve(ip: string): Promise<"ok" | "limit" | "ip_limit" | null> {
  const day = today();
  try {
    const total = await kv.incr(totalKey(day));
    if (total === 1) await kv.expire(totalKey(day), 2 * 86400);
    if (total > DAILY_LIMIT) {
      await kv.decr(totalKey(day));
      return "limit";
    }
    const mine = await kv.incr(ipKey(day, ip));
    if (mine === 1) await kv.expire(ipKey(day, ip), 2 * 86400);
    if (mine > PER_IP_PER_DAY) {
      await Promise.all([kv.decr(ipKey(day, ip)), kv.decr(totalKey(day))]);
      return "ip_limit";
    }
    return "ok";
  } catch {
    return null;
  }
}

/** 読み取りに失敗した分は返す */
async function release(ip: string) {
  const day = today();
  try {
    await Promise.all([kv.decr(totalKey(day)), kv.decr(ipKey(day, ip))]);
  } catch {
    // 数え違いは翌日に戻る
  }
}

/** 今日の残り件数（全体） */
export async function GET() {
  const n = await used();
  if (n === null) return NextResponse.json({ limit: DAILY_LIMIT, used: null, remaining: null });
  return NextResponse.json({ limit: DAILY_LIMIT, used: n, remaining: Math.max(0, DAILY_LIMIT - n) });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "no_key", message: "自動読み取りは準備中です。手入力で登録できます。" }, { status: 503 });
  }
  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : "";
  const mediaType = typeof body.mediaType === "string" && MEDIA_TYPES.includes(body.mediaType) ? body.mediaType : "";
  if (!image || !mediaType || image.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return NextResponse.json({ error: "bad_image", message: "画像を読み込めませんでした。" }, { status: 400 });
  }

  const ip = clientIp(req);
  const slot = await reserve(ip);
  if (slot === null) {
    return NextResponse.json({ error: "unavailable", message: "いまは自動読み取りを使えません。手入力で登録できます。" }, { status: 503 });
  }
  if (slot === "limit") {
    return NextResponse.json(
      { error: "limit", message: `今日のアップロードは上限（全体で${DAILY_LIMIT}件）に達しました。明日0時に戻ります。手入力なら登録できます。` },
      { status: 429 }
    );
  }
  if (slot === "ip_limit") {
    return NextResponse.json(
      { error: "ip_limit", message: `1人あたりの今日のアップロード（${PER_IP_PER_DAY}件）に達しました。手入力なら登録できます。` },
      { status: 429 }
    );
  }

  try {
    const sheet = await readScoreSheetImage(image, mediaType);
    await logSheetEvent(req, { action: "read", game: gameLabel(sheet), note: `画像 ${Math.round((image.length * 3) / 4 / 1024)}KB` });
    return NextResponse.json({ sheet });
  } catch (e) {
    await release(ip);
    await logSheetEvent(req, { action: "read_failed", note: e instanceof AiReadError ? e.message : "error" });
    const code = e instanceof AiReadError ? e.message : "error";
    console.error("score sheet read error", code, e instanceof AiReadError ? "" : e);
    const detail = e instanceof AiReadError ? e.detail : undefined;
    return NextResponse.json({ error: code, detail, message: "読み取りに失敗しました。手入力で登録できます。" }, { status: 502 });
  }
}
