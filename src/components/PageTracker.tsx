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

// 管理画面は数えない（滞在時間・クリックも）
const isAdmin = (path: string) => path.startsWith("/admin");

/**
 * アクセス解析の計測。PV・訪問者・端末・流入元・滞在時間・クリックを /api/track に送る。
 * 集計から除外した端末（管理画面にログインした端末など）では何も送らない（sendAnalytics 側で判定）。
 */
export default function PageTracker() {
  const pathname = usePathname();
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
      const el = (e.target as Element | null)?.closest?.("a, button, [data-track]");
      const path = lastPath.current || location.pathname;
      if (!el || isAdmin(path)) return;
      const label = (el.getAttribute("data-track") || el.getAttribute("aria-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      if (label) sendAnalytics({ event: "click", value: `${path}｜${label}` });
      // 機能ログ: data-feature を持つ要素（またはその親）を押したら「ページ > 機能 > 詳細」で記録
      const feature = (e.target as Element | null)?.closest?.("[data-feature]")?.getAttribute("data-feature");
      if (feature) sendAnalytics({ event: "feature", value: `${pageLabelOf(path)} > ${feature}`.slice(0, 100) });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
