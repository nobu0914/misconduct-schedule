// 保存されているスコア表のコードの一覧（チームごとの集計で使う。KV の全件走査をしないため）。サーバー専用。
// 保存・復元で足し、削除で外す。2年の期限で消えたものは読むときに外す。

import { kv } from "@vercel/kv";
import type { ScoreSheet } from "./scoreSheet";

export const SHEET_INDEX = "scoresheet:index";

export const indexSheet = (code: string) => kv.sadd(SHEET_INDEX, code).catch(() => 0);
export const unindexSheet = (code: string) => kv.srem(SHEET_INDEX, code).catch(() => 0);

/** 一覧にある全部のスコア表（期限切れで消えていたら一覧からも外す） */
export async function loadIndexedSheets(): Promise<ScoreSheet[]> {
  const codes = ((await kv.smembers(SHEET_INDEX).catch(() => [])) ?? []).map(String);
  if (!codes.length) return [];
  const out: ScoreSheet[] = [];
  for (let i = 0; i < codes.length; i += 100) {
    const part = codes.slice(i, i + 100);
    const sheets = await kv.mget<(ScoreSheet | null)[]>(...part.map((c) => `scoresheet:cc:${c}`));
    sheets.forEach((s, j) => {
      if (s) out.push({ ...s, continueCode: part[j] });
      else void unindexSheet(part[j]);
    });
  }
  return out;
}
