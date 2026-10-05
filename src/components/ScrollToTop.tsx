"use client";

// ページを移ったら一番上から表示する。
// Next.js は新しいページの先頭が画面の上端に来るようにスクロールするが、固定ヘッダーの分を考えないため、
// 前のページを下までスクロールしてから移ると、先頭（データのタブなど）がヘッダーの裏に隠れていた。
// 戻る・進むのときはブラウザが元の位置に戻すので動かさない。
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function ScrollToTop() {
  const pathname = usePathname();
  const first = useRef(true);
  const backForward = useRef(false);
  useEffect(() => {
    const onPop = () => (backForward.current = true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (backForward.current) {
      backForward.current = false;
      return;
    }
    // 記事へのリンク（/news#n2 など）はそのページが自分で動かす
    if (!location.hash) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
