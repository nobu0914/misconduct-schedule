"use client";

import { useEffect, useState, useCallback } from "react";
import type { EventItem } from "../api/events/route";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";

export default function EventsPage() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [selectedItem, setSelectedItem] = useState<EventItem | null>(null);

  const loadData = useCallback(async () => {
    const data = await fetch("/api/events").then((r) => r.json());
    setItems(data.items ?? []);
    setLastUpdated(data.lastUpdated ?? "");
  }, []);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const { pulling, refreshing, pullDistance, threshold } = usePullToRefresh(refresh);

  useEffect(() => {
    loadData()
      .catch(() => setError("データの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [loadData]);

  function handleCardClick(item: EventItem) {
    if (item.programs && item.programs.length > 0) {
      setSelectedItem(item);
    } else {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} pullDistance={pullDistance} threshold={threshold} />

      {/* プログラム詳細モーダル */}
      {selectedItem && selectedItem.programs && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSelectedItem(null)} />
          <div className="relative w-full sm:max-w-lg bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-700 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-sm truncate">{selectedItem.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selectedItem.dateLabel}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-gray-400 hover:text-white transition-colors p-1 ml-2 flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* プログラム一覧 */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {selectedItem.programs.map((prog, i) => (
                <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="text-blue-400 font-mono text-sm font-semibold flex-shrink-0">
                      {prog.dateTime.replace(/.*?(\d{1,2}:\d{2}-?\d{0,2}:?\d{0,2})/, "$1") || prog.dateTime}
                    </span>
                  </div>
                  <p className="text-white font-medium text-sm mb-1">{prog.name}</p>
                  <p className="text-xs text-gray-500 mb-1.5">
                    {prog.dateTime.replace(/\s*\d{1,2}:\d{2}.*$/, "")}
                  </p>
                  {prog.description && (
                    <p className="text-gray-400 text-xs leading-relaxed">{prog.description}</p>
                  )}
                </div>
              ))}
            </div>

            {/* フッター */}
            <div className="border-t border-gray-800 px-4 py-3 flex-shrink-0">
              <a
                href={selectedItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <span>公式サイトで見る</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {lastUpdated && (
        <div className="max-w-5xl mx-auto px-4 pt-2 text-right">
          <span className="text-xs text-gray-500">更新: {new Date(lastUpdated).toLocaleString("ja-JP")}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 pt-3 pb-1">
        <p className="text-xs text-gray-500">公式サイトの News Information を自動表示しています</p>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-4 pb-12">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            <span className="ml-3 text-gray-400">イベント情報を取得中...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400 text-center">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="text-center py-20 text-gray-500">イベント情報がありません</div>
        )}

        <div className="space-y-3">
          {items.map((item, i) => {
            const hasPrograms = item.programs && item.programs.length > 0;
            return (
              <div
                key={`${item.url}-${i}`}
                onClick={() => handleCardClick(item)}
                className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  {/* Date block */}
                  <div className="flex-shrink-0 text-center bg-gray-800 rounded-lg px-3 py-2 min-w-[72px]">
                    <div className="text-xs text-gray-400">{item.dateLabel.replace(/年(\d+)月(\d+)日/, (_,m,d) => `${m}/${d}`)}</div>
                    <div className="text-xs text-gray-500">{item.dateLabel.match(/(\d+)年/)?.[1]}</div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-medium leading-snug">{item.title}</span>
                      {item.isNew && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">NEW</span>
                      )}
                      {hasPrograms && (
                        <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                          {item.programs!.length}件
                        </span>
                      )}
                    </div>
                    {item.excerpt && (
                      <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">{item.excerpt}</p>
                    )}
                  </div>

                  {/* Icon */}
                  {hasPrograms ? (
                    <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
