import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { checkSheet, sanitizeSheet, sheetId, type ScoreSheet } from "@/lib/scoreSheet";

// ユーザーが登録したスコア表（KV: scoresheet:{id}、一覧は set scoresheet:index）。
// 同じ試合（日付＋試合番号）は先に登録されたものを残す（上書きによるいたずらを防ぐ）。消せるのは管理者だけ。

export const dynamic = "force-dynamic";

const INDEX = "scoresheet:index";
const key = (id: string) => `scoresheet:${id}`;

export async function GET() {
  try {
    const ids = ((await kv.smembers(INDEX)) ?? []).map(String);
    if (ids.length === 0) return NextResponse.json({ sheets: [] });
    const sheets = (await kv.mget<(ScoreSheet | null)[]>(...ids.map(key))).filter((s): s is ScoreSheet => !!s);
    sheets.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
    return NextResponse.json({ sheets });
  } catch (e) {
    console.error("scoresheets list failed", e);
    return NextResponse.json({ sheets: [], error: "unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (await isRateLimited(`scoresheet:save:${clientIp(req)}`, 30, 86400)) {
    return NextResponse.json({ error: "limit", message: "今日の登録回数の上限です。" }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const sheet = sanitizeSheet(raw);
  const { errors } = checkSheet(sheet);
  if (errors.length > 0) return NextResponse.json({ error: "invalid", errors }, { status: 400 });

  const id = sheetId(sheet);
  sheet.id = id;
  sheet.savedAt = new Date().toISOString();
  try {
    const created = await kv.set(key(id), sheet, { nx: true });
    if (!created) {
      return NextResponse.json({ error: "exists", id, message: "この試合はすでに登録されています。" }, { status: 409 });
    }
    await kv.sadd(INDEX, id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("scoresheet save failed", e);
    return NextResponse.json({ error: "unavailable", message: "保存できませんでした。時間をおいてもう一度お試しください。" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: auth.status });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{1,40}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  await kv.del(key(id));
  await kv.srem(INDEX, id);
  return NextResponse.json({ ok: true });
}
