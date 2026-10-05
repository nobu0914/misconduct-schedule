"use client";

// リーグニュース（週1回、金曜の朝に AI が書く）。ゲーム情報の上の枠から来る
import Link from "next/link";
import { useEffect, useState } from "react";
import type { NewsEdition, NewsItem } from "@/lib/leagueNews";
import { NEWS_TAG_STYLE, newsDate } from "@/components/newsStyle";

function Article({ it, id }: { it: NewsItem; id?: string }) {
  const external = it.link?.href.startsWith("http");
  return (
    <article id={id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${NEWS_TAG_STYLE[it.tag] ?? NEWS_TAG_STYLE["リーグ"]}`}>{it.tag}</span>
      <h2 className="text-base font-bold text-white leading-snug">{it.title}</h2>
      <p className="text-sm text-gray-300 leading-relaxed">{it.body}</p>
      {it.link &&
        (external ? (
          <a href={it.link.href} target="_blank" rel="noopener noreferrer" data-feature={`記事のリンク > ${it.link.label}`} className="inline-block text-xs text-blue-400">
            {it.link.label} ↗
          </a>
        ) : (
          <Link href={it.link.href} data-feature={`記事のリンク > ${it.link.label}`} className="inline-block text-xs text-blue-400">
            {it.link.label} →
          </Link>
        ))}
    </article>
  );
}

export default function NewsPage() {
  const [latest, setLatest] = useState<NewsEdition | null>(null);
  const [history, setHistory] = useState<NewsEdition[]>([]);
  // 過去の号の総数（「もっと見る」で続きを読む）
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openPast, setOpenPast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => {
        setLatest(d.latest ?? null);
        setHistory(d.history ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 枠の見出しから来たとき、その記事まで動かす（読み込み後に要素ができるため）
  useEffect(() => {
    if (!latest || !location.hash) return;
    // 固定ヘッダーの下に見出しが来るよう、ヘッダーの高さ分ずらす
    setTimeout(() => {
      const el = document.getElementById(location.hash.slice(1));
      if (!el) return;
      const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - header - 8, behavior: "smooth" });
    }, 100);
  }, [latest]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-xl font-bold text-white">📰 リーグニュース</h1>
        {latest && <span className="text-xs text-gray-500">{newsDate(latest.generatedAt)}</span>}
      </div>
      {loading && <p className="text-sm text-gray-500 py-10 text-center">読み込み中…</p>}
      {!loading && !latest && <p className="text-sm text-gray-500 py-10 text-center">まだニュースはありません。毎週金曜の朝に更新します。</p>}
      {latest?.items.map((it, i) => <Article key={i} it={it} id={`n${i}`} />)}
      {latest && (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          ※ 公式サイトの試合結果・順位・お知らせと、このサイトにアップロードされたスコア表をもとに、AI が毎週金曜の朝に書いています。
          内容に誤りがあれば<Link href="/contact" className="text-blue-400 underline">お問い合わせ</Link>からお知らせください。
        </p>
      )}
      {history.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold text-gray-300">過去のニュース</h2>
          {history.map((ed) => (
            <div key={ed.generatedAt} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenPast((k) => (k === ed.generatedAt ? null : ed.generatedAt))}
                data-feature="過去のニュースを開く"
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-200"
              >
                {newsDate(ed.generatedAt)}（{ed.items.length}本）
                <span className="text-xs text-gray-500">{openPast === ed.generatedAt ? "▲" : "▼"}</span>
              </button>
              {openPast === ed.generatedAt && (
                <div className="p-3 pt-0 space-y-2">
                  {ed.items.map((it, i) => (
                    <Article key={i} it={it} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {history.length < total && (
            <button
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                const d = await fetch(`/api/news?offset=${history.length}`)
                  .then((r) => r.json())
                  .catch(() => null);
                // 読んでいる間に新しい号が出ると境目がずれるので、同じ号は除く
                if (d?.history)
                  setHistory((cur) => [...cur, ...d.history.filter((x: NewsEdition) => !cur.some((c) => c.generatedAt === x.generatedAt))]);
                setLoadingMore(false);
              }}
              data-feature="過去のニュースをもっと見る"
              className="w-full py-2 text-xs text-blue-400"
            >
              {loadingMore ? "読み込み中…" : `もっと見る（残り ${total - history.length} 号）`}
            </button>
          )}
        </section>
      )}
      <Link href="/" className="block text-center text-sm text-blue-400 py-2">
        ← ゲーム情報へ
      </Link>
    </main>
  );
}
