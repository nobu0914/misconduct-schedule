"use client";

import { useEffect, useState } from "react";
import { EVENTS_URL, MHL_URL, eventsHref, mhlHref } from "@/lib/siteLinks";

// 2つのサイト（MHL / CxC と ジャンプインホッケー）を行き来する切り替えバー。どちらのサイトでも全ページの一番上に出す（ユーザー指示 10/7）
const SITES = [
  { key: "mhl", label: "MHL / CxC", on: "text-white border-blue-500" },
  { key: "events", label: "ジャンプインホッケー", on: "text-white border-emerald-500" },
] as const;

export default function SiteSwitcher({ current }: { current: "mhl" | "events" }) {
  // 下のヘッダーと左端をそろえる（MHL は max-w-5xl、イベントは max-w-3xl）
  const width = current === "mhl" ? "max-w-5xl" : "max-w-3xl";
  // これからのイベントの件数（MHL 側から見たときに、告知があることが分かるように）
  const [upcoming, setUpcoming] = useState(0);
  // リンク先はブラウザで決める（ホーム画面の Web アプリなら同じドメインのまま。src/lib/siteLinks.ts）
  const [hrefs, setHrefs] = useState<Record<string, string>>({ mhl: MHL_URL, events: EVENTS_URL });
  useEffect(() => {
    setHrefs({ mhl: mhlHref(), events: eventsHref() });
  }, []);
  useEffect(() => {
    fetch("/api/site-events")
      .then((r) => r.json())
      .then((d) => setUpcoming(typeof d.upcoming === "number" ? d.upcoming : 0))
      .catch(() => {});
  }, []);

  return (
    <nav aria-label="サイトの切り替え" className="bg-gray-950 border-b border-gray-800">
      <div className={`${width} mx-auto px-4 flex items-stretch gap-1 text-xs`}>
        <span className="self-center pr-2 text-[10px] text-gray-500 font-semibold tracking-wider">Rinnavi</span>
        {SITES.map((s) =>
          s.key === current ? (
            <span key={s.key} aria-current="page" className={`px-3 py-2 border-b-2 font-semibold ${s.on}`}>
              {s.label}
            </span>
          ) : (
            <a
              key={s.key}
              href={hrefs[s.key]}
              data-feature={`サイト切り替え > ${current === "mhl" ? "MHL" : "events"} → ${s.label}`}
              className="px-3 py-2 border-b-2 border-transparent text-gray-400 hover:text-white flex items-center gap-1.5"
            >
              {s.label}
              {s.key === "events" && upcoming > 0 && (
                <span className="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold leading-none flex items-center justify-center">
                  {upcoming}
                </span>
              )}
              <span aria-hidden className="text-gray-600">›</span>
            </a>
          )
        )}
      </div>
    </nav>
  );
}
