// リーグニュースの作成と保存（KV）。cron（金曜の朝）と管理画面の「今すぐ作り直す」から呼ぶ。
//
//   news:latest   いま表示している号
//   news:history  過去の号（新しい順・最大520号＝10年分。期限なしで残す）

import { kv } from "@vercel/kv";
import type { ScoreSheet } from "./scoreSheet";
import { SHEET_LOG_KEY, type SheetLogEntry } from "./scoreSheetLog";
import { buildNewsDigest, writeNews, type NewsEdition } from "./leagueNews";
import { parseSeasonNumber } from "./season";

export const NEWS_LATEST_KEY = "news:latest";
const HISTORY_KEY = "news:history";
const HISTORY_MAX = 520;
/** /news で一度に返す過去の号の数（「もっと見る」で続きを読む） */
export const HISTORY_PAGE = 10;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** 直近14日に保存・修正されたスコア表（操作ログからコードを拾う。KV の全件走査はしない） */
async function recentSheets(): Promise<ScoreSheet[]> {
  const log = (await kv.lrange<SheetLogEntry>(SHEET_LOG_KEY, 0, 1999).catch(() => [])) ?? [];
  const since = Date.now() - 14 * 86400_000;
  const codes = [
    ...new Set(log.filter((e) => (e.action === "save" || e.action === "edit") && e.code && Date.parse(e.at) >= since).map((e) => e.code!)),
  ].slice(0, 40);
  if (codes.length === 0) return [];
  const sheets = await kv.mget<(ScoreSheet | null)[]>(...codes.map((c) => `scoresheet:cc:${c}`));
  return sheets.filter((s): s is ScoreSheet => !!s);
}

/** サイトの API（公式に届かないときは保存データで返る）から材料を集めて、AI に記事を書かせて保存する */
export async function generateNews(origin: string): Promise<{ edition: NewsEdition; digest: string }> {
  // 前シーズンの最終順位（注目カードの判定）。季番号なしの /api/past-standings は直近の過去シーズンを返すので並列で読める
  const [scores, standings, players, schedule, events, sheets, prev] = await Promise.all([
    getJson<{ games?: [] }>(`${origin}/api/scores`),
    getJson<{ standings?: []; season?: string }>(`${origin}/api/standings`),
    getJson<{ players?: []; season?: string }>(`${origin}/api/player-stats`),
    getJson<{ matches?: [] }>(`${origin}/api/schedule`),
    getJson<{ items?: [] }>(`${origin}/api/events`),
    recentSheets(),
    getJson<{ data?: []; season?: number }>(`${origin}/api/past-standings`),
  ]);
  const season = standings?.season ?? players?.season;
  const cur = parseSeasonNumber(season);
  const digest = buildNewsDigest({
    now: new Date(),
    season,
    prevStandings: cur !== undefined && prev?.season === cur - 1 ? prev.data ?? [] : [],
    scores: scores?.games ?? [],
    standings: standings?.standings ?? [],
    players: players?.players ?? [],
    matches: schedule?.matches ?? [],
    events: events?.items ?? [],
    sheets,
  });
  const items = await writeNews(digest);
  const edition: NewsEdition = { generatedAt: new Date().toISOString(), items };
  await kv.set(NEWS_LATEST_KEY, edition);
  await kv.lpush(HISTORY_KEY, edition);
  await kv.ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1);
  return { edition, digest: digest.text };
}

/**
 * いまの号と、過去の号（offset 番目から HISTORY_PAGE 号ぶん）。
 * history の先頭はいまの号と同じなので、過去の号は1つずらして読む。
 */
export async function loadNews(offset = 0): Promise<{ latest: NewsEdition | null; history: NewsEdition[]; total: number }> {
  const start = 1 + Math.max(0, offset);
  const [latest, history, len] = await Promise.all([
    kv.get<NewsEdition>(NEWS_LATEST_KEY).catch(() => null),
    kv.lrange<NewsEdition>(HISTORY_KEY, start, start + HISTORY_PAGE - 1).catch(() => []),
    kv.llen(HISTORY_KEY).catch(() => 0),
  ]);
  return { latest: latest ?? null, history: history ?? [], total: Math.max(0, (len ?? 0) - 1) };
}
