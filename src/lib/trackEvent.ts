import { detectBrowser, detectDevice, getVisitorId, sendAnalytics } from "./analyticsClient";
import { FEATURE_MAX, pageLabelOf } from "./analyticsConstants";

const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/** 集計から除外した端末では送らない（sendAnalytics で判定） */
export function trackEvent(event: string, value: string) {
  sendAnalytics({ event, value });
}

/**
 * 機能の利用を記録する。feature は「機能 > 詳細」（例 "相性 > 共有"）。ページ名は今のパスから付ける。
 * 画面のボタンは data-feature 属性を付ければ PageTracker が自動で送るので、これはボタン以外（読み取り成功など）用。
 */
export function trackFeature(feature: string) {
  if (typeof window === "undefined") return;
  sendFeature(`${pageLabelOf(window.location.pathname)} > ${feature}`);
}

/** 機能の利用を送る（行動ログ用に端末IDなども添える）。value は「ページ > 機能 > 詳細」 */
export function sendFeature(value: string) {
  sendAnalytics({
    event: "feature",
    value: value.replace(/\s+/g, " ").slice(0, FEATURE_MAX),
    vid: getVisitorId() ?? undefined,
    device: detectDevice(),
    browser: detectBrowser(),
  });
}

/** 検索ワードなど入力中の値（入力が止まって1.5秒後に1回だけ送る） */
export function trackFeatureDebounced(key: string, feature: string, delay = 1500) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => trackFeature(feature), delay);
}

/** デバウンス付き（検索ワード用。入力が止まって1秒後に送信） */
export function trackEventDebounced(event: string, value: string, delay = 1000) {
  clearTimeout(timers[event]);
  if (!value.trim()) return;
  timers[event] = setTimeout(() => trackEvent(event, value.trim()), delay);
}
