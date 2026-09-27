/** アクセス解析で集計するページ。/api/track の受け入れ判定と /api/admin/analytics の集計で共有する */
export const TRACKED_PAGES = [
  "/",
  "/player-ranking",
  "/rental",
  "/events",
  "/contact",
  "/disclaimer",
  "/changelog",
] as const;

export const EVENT_TYPES = ["search", "card", "rank-search"] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * KVのキーに使う値なので、受け取った文字列をそのまま使わない。
 * 既知のページはそのまま、未知のパスは形式を検証したうえで長さを切り詰める
 * （将来ページが増えても集計は続くが、任意のキーは作らせない）。
 */
export function normalizeTrackedPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split("?")[0].split("#")[0];
  if ((TRACKED_PAGES as readonly string[]).includes(path)) return path;
  if (!/^\/[A-Za-z0-9/_-]{0,63}$/.test(path)) return null;
  return path;
}

export function isEventType(raw: unknown): raw is EventType {
  return typeof raw === "string" && (EVENT_TYPES as readonly string[]).includes(raw);
}
