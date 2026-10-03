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

// click: ボタン・リンクのタップ（値は「ページ｜要素の文言」）
// feature: どの機能を使ったか（値は「ページ > 機能 > 詳細」。管理画面で階層にして集計する）
export const EVENT_TYPES = ["search", "card", "rank-search", "click", "feature"] as const;

/** 機能ログのページ名（パスから） */
export function pageLabelOf(path: string): string {
  if (path === "/") return "ゲーム情報";
  if (path.startsWith("/player-ranking")) return "データ";
  if (path.startsWith("/rental")) return "リンク予定";
  if (path.startsWith("/events")) return "イベント";
  if (path.startsWith("/contact")) return "お問い合わせ";
  return path;
}

/** 端末の種類。判定はブラウザ側（iPad は Mac と同じ UA なのでタッチ対応で見分ける） */
export const DEVICES = ["iPhone", "iPad", "Android", "Androidタブレット", "Windows", "Mac", "その他"] as const;
export const BROWSERS = ["Safari", "Chrome", "Edge", "Firefox", "LINE", "Instagram", "Facebook", "その他"] as const;

export type Device = (typeof DEVICES)[number];
export type Browser = (typeof BROWSERS)[number];

export function isDevice(raw: unknown): raw is Device {
  return typeof raw === "string" && (DEVICES as readonly string[]).includes(raw);
}

export function isBrowser(raw: unknown): raw is Browser {
  return typeof raw === "string" && (BROWSERS as readonly string[]).includes(raw);
}

/** 端末ごとのランダムID（個人は特定しない）。KVのキーに使うので形式を限定する */
export function isVisitorId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9-]{8,64}$/.test(raw);
}

/** 流入元（参照元のホスト名、または "direct"）。KVのハッシュのフィールドなので形式を限定する */
export function normalizeReferrer(raw: unknown): string | null {
  if (raw === "direct") return "direct";
  if (typeof raw !== "string") return null;
  const host = raw.toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9.-]{1,60}$/.test(host) ? host : null;
}

/** 1回の滞在として数える上限（タブを開きっぱなしにした分で平均が崩れないように） */
export const MAX_DWELL_SECONDS = 30 * 60;

/** 来訪日数の区分（リピート回数の分布） */
export const VISIT_BUCKETS = ["1日", "2〜3日", "4〜9日", "10日以上"] as const;

export function visitBucket(days: number): (typeof VISIT_BUCKETS)[number] {
  if (days <= 1) return "1日";
  if (days <= 3) return "2〜3日";
  if (days <= 9) return "4〜9日";
  return "10日以上";
}

/** 日本時間の時（0〜23）。時間帯別のアクセスに使う */
export function jstHour(now: Date = new Date()): number {
  return (now.getUTCHours() + 9) % 24;
}

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
