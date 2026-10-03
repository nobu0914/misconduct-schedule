import { kv } from "@vercel/kv";
import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import {
  checkSheet,
  isBlankSheet,
  normalizeContinueCode,
  sanitizeSheet,
  suggestContinueCode,
  type ScoreSheet,
} from "@/lib/scoreSheet";

// 利用者が自分で使うスコア表のデータ。会員登録なし・共有の一覧なし（ほかの人のデータは見えない）。
// 保存するとコンテニューコードを発行し、そのコードでいつでも呼び出せる（KV: scoresheet:cc:{CODE}）。
// 写真は保存しない。食い違いがあっても保存でき、残りは issues（要確認）に入れる。

export const dynamic = "force-dynamic";

const KEEP_SECONDS = 2 * 365 * 86400; // 2年
const key = (code: string) => `scoresheet:cc:${code}`;
const TRASH_SECONDS = 180 * 86400; // 削除したデータのバックアップは180日
const TRASH_INDEX = "scoresheet:trash:index";
const trashKey = (id: string) => `scoresheet:trash:${id}`;

interface TrashEntry {
  id: string;
  code: string;
  sheet: ScoreSheet;
  deletedAt: string;
  deletedBy: { ip: string; userAgent: string; visitorId: string | null };
}

const newCode = () => suggestContinueCode(randomInt);

/** コンテニューコードで呼び出す */
export async function GET(req: NextRequest) {
  // 総当たりを防ぐため、呼び出しの回数を IP ごとに制限する
  if (await isRateLimited(`scoresheet:lookup:${clientIp(req)}`, 30, 3600)) {
    return NextResponse.json({ error: "limit", message: "しばらく時間をおいてからお試しください。" }, { status: 429 });
  }
  const code = normalizeContinueCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!code) return NextResponse.json({ error: "bad_code", message: "コンテニューコードは半角の大文字と数字の4〜8文字です（例 K7QM3XRA）。" }, { status: 400 });
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
  // 利用者が決めたコード（無ければおまかせ）
  const wanted = (raw as { continueCode?: unknown } | null)?.continueCode;
  const chosen = typeof wanted === "string" && wanted !== "" ? normalizeContinueCode(wanted) : undefined;
  if (chosen === null) {
    return NextResponse.json(
      { error: "bad_code", message: "コンテニューコードは半角の大文字と数字で4〜8文字にしてください。" },
      { status: 400 }
    );
  }
  const sheet = sanitizeSheet(raw);
  if (isBlankSheet(sheet)) return NextResponse.json({ error: "blank", message: "内容が入っていません。" }, { status: 400 });
  const { errors } = checkSheet(sheet);
  if (errors.length > 0) sheet.issues = errors.slice(0, 20);
  sheet.savedAt = new Date().toISOString();

  try {
    if (chosen) {
      sheet.continueCode = chosen;
      if (await kv.set(key(chosen), sheet, { nx: true, ex: KEEP_SECONDS })) {
        return NextResponse.json({ ok: true, continueCode: chosen, sheet });
      }
      return NextResponse.json(
        { error: "taken", message: `「${chosen}」はすでに使われています。別のコンテニューコードにしてください。` },
        { status: 409 }
      );
    }
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

/**
 * コンテニューコードを知っている人がデータを消す。すぐには消さず、管理者が戻せるようにバックアップに移す
 * （180日）。誰が消したか分かるよう、日時・IP・ブラウザ・端末ID を一緒に記録する（画面で利用者に明示している）。
 */
export async function DELETE(req: NextRequest) {
  if (await isRateLimited(`scoresheet:lookup:${clientIp(req)}`, 30, 3600)) {
    return NextResponse.json({ error: "limit" }, { status: 429 });
  }
  const raw = req.nextUrl.searchParams.get("code") ?? "";
  // 10/3 夜に形式を変える前に発行した "XXXX-XXXX" も、消すことだけはできるようにしておく
  const legacy = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(raw) ? raw : null;
  const code = normalizeContinueCode(raw) ?? legacy;
  if (!code) return NextResponse.json({ error: "bad_code" }, { status: 400 });
  try {
    const sheet = await kv.get<ScoreSheet>(key(code));
    if (!sheet) return NextResponse.json({ ok: true, missing: true });
    const vid = req.headers.get("x-visitor-id") ?? "";
    const entry: TrashEntry = {
      id: `${code}_${Date.now().toString(36)}`,
      code,
      sheet,
      deletedAt: new Date().toISOString(),
      deletedBy: {
        ip: clientIp(req),
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
        visitorId: /^[A-Za-z0-9-]{8,64}$/.test(vid) ? vid : null,
      },
    };
    await kv.set(trashKey(entry.id), entry, { ex: TRASH_SECONDS });
    await kv.lpush(TRASH_INDEX, entry.id);
    await kv.ltrim(TRASH_INDEX, 0, 499);
    await kv.del(key(code));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("scoresheet delete failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
