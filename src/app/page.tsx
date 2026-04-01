"use client";

import { useEffect, useState, useMemo, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Match } from "./api/schedule/route";
import type { TeamStanding } from "./api/standings/route";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";

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

const DIVISION_ORDER = [
  "Platinum", "Gold", "Silver", "Bronze", "Brass", "Copper", "Iron", "Women Gold", "35&Over",
];

function ScheduleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<Record<string, TeamStanding>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Init filter state from URL params
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>(() => {
    const d = searchParams.get("div");
    return d ? d.split(",").filter(Boolean) : [];
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(() => searchParams.get("month") ?? "ALL");
  const [showUpcomingOnly, setShowUpcomingOnly] = useState<boolean>(() => searchParams.get("upcoming") !== "0");
  const [searchQuery, setSearchQuery] = useState<string>(() => searchParams.get("q") ?? "");

  const [divisionOpen, setDivisionOpen] = useState(false);
  const divisionRef = useRef<HTMLDivElement>(null);

  // Sync filter state → URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedDivisions.length > 0) params.set("div", selectedDivisions.join(","));
    if (selectedMonth !== "ALL") params.set("month", selectedMonth);
    if (!showUpcomingOnly) params.set("upcoming", "0");
    if (searchQuery) params.set("q", searchQuery);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [selectedDivisions, selectedMonth, showUpcomingOnly, searchQuery, router]);

  function buildStandingsMap(list: TeamStanding[]): Record<string, TeamStanding> {
    const map: Record<string, TeamStanding> = {};
    for (const s of list) map[s.team] = s;
    return map;
  }

  // スケジュール側のチーム名（例: "SAKURA (A)"）を standings のチーム名と照合
  function findStanding(scheduleName: string): TeamStanding | undefined {
    if (!scheduleName) return undefined;
    // 完全一致
    if (standings[scheduleName]) return standings[scheduleName];
    // 括弧内のサブ情報を除いた名前で照合（例: "Dark Sales (B)" → "Dark Sales"）
    const baseName = scheduleName.replace(/\s*\(.*?\)\s*/g, "").trim();
    if (baseName !== scheduleName && standings[baseName]) return standings[baseName];
    // 大文字小文字を無視して照合（例: "Dark Sales" vs "Dark sales"）
    const baseNameLower = baseName.toLowerCase();
    for (const val of Object.values(standings)) {
      if (val.team.toLowerCase() === baseNameLower) return val;
    }
    return undefined;
  }

  const refresh = useCallback(async () => {
    const [schedData, stData] = await Promise.all([
      fetch("/api/schedule").then((r) => r.json()),
      fetch("/api/standings").then((r) => r.json()).catch(() => ({ standings: [] })),
    ]);
    setMatches(schedData.matches ?? []);
    setLastUpdated(schedData.lastUpdated ?? "");
    setStandings(buildStandingsMap(stData.standings ?? []));
  }, []);
  const { pulling, refreshing, pullDistance, threshold } = usePullToRefresh(refresh);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (divisionRef.current && !divisionRef.current.contains(e.target as Node)) {
        setDivisionOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/schedule").then((r) => r.json()),
      fetch("/api/standings").then((r) => r.json()).catch(() => ({ standings: [] })),
    ])
      .then(([schedData, stData]) => {
        setMatches(schedData.matches ?? []);
        setLastUpdated(schedData.lastUpdated ?? "");
        setStandings(buildStandingsMap(stData.standings ?? []));
        setLoading(false);
      })
      .catch(() => {
        setError("データの取得に失敗しました");
        setLoading(false);
      });
  }, []);

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
      if (selectedDivisions.length > 0 && !selectedDivisions.includes(m.division)) return false;
      if (selectedMonth !== "ALL" && m.month !== selectedMonth) return false;
      if (showUpcomingOnly && !isUpcoming(m.date)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !m.awayTeam.toLowerCase().includes(q) &&
          !m.homeTeam.toLowerCase().includes(q) &&
          !m.division.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [matches, selectedDivisions, selectedMonth, showUpcomingOnly, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of filtered) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date)!.push(m);
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
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Division filter */}
          <div className="relative" ref={divisionRef}>
            <button
              onClick={() => setDivisionOpen((o) => !o)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 flex items-center gap-2 min-w-[140px]"
            >
              <span className="flex-1 text-left">
                {selectedDivisions.length === 0 ? "全ディビジョン" : `${selectedDivisions.length}件選択中`}
              </span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${divisionOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {divisionOpen && (
              <div className="absolute z-20 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[160px] py-1">
                <button
                  onClick={() => { setSelectedDivisions([]); setDivisionOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedDivisions.length === 0 ? "bg-blue-600 border-blue-600" : "border-gray-500"}`}>
                    {selectedDivisions.length === 0 && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  全ディビジョン
                </button>
                <div className="h-px bg-gray-700 mx-2 my-1" />
                {divisions.map((d) => {
                  const checked = selectedDivisions.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() =>
                        setSelectedDivisions((prev) =>
                          checked ? prev.filter((x) => x !== d) : [...prev, d]
                        )
                      }
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-blue-600 border-blue-600" : "border-gray-500"}`}>
                        {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming toggle */}
          <button
            onClick={() => setShowUpcomingOnly(!showUpcomingOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showUpcomingOnly ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            今後のみ
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

          <span className="ml-auto text-sm text-gray-400">{filtered.length} 試合</span>
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
              <div className={`flex items-center gap-3 mb-3 ${today ? "text-blue-400" : "text-gray-300"}`}>
                <h2 className="text-lg font-bold">{display}</h2>
                {today && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">TODAY</span>
                )}
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-sm text-gray-500">{dateMatches.length}試合</span>
              </div>

              <div className="space-y-2">
                {dateMatches.map((match, i) => (
                  <div
                    key={`${date}-${i}`}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex items-center gap-3">
                        <div className="text-blue-400 font-mono font-semibold">
                          {match.timeStart}
                          {match.timeEnd && (
                            <span className="text-gray-500 text-sm"> ~ {match.timeEnd}</span>
                          )}
                        </div>
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

                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="text-white font-medium truncate">{match.awayTeam || "─"}</span>
                          {(() => { const s = findStanding(match.awayTeam); return s ? <span className="text-xs text-gray-400">{s.rank}位 {s.wins}勝{s.losses}負{s.ties}引 {s.points}pt</span> : null; })()}
                        </div>
                        <span className="text-gray-500 text-sm flex-shrink-0">vs</span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-white font-medium truncate">{match.homeTeam || "─"}</span>
                          {(() => { const s = findStanding(match.homeTeam); return s ? <span className="text-xs text-gray-400">{s.rank}位 {s.wins}勝{s.losses}負{s.ties}引 {s.points}pt</span> : null; })()}
                        </div>
                      </div>

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

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleContent />
    </Suspense>
  );
}
