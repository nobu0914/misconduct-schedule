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

  return (
    <div className="min-h-screen bg-gray-950">
      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} pullDistance={pullDistance} threshold={threshold} />

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
          {items.map((item, i) => (
            <a
              key={`${item.url}-${i}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors"
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
                  </div>
                  {item.excerpt && (
                    <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">{item.excerpt}</p>
                  )}
                </div>

                {/* External link icon */}
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
