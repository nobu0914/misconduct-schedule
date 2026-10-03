import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/rateLimit";
import { AiReadError, readScoreSheetImage } from "@/lib/scoreSheetAi";

// スコア表の写真を AI で読み取る（誰でも使える）。写真は保存しない。
// 料金がかかるので、1人あたり・全体で1日の回数に上限を付ける。KV が使えないときは読み取りを止める（手入力は使える）。

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PER_IP_PER_DAY = 10;
const TOTAL_PER_DAY = 60;
const MAX_BASE64 = 4_000_000; // 約3MB の画像（Vercel の受け付け上限 4.5MB 未満）
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function underDailyLimit(req: NextRequest): Promise<boolean | null> {
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  try {
    const [mine, total] = await Promise.all([
      kv.incr(`scoresheet:ai:${day}:${clientIp(req)}`),
      kv.incr(`scoresheet:ai:${day}:total`),
    ]);
    if (mine === 1) await kv.expire(`scoresheet:ai:${day}:${clientIp(req)}`, 2 * 86400);
    if (total === 1) await kv.expire(`scoresheet:ai:${day}:total`, 2 * 86400);
    return mine <= PER_IP_PER_DAY && total <= TOTAL_PER_DAY;
  } catch {
    return null;
  }
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

  const allowed = await underDailyLimit(req);
  if (allowed === null) {
    return NextResponse.json({ error: "unavailable", message: "いまは自動読み取りを使えません。手入力で登録できます。" }, { status: 503 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "limit", message: "今日の自動読み取りの回数を超えました。手入力で登録できます。" }, { status: 429 });
  }

  try {
    const sheet = await readScoreSheetImage(image, mediaType);
    return NextResponse.json({ sheet });
  } catch (e) {
    const code = e instanceof AiReadError ? e.message : "error";
    console.error("score sheet read error", code, e instanceof AiReadError ? "" : e);
    return NextResponse.json({ error: code, message: "読み取りに失敗しました。手入力で登録できます。" }, { status: 502 });
  }
}
