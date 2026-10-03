import { kv } from "@vercel/kv";
import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import {
  checkSheet,
  CONTINUE_ALPHABET,
  isBlankSheet,
  normalizeContinueCode,
  sanitizeSheet,
  type ScoreSheet,
} from "@/lib/scoreSheet";

// 利用者が自分で使うスコア表のデータ。会員登録なし・共有の一覧なし（ほかの人のデータは見えない）。
// 保存するとコンテニューコードを発行し、そのコードでいつでも呼び出せる（KV: scoresheet:cc:{CODE}）。
// 写真は保存しない。食い違いがあっても保存でき、残りは issues（要確認）に入れる。

export const dynamic = "force-dynamic";

const KEEP_SECONDS = 2 * 365 * 86400; // 2年
const key = (code: string) => `scoresheet:cc:${code}`;

function newCode(): string {
  return Array.from({ length: 8 }, () => CONTINUE_ALPHABET[randomInt(CONTINUE_ALPHABET.length)]).join("");
}

/** コンテニューコードで呼び出す */
export async function GET(req: NextRequest) {
  // 総当たりを防ぐため、呼び出しの回数を IP ごとに制限する
  if (await isRateLimited(`scoresheet:lookup:${clientIp(req)}`, 30, 3600)) {
    return NextResponse.json({ error: "limit", message: "しばらく時間をおいてからお試しください。" }, { status: 429 });
  }
  const code = normalizeContinueCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!code) return NextResponse.json({ error: "bad_code", message: "コンテニューコードは半角の大文字と数字の8文字です（例 K7QM3XRA）。" }, { status: 400 });
  try {
    const sheet = await kv.get<ScoreSheet>(key(code));
    if (!sheet) return NextResponse.json({ error: "not_found", message: "このコンテニューコードのデータは見つかりません。" }, { status: 404 });
    return NextResponse.json({ sheet: { ...sheet, continueCode: code } });
  } catch (e) {
    console.error("scoresheet lookup failed", e);
    return NextResponse.json({ error: "unavailable", message: "いまは呼び出せません。時間をおいてお試しください。" }, { status: 503 });
  }
}

/** 保存してコンテニューコードを発行する */
export async function POST(req: NextRequest) {
  if (await isRateLimited(`scoresheet:save:${clientIp(req)}`, 30, 86400)) {
    return NextResponse.json({ error: "limit", message: "今日の保存回数の上限です。" }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const sheet = sanitizeSheet(raw);
  if (isBlankSheet(sheet)) return NextResponse.json({ error: "blank", message: "内容が入っていません。" }, { status: 400 });
  const { errors } = checkSheet(sheet);
  if (errors.length > 0) sheet.issues = errors.slice(0, 20);
  sheet.savedAt = new Date().toISOString();

  try {
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      sheet.continueCode = code;
      if (await kv.set(key(code), sheet, { nx: true, ex: KEEP_SECONDS })) {
        return NextResponse.json({ ok: true, continueCode: code, sheet });
      }
    }
    return NextResponse.json({ error: "unavailable", message: "保存できませんでした。もう一度お試しください。" }, { status: 503 });
  } catch (e) {
    console.error("scoresheet save failed", e);
    return NextResponse.json({ error: "unavailable", message: "保存できませんでした。時間をおいてもう一度お試しください。" }, { status: 503 });
  }
}

/** コンテニューコードを知っている人が自分のデータを消す */
export async function DELETE(req: NextRequest) {
  if (await isRateLimited(`scoresheet:lookup:${clientIp(req)}`, 30, 3600)) {
    return NextResponse.json({ error: "limit" }, { status: 429 });
  }
  const code = normalizeContinueCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!code) return NextResponse.json({ error: "bad_code" }, { status: 400 });
  try {
    await kv.del(key(code));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
