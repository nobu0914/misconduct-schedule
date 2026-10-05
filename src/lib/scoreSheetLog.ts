// スコア表分析の操作ログ（管理画面で見る）。KV のリスト scoresheet:log に新しい順で最大2000件。
// 誰が何をしたか追えるよう、日時・IP・ブラウザ・端末ID（画面から x-visitor-id で送る）を残す。
// ログの失敗で本来の処理を止めない。

import { kv } from "@vercel/kv";
import { clientIp } from "./rateLimit";

export type SheetLogAction = "read" | "read_failed" | "save" | "lookup" | "edit" | "delete" | "restore" | "review";

export interface SheetLogEntry {
  at: string;
  action: SheetLogAction;
  code?: string;
  game?: string;
  note?: string;
  /** 呼び出しの経路: 共有リンクを開いた / コードを入力した（2026-10-04 以前の記録には無い） */
  via?: SheetLookupVia;
  ip: string;
  userAgent: string;
  visitorId: string | null;
}

export type SheetLookupVia = "link" | "input";

export const SHEET_LOG_KEY = "scoresheet:log";
const MAX = 2000;

export function gameLabel(s: { date?: string; division?: string; gameNo?: string; visitor?: { name?: string; total?: number }; home?: { name?: string; total?: number } }): string {
  return `${s.date ?? ""} ${s.division ?? ""} #${s.gameNo ?? ""} ${s.visitor?.name ?? "?"} ${s.visitor?.total ?? ""}-${s.home?.total ?? ""} ${s.home?.name ?? "?"}`.trim();
}

export async function logSheetEvent(
  req: Request,
  e: { action: SheetLogAction; code?: string; game?: string; note?: string; via?: SheetLookupVia }
) {
  const vid = req.headers.get("x-visitor-id") ?? "";
  const entry: SheetLogEntry = {
    at: new Date().toISOString(),
    ...e,
    ip: clientIp(req),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200),
    visitorId: /^[A-Za-z0-9-]{8,64}$/.test(vid) ? vid : null,
  };
  try {
    await kv.lpush(SHEET_LOG_KEY, entry);
    await kv.ltrim(SHEET_LOG_KEY, 0, MAX - 1);
  } catch (err) {
    console.error("scoresheet log failed", err);
  }
}
