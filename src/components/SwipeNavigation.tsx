"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

const PAGE_ORDER = ["/", "/rental", "/events"];

export default function SwipeNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;

      // 水平方向のスワイプのみ判定（縦スクロールと区別）
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dy) > Math.abs(dx)) return;

      const currentIndex = PAGE_ORDER.indexOf(pathname);
      if (currentIndex === -1) return;

      if (dx < 0 && currentIndex < PAGE_ORDER.length - 1) {
        // 左スワイプ → 次のページ
        router.push(PAGE_ORDER[currentIndex + 1]);
      } else if (dx > 0 && currentIndex > 0) {
        // 右スワイプ → 前のページ
        router.push(PAGE_ORDER[currentIndex - 1]);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pathname, router]);

  return null;
}
