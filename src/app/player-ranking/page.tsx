"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { PlayerStat } from "../api/player-stats/route";
import type { PrevPlayerStat } from "../api/prev-season-players/route";
import type { TeamStanding } from "../api/standings/route";
import type { GameScore } from "../api/scores/route";

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

const DIVISIONS = ["Platinum", "Gold", "Silver", "Bronze", "Brass", "Copper", "Iron", "Women Gold", "35&Over"];

function getDivisionColor(division: string): string {
  for (const [key, color] of Object.entries(DIVISION_COLORS)) {
    if (division.includes(key)) return color;
  }
  return "bg-gray-500";
}

type SeasonMode = "current" | "prev";
type Mode = "search" | "ranking" | "score";

function PlayerRankingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [prevPlayers, setPrevPlayers] = useState<PrevPlayerStat[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [games, setGames] = useState<GameScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [scoresLoading, setScoresLoading] = useState(false);

  const [mode, setMode] = useState<Mode>(() => {
    const m = searchParams.get("mode");
    if (m === "search" || m === "ranking" || m === "score") return m;
    // 後方互換: 旧URL（?q=...）はそのまま個人ランク検索を開く
    if (searchParams.get("q")) return "search";
    return "ranking";
  });
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [season, setSeason] = useState<SeasonMode>(() => (searchParams.get("season") === "prev" ? "prev" : "current"));
  const [selectedDivision, setSelectedDivision] = useState<string>(() => {
    const d = searchParams.get("div");
    return d && DIVISIONS.includes(d) ? d : "Platinum";
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/player-stats").then((r) => r.json()),
      fetch("/api/prev-season-players").then((r) => r.json()).catch(() => ({ players: [] })),
    ])
      .then(([d, prev]) => {
        setPlayers(d.players ?? []);
        setPrevPlayers(prev.players ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ranking モード初回ロード時に取得
  useEffect(() => {
    if (mode === "ranking" && standings.length === 0 && !standingsLoading) {
      setStandingsLoading(true);
      fetch("/api/standings")
        .then((r) => r.json())
        .then((d) => setStandings(d.standings ?? []))
        .catch(() => {})
        .finally(() => setStandingsLoading(false));
    }
    if (mode === "score" && games.length === 0 && !scoresLoading) {
      setScoresLoading(true);
      fetch("/api/scores")
        .then((r) => r.json())
        .then((d) => setGames(d.games ?? []))
        .catch(() => {})
        .finally(() => setScoresLoading(false));
    }
  }, [mode, standings.length, games.length, standingsLoading, scoresLoading]);

  function findPrevPlayer(name: string, divisionLabel: string): PrevPlayerStat | undefined {
    if (!name) return undefined;
    const nameLower = name.toLowerCase();
    return prevPlayers.find((p) => p.name.toLowerCase() === nameLower && p.divisionLabel === divisionLabel);
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode !== "ranking") params.set("mode", mode);
    if (mode === "search") {
      if (query) params.set("q", query);
      if (season === "prev") params.set("season", "prev");
    } else {
      if (selectedDivision !== "Platinum") params.set("div", selectedDivision);
    }
    const qs = params.toString();
    router.replace(`/player-ranking${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [mode, query, season, selectedDivision, router]);

  const currentResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, query]);

  const prevResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return prevPlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [prevPlayers, query]);

  const divisionStandings = useMemo(
    () => standings.filter((s) => s.divisionLabel === selectedDivision).sort((a, b) => a.rank - b.rank),
    [standings, selectedDivision]
  );

  const divisionGames = useMemo(
    () => games.filter((g) => g.divisionLabel === selectedDivision),
    [games, selectedDivision]
  );

  const gamesByDate = useMemo(() => {
    const map = new Map<string, GameScore[]>();
    for (const g of divisionGames) {
      const key = `${g.date} ${g.dayOfWeek}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const da = new Date(a[0].split(" ")[0]).getTime();
      const db = new Date(b[0].split(" ")[0]).getTime();
      return da - db;
    });
  }, [divisionGames]);

  const results = season === "current" ? currentResults : prevResults;
  const noResults = !loading && query.trim() && results.length === 0;

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* モード切替トグル */}
        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1 mb-4">
          {(
            [
              { key: "ranking", label: "チームランキング" },
              { key: "score", label: "スコア" },
              { key: "search", label: "個人ランク" },
            ] as { key: Mode; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === t.key ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === "search" && (
          <>
            <h1 className="text-xl font-bold text-white mb-4">個人ランク</h1>

            <input
              type="text"
              placeholder="選手名で検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-base"
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setSeason("current")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  season === "current"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
              >
                今シーズン（53rd）
              </button>
              <button
                onClick={() => setSeason("prev")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  season === "prev"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
              >
                昨シーズン（52nd）
              </button>
            </div>

            {season === "prev" && (
              <p className="text-xs text-gray-500 mt-2">※ 過去データの履歴が一部破損しており、検索しても出てこない場合があります</p>
            )}

            {loading && (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="text-gray-400">データ取得中...</span>
              </div>
            )}

            {noResults && (
              <p className="text-center py-12 text-gray-500">「{query}」に一致する選手が見つかりません</p>
            )}

            {!loading && !query.trim() && (
              <p className="text-center py-12 text-gray-600 text-sm">選手名を入力してください</p>
            )}

            <div className="mt-4 space-y-4">
              {season === "current" && currentResults.map((p, i) => {
                const divisionPlayers = players.filter((x) => x.divisionLabel === p.divisionLabel);
                const abovePlayers = divisionPlayers
                  .filter((x) => x.points > p.points)
                  .sort((a, b) => a.points - b.points);
                const directlyAbove = abovePlayers[0] ?? null;
                const gap = directlyAbove ? directlyAbove.points - p.points : 0;

                const teamPlayers = players.filter((x) => x.team === p.team && x.divisionLabel === p.divisionLabel);
                const aboveInTeam = teamPlayers
                  .filter((x) => x.points > p.points)
                  .sort((a, b) => a.points - b.points);
                const directlyAboveInTeam = aboveInTeam[0] ?? null;
                const teamGap = directlyAboveInTeam ? directlyAboveInTeam.points - p.points : 0;

                return (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                      <span className={`${getDivisionColor(p.divisionLabel)} text-white text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0`}>
                        {p.divisionLabel}
                      </span>
                      <span className="text-white font-semibold">{p.name}</span>
                      <span className="text-gray-500 text-sm">#{p.jersey}</span>
                      <span className="text-gray-500 text-sm truncate">{p.team}</span>
                    </div>

                    <div className="px-4 py-3 space-y-3">
                      <div className="w-full border border-gray-700 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-800">
                              {["GP", "G", "A", "P", "PIM"].map((h) => (
                                <th key={h} className="py-1.5 text-center text-xs text-gray-400 font-medium">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="py-2 text-center text-white font-semibold">{p.gp}</td>
                              <td className="py-2 text-center text-green-400 font-semibold">{p.goals}</td>
                              <td className="py-2 text-center text-blue-400 font-semibold">{p.assists}</td>
                              <td className="py-2 text-center text-white font-bold text-base">{p.points}</td>
                              <td className="py-2 text-center text-gray-400 font-semibold">{p.pim}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-xs">ディビジョン内順位</span>
                          <span className="text-white font-bold text-lg">{p.divisionRank}<span className="text-gray-400 text-sm font-normal">位</span></span>
                        </div>
                        {p.divisionRank === 1 ? (
                          <p className="text-yellow-400 text-xs">ディビジョン得点1位</p>
                        ) : directlyAbove ? (
                          <div className="space-y-1 text-xs text-gray-400">
                            <p>上位の<span className="text-white mx-1">{directlyAbove.name}</span>との差：<span className="text-orange-400 font-semibold ml-1">+{gap}点</span></p>
                            <p className="text-gray-500">あと<span className="text-white mx-1">{gap + 1}ゴール</span>または<span className="text-white mx-1">{gap + 1}アシスト</span>で追い抜き可能</p>
                          </div>
                        ) : null}
                      </div>

                      <div className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-xs">チーム内順位</span>
                          <span className="text-white font-bold text-lg">{p.teamRank}<span className="text-gray-400 text-sm font-normal">位</span></span>
                        </div>
                        {p.teamRank === 1 ? (
                          <p className="text-yellow-400 text-xs">チーム得点1位</p>
                        ) : directlyAboveInTeam ? (
                          <div className="space-y-1 text-xs text-gray-400">
                            <p>上位の<span className="text-white mx-1">{directlyAboveInTeam.name}</span>との差：<span className="text-orange-400 font-semibold ml-1">+{teamGap}点</span></p>
                            <p className="text-gray-500">あと<span className="text-white mx-1">{teamGap + 1}ゴール</span>または<span className="text-white mx-1">{teamGap + 1}アシスト</span>で追い抜き可能</p>
                          </div>
                        ) : null}
                      </div>

                      {(() => {
                        const prev = findPrevPlayer(p.name, p.divisionLabel);
                        if (!prev) return null;
                        const pointsDiff = p.points - prev.points;
                        const rankDiff = prev.divisionRank - p.divisionRank;
                        return (
                          <div className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-2">
                            <p className="text-gray-400 text-xs">前シーズン（52nd）</p>
                            <div className="w-full border border-gray-700 rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-800">
                                    {["順位", "GP", "G", "A", "P", "PIM"].map((h) => (
                                      <th key={h} className="py-1 text-center text-xs text-gray-500 font-medium">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="py-1.5 text-center text-gray-300 font-semibold text-xs">{prev.divisionRank}位</td>
                                    <td className="py-1.5 text-center text-gray-400 text-xs">{prev.gp}</td>
                                    <td className="py-1.5 text-center text-gray-400 text-xs">{prev.goals}</td>
                                    <td className="py-1.5 text-center text-gray-400 text-xs">{prev.assists}</td>
                                    <td className="py-1.5 text-center text-gray-300 font-semibold text-xs">{prev.points}</td>
                                    <td className="py-1.5 text-center text-gray-500 text-xs">{prev.pim}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              {rankDiff !== 0 && (
                                <span className={rankDiff > 0 ? "text-green-400" : "text-red-400"}>
                                  順位 {rankDiff > 0 ? `↑${rankDiff}` : `↓${Math.abs(rankDiff)}`}
                                </span>
                              )}
                              <span className={pointsDiff > 0 ? "text-green-400" : pointsDiff < 0 ? "text-red-400" : "text-gray-500"}>
                                得点 {pointsDiff > 0 ? "+" : ""}{pointsDiff}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex justify-end">
                        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          全体ランキング（公式）
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}

              {season === "prev" && prevResults.map((p, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                    <span className={`${getDivisionColor(p.divisionLabel)} text-white text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0`}>
                      {p.divisionLabel}
                    </span>
                    <span className="text-white font-semibold">{p.name}</span>
                    <span className="text-gray-500 text-sm">#{p.jersey}</span>
                    <span className="text-gray-500 text-sm truncate">{p.team}</span>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    <div className="w-full border border-gray-700 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-800">
                            {["GP", "G", "A", "P", "PIM"].map((h) => (
                              <th key={h} className="py-1.5 text-center text-xs text-gray-400 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="py-2 text-center text-white font-semibold">{p.gp}</td>
                            <td className="py-2 text-center text-green-400 font-semibold">{p.goals}</td>
                            <td className="py-2 text-center text-blue-400 font-semibold">{p.assists}</td>
                            <td className="py-2 text-center text-white font-bold text-base">{p.points}</td>
                            <td className="py-2 text-center text-gray-400 font-semibold">{p.pim}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-xs">ディビジョン内順位</span>
                        <span className="text-white font-bold text-lg">{p.divisionRank}<span className="text-gray-400 text-sm font-normal">位</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {(mode === "ranking" || mode === "score") && (
          <>
            <h1 className="text-xl font-bold text-white mb-3">
              {mode === "ranking" ? "チームランキング" : "スコア"}
            </h1>

            {/* ディビジョン選択 */}
            <div className="flex flex-wrap gap-2 pb-2">
              {DIVISIONS.map((div) => (
                <button
                  key={div}
                  onClick={() => setSelectedDivision(div)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    selectedDivision === div
                      ? `${getDivisionColor(div)} text-white border-transparent`
                      : "bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500"
                  }`}
                >
                  {div}
                </button>
              ))}
            </div>
          </>
        )}

        {mode === "ranking" && (
          <div className="mt-4">
            {standingsLoading && standings.length === 0 && (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="text-gray-400">ランキング取得中...</span>
              </div>
            )}

            {!standingsLoading && divisionStandings.length === 0 && standings.length > 0 && (
              <p className="text-center py-12 text-gray-500">このディビジョンのデータはありません</p>
            )}

            {divisionStandings.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800 border-b border-gray-700">
                        <th className="py-2 px-2 text-center text-xs text-gray-400 font-medium w-10">順位</th>
                        <th className="py-2 px-2 text-left text-xs text-gray-400 font-medium">チーム</th>
                        <th className="py-2 px-2 text-center text-xs text-gray-400 font-medium">GP</th>
                        <th className="py-2 px-1 text-center text-xs text-gray-400 font-medium">W</th>
                        <th className="py-2 px-1 text-center text-xs text-gray-400 font-medium">L</th>
                        <th className="py-2 px-1 text-center text-xs text-gray-400 font-medium">T</th>
                        <th className="py-2 px-2 text-center text-xs text-gray-400 font-medium">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divisionStandings.map((s) => (
                        <tr key={`${s.divisionLabel}-${s.team}`} className="border-b border-gray-800 last:border-b-0">
                          <td className="py-2 px-2 text-center text-white font-semibold">
                            <div className="flex items-center justify-center gap-1">
                              <span>{s.rank}</span>
                              {s.rankChange > 0 && <span className="text-green-400 text-[10px]">↑{s.rankChange}</span>}
                              {s.rankChange < 0 && <span className="text-red-400 text-[10px]">↓{Math.abs(s.rankChange)}</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-white">{s.team}</td>
                          <td className="py-2 px-2 text-center text-gray-300">{s.gp}</td>
                          <td className="py-2 px-1 text-center text-green-400">{s.wins}</td>
                          <td className="py-2 px-1 text-center text-red-400">{s.losses}</td>
                          <td className="py-2 px-1 text-center text-gray-400">{s.ties}</td>
                          <td className="py-2 px-2 text-center text-white font-bold">{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                onClick={() => setMode("search")}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                個人ランクを検索する →
              </button>
              {divisionStandings[0]?.sourceUrl && (
                <a
                  href={divisionStandings[0].sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  公式サイトで見る ↗
                </a>
              )}
            </div>
          </div>
        )}

        {mode === "score" && (
          <div className="mt-4">
            {scoresLoading && games.length === 0 && (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="text-gray-400">スコア取得中...</span>
              </div>
            )}

            {!scoresLoading && gamesByDate.length === 0 && games.length > 0 && (
              <p className="text-center py-12 text-gray-500">このディビジョンのデータはありません</p>
            )}

            <div className="space-y-4">
              {gamesByDate.map(([dateKey, gs]) => (
                <div key={dateKey}>
                  <div className="text-xs text-gray-400 mb-2 font-medium">{dateKey}</div>
                  <div className="space-y-2">
                    {gs.map((g) => (
                      <div key={`${g.divisionLabel}-${g.gameNo}`} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5">
                          <span>#{g.gameNo}</span>
                          <span>{g.timeStart}〜{g.timeEnd}</span>
                          {!g.played && (
                            <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-[10px]">未消化</span>
                          )}
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <div className={`text-left ${g.played && g.awayScore! > g.homeScore! ? "text-white font-semibold" : "text-gray-300"}`}>
                            {g.awayTeam}
                          </div>
                          <div className="text-center font-mono">
                            {g.played ? (
                              <span className="text-white">
                                <span className={g.awayScore! > g.homeScore! ? "font-bold" : ""}>{g.awayScore}</span>
                                <span className="text-gray-500 mx-1.5">-</span>
                                <span className={g.homeScore! > g.awayScore! ? "font-bold" : ""}>{g.homeScore}</span>
                              </span>
                            ) : (
                              <span className="text-gray-600 text-xs">vs</span>
                            )}
                          </div>
                          <div className={`text-left ${g.played && g.homeScore! > g.awayScore! ? "text-white font-semibold" : "text-gray-300"}`}>
                            {g.homeTeam}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 text-center">
              <a
                href={`https://misconduct.co.jp/wordpress/wp-content/uploads/53rd_score_${
                  selectedDivision === "Women Gold" ? "womengold" : selectedDivision === "35&Over" ? "35over" : selectedDivision.toLowerCase()
                }.htm`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                公式サイトで見る ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayerRankingPage() {
  return (
    <Suspense>
      <PlayerRankingContent />
    </Suspense>
  );
}
