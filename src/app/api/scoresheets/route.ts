import { kv } from "@vercel/kv";
import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { gameLabel, logSheetEvent } from "@/lib/scoreSheetLog";
import { operator, saveBackup } from "@/lib/scoreSheetBackup";
import { indexSheet, unindexSheet } from "@/lib/scoreSheetIndex";
import { newEditToken, publicSheet, saverVisitorId, tokenMatches } from "@/lib/scoreSheetOwner";
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
/** 削除・修正の前の版をバックアップに残す（管理者が戻せるように、誰が操作したかも残す） */
const backup = (req: NextRequest, code: string, sheet: ScoreSheet, kind: "delete" | "edit") =>
  saveBackup(code, sheet, kind, operator(req, clientIp(req)));

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
    // 画面が経路を付けて呼ぶ（共有リンクを開いた / コードを入力した）
    const via = req.nextUrl.searchParams.get("via");
    await logSheetEvent(req, {
      action: "lookup",
      code,
      game: gameLabel(sheet),
      via: via === "link" || via === "input" || via === "recent" ? via : undefined,
    });
    return NextResponse.json({ sheet: { ...publicSheet(sheet), continueCode: code } });
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
  // 修正用の鍵は保存した端末にだけ渡す
  const owner = newEditToken();
  sheet.ownerHash = owner.hash;

  try {
    if (chosen) {
      sheet.continueCode = chosen;
      if (await kv.set(key(chosen), sheet, { nx: true, ex: KEEP_SECONDS })) {
        await indexSheet(chosen);
        await logSheetEvent(req, { action: "save", code: chosen, game: gameLabel(sheet), note: sheet.issues?.length ? `要確認${sheet.issues.length}件` : undefined });
        return NextResponse.json({ ok: true, continueCode: chosen, sheet: publicSheet(sheet), editToken: owner.token });
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
        await indexSheet(code);
        await logSheetEvent(req, { action: "save", code, game: gameLabel(sheet), note: "おまかせコード" });
        return NextResponse.json({ ok: true, continueCode: code, sheet: publicSheet(sheet), editToken: owner.token });
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
    const id = await backup(req, code, sheet, "delete");
    await kv.del(key(code));
    await unindexSheet(code);
    await logSheetEvent(req, { action: "delete", code, game: gameLabel(sheet), note: `バックアップ ${id}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("scoresheet delete failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

/**
 * 読み間違いなどを直す（コンテニューコードはそのまま）。修正前の版はバックアップに残し、管理者が戻せる。
 * 数字が変わると AI総評が合わなくなるので消す（次に開いたときに作り直す）。
 */
export async function PUT(req: NextRequest) {
  if (await isRateLimited(`scoresheet:edit:${clientIp(req)}`, 60, 86400)) {
    return NextResponse.json({ error: "limit", message: "今日の修正回数の上限です。" }, { status: 429 });
  }
  const code = normalizeContinueCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!code) {
    return NextResponse.json(
      { error: "bad_code", message: "このコンテニューコード（古い形式）のデータは修正できません。新しく保存し直してください。" },
      { status: 400 }
    );
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
  try {
    const before = await kv.get<ScoreSheet>(key(code));
    if (!before) return NextResponse.json({ error: "not_found", message: "このコンテニューコードのデータは見つかりません（削除された可能性があります）。" }, { status: 404 });
    // 修正できるのは保存した端末だけ（鍵が合うとき）
    if (!tokenMatches(before, req.headers.get("x-edit-token"))) {
      return NextResponse.json({ error: "not_owner", message: "この試合は、保存した端末でだけ修正できます。" }, { status: 403 });
    }
    const next: ScoreSheet = {
      ...sheet,
      continueCode: code,
      savedAt: before.savedAt,
      editedAt: new Date().toISOString(),
      issues: errors.length ? errors.slice(0, 20) : undefined,
      review: undefined,
      ownerHash: before.ownerHash,
    };
    const id = await backup(req, code, before, "edit");
    // 読んでから書くまでの間に削除されていたら書かない（期限なしで復活させない）
    if (!(await kv.set(key(code), next, { keepTtl: true, xx: true }))) {
      return NextResponse.json({ error: "not_found", message: "このコンテニューコードのデータは見つかりません（削除された可能性があります）。" }, { status: 404 });
    }
    // 修正前の数字で作っている途中の AI総評は保存させない（review 側で editedAt を見て捨てる）
    await kv.del(`scoresheet:review-lock:${code}`).catch(() => {});
    await logSheetEvent(req, {
      action: "edit",
      code,
      game: gameLabel(next),
      note: [errors.length ? `要確認${errors.length}件` : "", `修正前 ${id}`].filter(Boolean).join("・"),
    });
    return NextResponse.json({ ok: true, sheet: publicSheet(next) });
  } catch (e) {
    console.error("scoresheet edit failed", e);
    return NextResponse.json({ error: "unavailable", message: "修正を保存できませんでした。時間をおいてもう一度お試しください。" }, { status: 503 });
  }
}

/**
 * 鍵を入れる前（10/6 以前）に保存した試合の修正用の鍵を、保存した端末にだけ渡す（操作ログの端末IDと同じとき・1回だけ）。
 * PATCH /api/scoresheets?code=  （x-visitor-id 必須）
 */
export async function PATCH(req: NextRequest) {
  if (await isRateLimited(`scoresheet:claim:${clientIp(req)}`, 30, 3600)) return NextResponse.json({ error: "limit" }, { status: 429 });
  const code = normalizeContinueCode(req.nextUrl.searchParams.get("code") ?? "");
  const vid = req.headers.get("x-visitor-id") ?? "";
  if (!code || !/^[A-Za-z0-9-]{8,64}$/.test(vid)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const sheet = await kv.get<ScoreSheet>(key(code));
    if (!sheet) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (sheet.ownerHash || (await saverVisitorId(code)) !== vid) return NextResponse.json({ error: "not_owner" }, { status: 403 });
    const owner = newEditToken();
    if (!(await kv.set(key(code), { ...sheet, ownerHash: owner.hash }, { keepTtl: true, xx: true }))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ editToken: owner.token });
  } catch (e) {
    console.error("scoresheet claim failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
