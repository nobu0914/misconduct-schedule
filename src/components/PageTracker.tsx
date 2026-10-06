"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  detectBrowser,
  detectDevice,
  getVisitorId,
  markActive,
  referrerHost,
  sendAnalytics,
  sessionExpired,
  startsNewSession,
} from "@/lib/analyticsClient";
import { MAX_DWELL_SECONDS, pageLabelOf } from "@/lib/analyticsConstants";
import { sendFeature } from "@/lib/trackEvent";

// 管理画面は数えない（滞在時間・クリックも）
const isAdmin = (path: string) => path.startsWith("/admin");

/**
 * アクセス解析の計測。PV・訪問者・端末・流入元・滞在時間・クリックを /api/track に送る。
 * 集計から除外した端末（管理画面にログインした端末など）では何も送らない（sendAnalytics 側で判定）。
 */
/** prefix: イベントのサイト（events.rinnavi.com）は "/ev" を付けて送り、MHL のページと分けて数える */
export default function PageTracker({ prefix = "" }: { prefix?: string } = {}) {
  const raw = usePathname();
  const pathname = prefix && raw !== prefix && !raw.startsWith(`${prefix}/`) ? `${prefix}${raw === "/" ? "" : raw}` : raw;
  const lastPath = useRef("");
  // 滞在時間は画面が見えている間だけ数える
  const visibleSince = useRef<number | null>(null);
  const visibleMs = useRef(0);

  /** 今のページで見えていた秒数を確定して返し、数え直す */
  function takeDwellSeconds(): number {
    let ms = visibleMs.current;
    if (visibleSince.current !== null) ms += Date.now() - visibleSince.current;
    visibleMs.current = 0;
    visibleSince.current = document.visibilityState === "visible" ? Date.now() : null;
    return Math.min(Math.round(ms / 1000), MAX_DWELL_SECONDS);
  }

  function pageView(path: string, extra: Record<string, unknown> = {}) {
    const newSession = startsNewSession();
    sendAnalytics({
      path,
      // 共有リンクの中身（どの試合・チームか）も行動ログに残す
      query: location.search,
      vid: getVisitorId() ?? undefined,
      device: detectDevice(),
      browser: detectBrowser(),
      ...(newSession ? { session: true, ref: referrerHost() } : {}),
      ...extra,
    });
  }

  // ページ遷移ごとのPV（前のページの滞在時間を添える）
  useEffect(() => {
    if (pathname === lastPath.current) return;
    const prev = lastPath.current;
    lastPath.current = pathname;
    const sec = takeDwellSeconds();
    if (isAdmin(pathname)) return;
    pageView(pathname, prev && !isAdmin(prev) && sec > 0 ? { prev: { path: prev, sec } } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 画面を離れたら滞在時間を送る（閉じられても届くよう beacon）。時間が空いて戻ってきたら新しい訪問
  useEffect(() => {
    visibleSince.current = document.visibilityState === "visible" ? Date.now() : null;
    const onVisibility = () => {
      const path = lastPath.current;
      if (document.visibilityState === "hidden") {
        const sec = takeDwellSeconds();
        markActive();
        if (path && !isAdmin(path) && sec > 0) sendAnalytics({ dwell: { path, sec } }, true);
      } else {
        visibleSince.current = Date.now();
        if (path && !isAdmin(path) && sessionExpired()) pageView(path);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ボタン・リンクのタップ（どのページで何が押されたか）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const path = lastPath.current || location.pathname;
      if (isAdmin(path)) return;
      const el = (e.target as Element | null)?.closest?.("a, button, [data-track]");
      const label = (el?.getAttribute("data-track") || el?.getAttribute("aria-label") || el?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      if (label) sendAnalytics({ event: "click", value: `${path}｜${label}` });
      // 機能ログ: data-feature を持つ要素（またはその親）を押したら「ページ > 機能 > 詳細」で記録。
      // 試合カードのように button でない要素もあるので、上のクリック判定とは別に見る
      const target = e.target as Element | null;
      const featureEl = target?.closest?.("[data-feature]");
      // カードの中の別のリンク・ボタン（「ソースページを開く」など）を押したときは、カードの機能として数えない
      const inner = target?.closest?.("a, button");
      const nested = !!(inner && featureEl && inner !== featureEl && featureEl.contains(inner) && !inner.hasAttribute("data-feature"));
      const feature = nested ? null : featureEl?.getAttribute("data-feature");
      if (feature) sendFeature(`${pageLabelOf(path)} > ${feature}`);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
