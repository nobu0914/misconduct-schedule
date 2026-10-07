// 2つのサイト（MHL / CxC と ジャンプインホッケー）のあいだのリンク（ブラウザ側）。
// iPhone のホーム画面から開いた Web アプリは、別のドメインへ移ると OS のブラウザ画面（×・アドレス・下のバー）がかぶさる。
// MHL のドメインで Web アプリとして開いているときは、イベントのページを同じドメインの /ev で開く（ユーザー指示 10/7）。
export const MHL_URL = "https://mhlcxc.rinnavi.com/";
export const EVENTS_URL = "https://events.rinnavi.com/";

/** ホーム画面から Web アプリとして開いているか */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const onEventsHost = () => typeof window !== "undefined" && location.hostname.startsWith("events.");

/** イベントのサイトへのリンク先 */
export function eventsHref(): string {
  if (typeof window === "undefined" || onEventsHost()) return EVENTS_URL;
  // MHL のドメインの /ev で見ているとき・Web アプリのときは、同じドメインのまま
  return location.pathname === "/ev" || location.pathname.startsWith("/ev/") || isStandalone() ? "/ev" : EVENTS_URL;
}

/** MHL のサイトへのリンク先（MHL のドメインにいれば同じドメインのトップ） */
export function mhlHref(): string {
  return typeof window === "undefined" || onEventsHost() ? MHL_URL : "/";
}
