import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";
import { clientIp } from "@/lib/rateLimit";
import type { ScoreSheet } from "@/lib/scoreSheet";
import { indexSheet } from "@/lib/scoreSheetIndex";
import { BACKUP_INDEX, backupKey, operator, saveBackup, type BackupEntry } from "@/lib/scoreSheetBackup";
import { SHEET_LOG_KEY, gameLabel, logSheetEvent, type SheetLogEntry } from "@/lib/scoreSheetLog";

// 管理者用: 利用者が削除したスコア表と、修正する前の版（バックアップ）の一覧と復元。
// 削除は DELETE、修正は PUT（/api/scoresheets）が scoresheet:trash:{id} に残している（180日）。一覧は削除と修正で別。

export const dynamic = "force-dynamic";

const KEEP_SECONDS = 2 * 365 * 86400;

async function auth(req: NextRequest) {
  return verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  try {
    const [deleted, edited, log] = await Promise.all([
      kv.lrange(BACKUP_INDEX.delete, 0, 199).then((v) => (v ?? []).map(String)),
      kv.lrange(BACKUP_INDEX.edit, 0, 199).then((v) => (v ?? []).map(String)),
      kv.lrange<SheetLogEntry>(SHEET_LOG_KEY, 0, 299).then((v) => v ?? []),
    ]);
    const ids = [...deleted, ...edited];
    const entries = ids.length
      ? (await kv.mget<(BackupEntry | null)[]>(...ids.map(backupKey)))
          .filter((e): e is BackupEntry => !!e)
          .sort((x, y) => y.deletedAt.localeCompare(x.deletedAt))
      : [];
    return NextResponse.json({ entries, log });
  } catch (e) {
    console.error("trash list failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

/**
 * 戻す。削除されたものは、その間に同じコードが使われていなければ戻す。
 * 修正前の版は、同じ試合（保存日時が同じ）のときだけ今の内容に上書きし、上書きする今の内容もバックアップに残す
 * （削除のあと別の人が同じコードで保存していた場合に、その人のデータを消さないため）。
 */
export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (typeof id !== "string" || !/^[\w-]{1,60}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const entry = await kv.get<BackupEntry>(backupKey(id));
    if (!entry) return NextResponse.json({ error: "not_found", message: "バックアップが見つかりません（期限切れの可能性）。" }, { status: 404 });
    const key = `scoresheet:cc:${entry.code}`;
    const edit = entry.kind === "edit";
    const current = await kv.get<ScoreSheet>(key);
    if (current && (!edit || (current.savedAt ?? "") !== (entry.sheet.savedAt ?? ""))) {
      return NextResponse.json({ error: "taken", message: `コード ${entry.code} はすでに別のデータで使われています。` }, { status: 409 });
    }
    if (current) await saveBackup(entry.code, current, "edit", operator(req, `管理者 ${clientIp(req)}`));
    const restored = await kv.set(key, { ...entry.sheet, continueCode: entry.code }, current ? { ex: KEEP_SECONDS } : { nx: true, ex: KEEP_SECONDS });
    if (!restored) {
      return NextResponse.json({ error: "taken", message: `コード ${entry.code} はすでに別のデータで使われています。` }, { status: 409 });
    }
    await indexSheet(entry.code);
    // 同じコードに追加した試合なら、コードのまとまりにも戻す
    if (entry.sheet.groupCode) await kv.sadd(`scoresheet:group:${entry.sheet.groupCode}`, entry.code).catch(() => {});
    await kv.del(backupKey(id));
    await Promise.all([kv.lrem(BACKUP_INDEX.delete, 0, id), kv.lrem(BACKUP_INDEX.edit, 0, id)]);
    await logSheetEvent(req, { action: "restore", code: entry.code, game: gameLabel(entry.sheet), note: edit ? "管理者が修正前に戻した" : "管理者が復元" });
    return NextResponse.json({ ok: true, code: entry.code });
  } catch (e) {
    console.error("trash restore failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
