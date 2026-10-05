// スコア表のバックアップ（削除したもの・修正する前の版）。管理画面から戻せる。180日で消える。
// 削除と修正で一覧を分ける（修正は何度もできるので、同じ一覧だと削除したものが押し出されて見えなくなる）。

import { kv } from "@vercel/kv";
import type { ScoreSheet } from "./scoreSheet";

export const BACKUP_SECONDS = 180 * 86400;
export const BACKUP_INDEX = { delete: "scoresheet:trash:index", edit: "scoresheet:editbak:index" } as const;
export const backupKey = (id: string) => `scoresheet:trash:${id}`;
const INDEX_MAX = 500;

export interface BackupEntry {
  id: string;
  code: string;
  sheet: ScoreSheet;
  deletedAt: string;
  deletedBy: { ip: string; userAgent: string; visitorId: string | null };
  /** edit: 修正したときの修正前の版（無ければ削除） */
  kind?: "delete" | "edit";
}

export async function saveBackup(
  code: string,
  sheet: ScoreSheet,
  kind: "delete" | "edit",
  by: BackupEntry["deletedBy"]
): Promise<string> {
  const entry: BackupEntry = { id: `${code}_${Date.now().toString(36)}`, code, sheet, deletedAt: new Date().toISOString(), deletedBy: by, kind };
  await kv.set(backupKey(entry.id), entry, { ex: BACKUP_SECONDS });
  await kv.lpush(BACKUP_INDEX[kind], entry.id);
  await kv.ltrim(BACKUP_INDEX[kind], 0, INDEX_MAX - 1);
  return entry.id;
}

/** 誰が操作したか（画面から x-visitor-id で端末IDを送る） */
export function operator(req: Request, ip: string): BackupEntry["deletedBy"] {
  const vid = req.headers.get("x-visitor-id") ?? "";
  return {
    ip,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    visitorId: /^[A-Za-z0-9-]{8,64}$/.test(vid) ? vid : null,
  };
}
