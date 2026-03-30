"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RentalEntry } from "../api/rental/route";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("/").map(Number);
  const d = new Date(year, month - 1, day);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${year}年${month}月${day}日 (${weekdays[d.getDay()]})`;
}

function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day) >= today;
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const [year, month, day] = dateStr.split("/").map(Number);
  return today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day;
}

const MONTH_ORDER = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function RentalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [entries, setEntries] = useState<RentalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [copied, setCopied] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => searchParams.get("month") ?? "ALL");
  const [showUpcomingOnly, setShowUpcomingOnly] = useState<boolean>(() => searchParams.get("upcoming") !== "0");
  const [wednesdayOnly, setWednesdayOnly] = useState<boolean>(() => searchParams.get("wed") === "1");
  const [officialOnly, setOfficialOnly] = useState<boolean>(() => searchParams.get("official") === "1");

  // Sync state → URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedMonth !== "ALL") params.set("month", selectedMonth);
    if (!showUpcomingOnly) params.set("upcoming", "0");
    if (wednesdayOnly) params.set("wed", "1");
    if (officialOnly) params.set("official", "1");
    const qs = params.toString();
    router.replace(qs ? `/rental?${qs}` : "/rental", { scroll: false });
  }, [selectedMonth, showUpcomingOnly, wednesdayOnly, officialOnly, router]);

  const refresh = useCallback(async () => {
    const data = await fetch("/api/rental").then((r) => r.json());
    setEntries(data.entries ?? []);
    setLastUpdated(data.lastUpdated ?? "");
  }, []);
  const { pulling, refreshing, pullDistance, threshold } = usePullToRefresh(refresh);

  useEffect(() => {
    fetch("/api/rental")
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries ?? []);
        setLastUpdated(data.lastUpdated ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("データの取得に失敗しました");
        setLoading(false);
      });
  }, []);

  const months = useMemo(() => {
    const set = new Set(entries.map((e) => e.month));
    return Array.from(set).sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (selectedMonth !== "ALL" && e.month !== selectedMonth) return false;
      if (showUpcomingOnly && !isUpcoming(e.date)) return false;
      if (wednesdayOnly && !e.label.includes("水曜練習会")) return false;
      if (officialOnly && !e.isOfficial) return false;
      return true;
    });
  }, [entries, selectedMonth, showUpcomingOnly, wednesdayOnly, officialOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, RentalEntry[]>();
    for (const e of filtered) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const [ay, am, ad] = a.split("/").map(Number);
      const [by, bm, bd] = b.split("/").map(Number);
      return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
    });
  }, [filtered]);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} pullDistance={pullDistance} threshold={threshold} />

      {lastUpdated && (
        <div className="max-w-5xl mx-auto px-4 pt-2 text-right">
          <span className="text-xs text-gray-500">更新: {new Date(lastUpdated).toLocaleString("ja-JP")}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 pt-3">
        <p className="text-xs text-gray-500">ホッケー関係のレンタル情報だけを自動表示しています</p>
      </div>

      {/* Filters */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">全月</option>
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <button
            onClick={() => setShowUpcomingOnly(!showUpcomingOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showUpcomingOnly ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            今後のみ
          </button>

          <button
            onClick={() => { setWednesdayOnly(!wednesdayOnly); setOfficialOnly(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              wednesdayOnly ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            水曜練のみ
          </button>

          <button
            onClick={() => { setOfficialOnly(!officialOnly); setWednesdayOnly(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              officialOnly ? "bg-orange-500 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            公式のみ
          </button>

          {/* Share button */}
          <button
            onClick={handleShare}
            title="この検索条件のURLをコピー"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              copied ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white hover:border-gray-500"
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                コピー済み
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                共有
              </>
            )}
          </button>

          <span className="ml-auto text-sm text-gray-400">{filtered.length} 件</span>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 pb-12">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            <span className="ml-3 text-gray-400">レンタル情報を取得中...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400 text-center">
            {error}
          </div>
        )}

        {!loading && !error && grouped.length === 0 && (
          <div className="text-center py-20 text-gray-500">該当する情報がありません</div>
        )}

        {wednesdayOnly && (
          <a
            href="https://www.notion.so/2289672111d980c9b174d54766adc3d5"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-green-900/40 border border-green-700 rounded-xl px-4 py-3 mb-4 hover:bg-green-900/60 transition-colors group"
          >
            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-300 text-sm font-medium flex-1">水曜練習会とは？</span>
            <svg className="w-4 h-4 text-green-500 group-hover:text-green-300 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        {grouped.map(([date, dateEntries]) => {
          const today = isToday(date);
          return (
            <div key={date} className="mb-6">
              {/* Date header */}
              <div className={`flex items-center gap-3 mb-3 ${today ? "text-blue-400" : "text-gray-300"}`}>
                <h2 className="text-lg font-bold">{formatDate(date)}</h2>
                {today && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">TODAY</span>
                )}
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-sm text-gray-500">{dateEntries.length}件</span>
              </div>

              <div className="space-y-2">
                {dateEntries.map((entry, i) => (
                  <div
                    key={`${date}-${i}`}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      {/* 時間 */}
                      <div className="flex items-center gap-3">
                        <div className="text-blue-400 font-mono font-semibold flex-shrink-0">
                          {entry.timeStart}
                          <span className="text-gray-500 text-sm"> ~ {entry.timeEnd}</span>
                        </div>
                        <a
                          href={entry.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ソースページを開く"
                          className="ml-auto text-gray-500 hover:text-blue-400 transition-colors sm:hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>

                      {/* ラベル */}
                      <div className="flex-1 flex items-center gap-2 text-white min-w-0">
                        <span className="font-medium truncate">{entry.label}</span>
                        {entry.isOfficial && (
                          <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">公式</span>
                        )}
                      </div>

                      <a
                        href={entry.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="ソースページを開く"
                        className="hidden sm:block text-gray-500 hover:text-blue-400 transition-colors flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

export default function RentalPage() {
  return (
    <Suspense>
      <RentalContent />
    </Suspense>
  );
}
