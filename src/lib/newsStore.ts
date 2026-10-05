// リーグニュースの作成と保存（KV）。cron（金曜の朝）と管理画面の「今すぐ作り直す」から呼ぶ。
//
//   news:latest   いま表示している号
//   news:history  過去の号（新しい順・最大12号）

import { kv } from "@vercel/kv";
import type { ScoreSheet } from "./scoreSheet";
import { SHEET_LOG_KEY, type SheetLogEntry } from "./scoreSheetLog";
import { buildNewsDigest, writeNews, type NewsEdition } from "./leagueNews";

export const NEWS_LATEST_KEY = "news:latest";
const HISTORY_KEY = "news:history";
const HISTORY_MAX = 12;

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
  const [scores, standings, players, schedule, events, sheets] = await Promise.all([
    getJson<{ games?: [] }>(`${origin}/api/scores`),
    getJson<{ standings?: []; season?: string }>(`${origin}/api/standings`),
    getJson<{ players?: []; season?: string }>(`${origin}/api/player-stats`),
    getJson<{ matches?: [] }>(`${origin}/api/schedule`),
    getJson<{ items?: [] }>(`${origin}/api/events`),
    recentSheets(),
  ]);
  const digest = buildNewsDigest({
    now: new Date(),
    season: standings?.season ?? players?.season,
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

export async function loadNews(): Promise<{ latest: NewsEdition | null; history: NewsEdition[] }> {
  const [latest, history] = await Promise.all([
    kv.get<NewsEdition>(NEWS_LATEST_KEY).catch(() => null),
    kv.lrange<NewsEdition>(HISTORY_KEY, 0, HISTORY_MAX - 1).catch(() => []),
  ]);
  return { latest: latest ?? null, history: history ?? [] };
}
