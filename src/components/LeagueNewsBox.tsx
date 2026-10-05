"use client";

// ゲーム情報の上の「リーグニュース！」枠。見出しだけ並べて、タップで /news の記事へ
import Link from "next/link";
import { useEffect, useState } from "react";
import type { NewsEdition } from "@/lib/leagueNews";
import { NEWS_TAG_STYLE, newsDate } from "@/components/newsStyle";

export default function LeagueNewsBox() {
  const [news, setNews] = useState<NewsEdition | null>(null);
  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => setNews(d.latest ?? null))
      .catch(() => {});
  }, []);
  if (!news?.items.length) return null;
  return (
    <section className="max-w-5xl mx-auto px-4 pt-3">
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
          <span className="text-sm font-bold text-white">📰 リーグニュース！</span>
          <span className="text-[11px] text-gray-500">{newsDate(news.generatedAt)}</span>
          <Link href="/news" data-feature="リーグニュース > もっと見る" className="ml-auto text-xs text-blue-400">
            もっと見る →
          </Link>
        </div>
        <ul className="divide-y divide-gray-800/70">
          {news.items.slice(0, 4).map((it, i) => (
            <li key={i}>
              <Link
                href={`/news#n${i}`}
                data-feature={`リーグニュース > 記事を開く > ${it.title}`}
                className="flex items-center gap-2 px-3 py-2 active:bg-gray-800/60"
              >
                <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded ${NEWS_TAG_STYLE[it.tag] ?? NEWS_TAG_STYLE["リーグ"]}`}>{it.tag}</span>
                <span className="text-sm text-gray-100 truncate">{it.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
