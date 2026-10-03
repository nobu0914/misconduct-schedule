import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";
import type { ScoreSheet } from "@/lib/scoreSheet";

// 管理者用: 利用者が削除したスコア表（バックアップ）の一覧と復元。
// 削除は /api/scoresheets の DELETE が scoresheet:trash:{id} に移している（180日）。

export const dynamic = "force-dynamic";

const TRASH_INDEX = "scoresheet:trash:index";
const trashKey = (id: string) => `scoresheet:trash:${id}`;
const KEEP_SECONDS = 2 * 365 * 86400;

interface TrashEntry {
  id: string;
  code: string;
  sheet: ScoreSheet;
  deletedAt: string;
  deletedBy: { ip: string; userAgent: string; visitorId: string | null };
}

async function auth(req: NextRequest) {
  return verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  try {
    const ids = ((await kv.lrange(TRASH_INDEX, 0, 199)) ?? []).map(String);
    if (ids.length === 0) return NextResponse.json({ entries: [] });
    const entries = (await kv.mget<(TrashEntry | null)[]>(...ids.map(trashKey))).filter((e): e is TrashEntry => !!e);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("trash list failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

/** 復元: 元のコンテニューコードで戻す（その間に同じコードが使われていたら戻さない） */
export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (typeof id !== "string" || !/^[\w-]{1,60}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const entry = await kv.get<TrashEntry>(trashKey(id));
    if (!entry) return NextResponse.json({ error: "not_found", message: "バックアップが見つかりません（期限切れの可能性）。" }, { status: 404 });
    const restored = await kv.set(`scoresheet:cc:${entry.code}`, { ...entry.sheet, continueCode: entry.code }, { nx: true, ex: KEEP_SECONDS });
    if (!restored) {
      return NextResponse.json({ error: "taken", message: `コード ${entry.code} はすでに別のデータで使われています。` }, { status: 409 });
    }
    await kv.del(trashKey(id));
    await kv.lrem(TRASH_INDEX, 0, id);
    return NextResponse.json({ ok: true, code: entry.code });
  } catch (e) {
    console.error("trash restore failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
