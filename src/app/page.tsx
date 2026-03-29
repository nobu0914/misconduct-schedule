"use client";

import { useEffect, useState, useMemo } from "react";
import type { Match } from "./api/schedule/route";

const DIVISION_COLORS: Record<string, string> = {
  Platinum: "bg-purple-600",
  Gold: "bg-yellow-500",
  Silver: "bg-gray-400",
  Bronze: "bg-amber-700",
  Brass: "bg-yellow-700",
  Copper: "bg-orange-600",
  Iron: "bg-gray-600",
  Women: "bg-pink-500",
  "35": "bg-blue-500",
};

function getDivisionColor(division: string): string {
  for (const [key, color] of Object.entries(DIVISION_COLORS)) {
    if (division.includes(key)) return color;
  }
  return "bg-gray-500";
}

function formatDate(dateStr: string): { weekday: string; display: string } {
  const [year, month, day] = dateStr.split("/").map(Number);
  const d = new Date(year, month - 1, day);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[d.getDay()];
  return {
    weekday,
    display: `${year}年${month}月${day}日 (${weekday})`,
  };
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const [year, month, day] = dateStr.split("/").map(Number);
  return (
    today.getFullYear() === year &&
    today.getMonth() + 1 === month &&
    today.getDate() === day
  );
}

function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateStr.split("/").map(Number);
  const d = new Date(year, month - 1, day);
  return d >= today;
}

export default function SchedulePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const [selectedDivision, setSelectedDivision] = useState<string>("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/schedule")
      .then((r) => r.json())
      .then((data) => {
        setMatches(data.matches ?? []);
        setLastUpdated(data.lastUpdated ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("データの取得に失敗しました");
        setLoading(false);
      });
  }, []);

  const DIVISION_ORDER = [
    "Platinum",
    "Gold",
    "Silver",
    "Bronze",
    "Brass",
    "Copper",
    "Iron",
    "Women Gold",
    "35&Over",
  ];

  const divisions = useMemo(() => {
    const set = new Set(matches.map((m) => m.division).filter(Boolean));
    return Array.from(set).sort(
      (a, b) => DIVISION_ORDER.indexOf(a) - DIVISION_ORDER.indexOf(b)
    );
  }, [matches]);

  const months = useMemo(() => {
    const set = new Set(matches.map((m) => m.month));
    return Array.from(set);
  }, [matches]);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (selectedDivision !== "ALL" && m.division !== selectedDivision)
        return false;
      if (selectedMonth !== "ALL" && m.month !== selectedMonth) return false;
      if (showUpcomingOnly && !isUpcoming(m.date)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !m.awayTeam.toLowerCase().includes(q) &&
          !m.homeTeam.toLowerCase().includes(q) &&
          !m.division.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [matches, selectedDivision, selectedMonth, showUpcomingOnly, searchQuery]);

  // 日付ごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of filtered) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 rounded-lg p-2">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">MHL Schedule</h1>
              <p className="text-xs text-gray-400">
                Misconduct Hockey League 53rd Season
              </p>
            </div>
            {lastUpdated && (
              <span className="ml-auto text-xs text-gray-500">
                更新: {new Date(lastUpdated).toLocaleString("ja-JP")}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        {/* Search */}
        <input
          type="text"
          placeholder="チーム名・ディビジョンで検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        {/* Filter row */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Month filter */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">全月</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Division filter */}
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">全ディビジョン</option>
            {divisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Upcoming toggle */}
          <button
            onClick={() => setShowUpcomingOnly(!showUpcomingOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showUpcomingOnly
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            今後の試合のみ
          </button>

          <span className="ml-auto text-sm text-gray-400">
            {filtered.length} 試合
          </span>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 pb-12">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            <span className="ml-3 text-gray-400">スケジュールを取得中...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400 text-center">
            {error}
          </div>
        )}

        {!loading && !error && grouped.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            該当する試合がありません
          </div>
        )}

        {grouped.map(([date, dateMatches]) => {
          const { display } = formatDate(date);
          const today = isToday(date);

          return (
            <div key={date} className="mb-6">
              {/* Date header */}
              <div
                className={`flex items-center gap-3 mb-3 ${today ? "text-blue-400" : "text-gray-300"}`}
              >
                <h2 className="text-lg font-bold">{display}</h2>
                {today && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                    TODAY
                  </span>
                )}
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-sm text-gray-500">
                  {dateMatches.length}試合
                </span>
              </div>

              {/* Match cards */}
              <div className="space-y-2">
                {dateMatches.map((match, i) => (
                  <div
                    key={`${date}-${i}`}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors"
                  >
                    {/* モバイル: 2行レイアウト / デスクトップ: 1行レイアウト */}
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">

                      {/* 1行目(モバイル) / 左端(デスクトップ): 時間 + [モバイル時のみ] Division・リンク */}
                      <div className="flex items-center gap-3">
                        {/* Time */}
                        <div className="text-blue-400 font-mono font-semibold">
                          {match.timeStart}
                          {match.timeEnd && (
                            <span className="text-gray-500 text-sm"> ~ {match.timeEnd}</span>
                          )}
                        </div>

                        {/* モバイルのみ右寄せで Division・リンク */}
                        <div className="flex items-center gap-2 ml-auto sm:hidden">
                          {match.division && (
                            <span className={`${getDivisionColor(match.division)} text-white text-xs px-2 py-1 rounded-full font-medium`}>
                              {match.division}
                            </span>
                          )}
                          <a
                            href={match.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="ソースページを開く"
                            className="text-gray-500 hover:text-blue-400 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      </div>

                      {/* 2行目(モバイル) / 中央(デスクトップ): チーム名 */}
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="text-white font-medium truncate">
                          {match.awayTeam || "─"}
                        </span>
                        <span className="text-gray-500 text-sm flex-shrink-0">vs</span>
                        <span className="text-white font-medium truncate">
                          {match.homeTeam || "─"}
                        </span>
                      </div>

                      {/* デスクトップのみ: Division・リンク */}
                      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                        {match.division && (
                          <span className={`${getDivisionColor(match.division)} text-white text-xs px-2 py-1 rounded-full font-medium`}>
                            {match.division}
                          </span>
                        )}
                        <a
                          href={match.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ソースページを開く"
                          className="text-gray-500 hover:text-blue-400 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>

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
