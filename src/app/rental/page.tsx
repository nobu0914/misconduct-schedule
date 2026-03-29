"use client";

import { useEffect, useState, useMemo } from "react";
import type { RentalEntry } from "../api/rental/route";

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

export default function RentalPage() {
  const [entries, setEntries] = useState<RentalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true);
  const [wednesdayOnly, setWednesdayOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);

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

  // 月ごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, RentalEntry[]>();
    for (const e of filtered) {
      if (!map.has(e.month)) map.set(e.month, []);
      map.get(e.month)!.push(e);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b)
    );
  }, [filtered]);

  return (
    <div className="min-h-screen bg-gray-950">
      {lastUpdated && (
        <div className="max-w-5xl mx-auto px-4 pt-2 text-right">
          <span className="text-xs text-gray-500">更新: {new Date(lastUpdated).toLocaleString("ja-JP")}</span>
        </div>
      )}

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
              showUpcomingOnly
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            今後のみ
          </button>

          <button
            onClick={() => setWednesdayOnly(!wednesdayOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              wednesdayOnly
                ? "bg-green-600 text-white"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            水曜練習会のみ
          </button>

          <button
            onClick={() => setOfficialOnly(!officialOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              officialOnly
                ? "bg-orange-500 text-white"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            公式のみ
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

        {grouped.map(([month, monthEntries]) => (
          <div key={month} className="mb-8">
            {/* Month header */}
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-lg font-bold text-white">{month}</h2>
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-sm text-gray-500">{monthEntries.length}件</span>
              <a
                href={monthEntries[0].sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="ソースページを開く"
                className="text-gray-500 hover:text-blue-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            {/* Entries */}
            <div className="space-y-2">
              {monthEntries.map((entry, i) => {
                const today = isToday(entry.date);
                return (
                  <div
                    key={`${entry.date}-${i}`}
                    className={`bg-gray-900 border rounded-xl p-4 transition-colors ${
                      today ? "border-blue-700" : "border-gray-800 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      {/* Date */}
                      <div className={`text-sm font-medium flex-shrink-0 ${today ? "text-blue-400" : "text-gray-300"}`}>
                        {formatDate(entry.date)}
                        {today && <span className="ml-2 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">TODAY</span>}
                      </div>

                      {/* Time */}
                      <div className="text-blue-400 font-mono font-semibold flex-shrink-0">
                        {entry.timeStart}
                        <span className="text-gray-500 text-sm"> ~ {entry.timeEnd}</span>
                      </div>

                      {/* Label */}
                      <div className="flex-1 flex items-center gap-2 text-white text-sm">
                        <span>{entry.label}</span>
                        {entry.isOfficial && (
                          <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">公式</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
