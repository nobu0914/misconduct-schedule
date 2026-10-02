// アクセス解析のブラウザ側。PageTracker・trackEvent・管理画面から使う。
//
// - 端末ごとのランダムIDで訪問者・リピートを数える（個人は特定しない。localStorage が使えない環境では数えない）
// - 管理者の端末は「集計しない」にできる（管理画面にログインすると自動で除外）

import type { Browser, Device } from "./analyticsConstants";

const EXCLUDE_KEY = "rinnavi_no_track";
const VISITOR_KEY = "rinnavi_vid";
const LAST_ACTIVE_KEY = "rinnavi_last_active";

/** これだけ間が空いたら新しい訪問（セッション）とみなす */
export const SESSION_GAP_MS = 30 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** この端末のアクセスを集計から除外しているか */
export function isTrackingExcluded(): boolean {
  return storage()?.getItem(EXCLUDE_KEY) === "1";
}

export function setTrackingExcluded(excluded: boolean): void {
  const s = storage();
  if (!s) return;
  if (excluded) s.setItem(EXCLUDE_KEY, "1");
  else s.removeItem(EXCLUDE_KEY);
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // https 以外・古いブラウザ
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getVisitorId(): string | null {
  const s = storage();
  if (!s) return null;
  let id = s.getItem(VISITOR_KEY);
  if (!id) {
    id = randomId();
    s.setItem(VISITOR_KEY, id);
  }
  return id;
}

/** 最終操作時刻だけ更新する（ページを離れたとき。戻ってきたときの間隔をここから測る） */
export function markActive(now = Date.now()): void {
  storage()?.setItem(LAST_ACTIVE_KEY, String(now));
}

/** 前回の操作から間が空いているか（最終操作時刻は更新しない） */
export function sessionExpired(now = Date.now()): boolean {
  const s = storage();
  if (!s) return false;
  const last = Number(s.getItem(LAST_ACTIVE_KEY) ?? 0);
  return !last || now - last > SESSION_GAP_MS;
}

/** 前回の操作から間が空いていれば新しい訪問。呼ぶたびに最終操作時刻を更新する */
export function startsNewSession(now = Date.now()): boolean {
  const expired = sessionExpired(now);
  markActive(now);
  return expired;
}

export function detectDevice(): Device {
  const ua = navigator.userAgent;
  const touch = (navigator.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  // iPadOS の Safari は Mac と同じ UA を名乗るので、タッチ対応で見分ける
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android" : "Androidタブレット";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "Mac";
  return "その他";
}

export function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  // アプリ内ブラウザを先に見る（UA に Safari / Chrome も含むため）
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox|FxiOS/.test(ua)) return "Firefox";
  if (/Chrome|CriOS/.test(ua)) return "Chrome";
  if (/Safari/.test(ua)) return "Safari";
  return "その他";
}

/** 流入元。同じサイト内の移動は数えない */
export function referrerHost(): string {
  try {
    if (!document.referrer) return "direct";
    const host = new URL(document.referrer).hostname;
    return host === location.hostname ? "direct" : host;
  } catch {
    return "direct";
  }
}

/** アクセス解析に送る（除外中の端末は送らない）。ページを離れるときは sendBeacon を使う */
export function sendAnalytics(body: Record<string, unknown>, beacon = false): void {
  if (isTrackingExcluded()) return;
  const json = JSON.stringify(body);
  if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/track", new Blob([json], { type: "application/json" }));
    return;
  }
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {});
}
