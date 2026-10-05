// スコア表の修正は「保存した端末だけ」（ユーザー指示 2026-10-06）。サーバー専用。
//
// 保存したときに修正用の鍵（ランダムな文字列）を作って保存した端末にだけ渡し、サーバーにはそのハッシュ（ownerHash）だけを持つ。
// 修正（PUT）は鍵が合うときだけ。鍵を入れる前（10/6 以前）に保存した試合は、操作ログの「保存」を記録した端末ID と
// 同じ端末からなら1回だけ鍵を受け取れる（claim）。

import { kv } from "@vercel/kv";
import { createHash, randomBytes } from "node:crypto";
import type { ScoreSheet } from "./scoreSheet";
import { SHEET_LOG_KEY, type SheetLogEntry } from "./scoreSheetLog";

export function newEditToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function tokenMatches(sheet: ScoreSheet, token: string | null): boolean {
  return !!sheet.ownerHash && !!token && hashToken(token) === sheet.ownerHash;
}

/** 画面に返すときは鍵のハッシュを外す */
export function publicSheet(sheet: ScoreSheet): ScoreSheet {
  const { ownerHash: _omit, ...rest } = sheet;
  void _omit;
  return rest;
}

/** 操作ログから、そのコードを保存した端末ID（無ければ null） */
export async function saverVisitorId(code: string): Promise<string | null> {
  const log = (await kv.lrange<SheetLogEntry>(SHEET_LOG_KEY, 0, 1999).catch(() => [])) ?? [];
  const save = log.find((e) => e.action === "save" && e.code === code);
  return save?.visitorId ?? null;
}
