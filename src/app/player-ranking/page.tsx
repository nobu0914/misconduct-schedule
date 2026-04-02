"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { PlayerStat } from "../api/player-stats/route";
import type { PrevPlayerStat } from "../api/prev-season-players/route";

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

function PlayerRankingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [prevPlayers, setPrevPlayers] = useState<PrevPlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

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

  // 前シーズンの同名・同ディビジョン選手を検索
  function findPrevPlayer(name: string, divisionLabel: string): PrevPlayerStat | undefined {
    if (!name) return undefined;
    const nameLower = name.toLowerCase();
    return prevPlayers.find((p) => p.name.toLowerCase() === nameLower && p.divisionLabel === divisionLabel);
  }

  useEffect(() => {
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    router.replace(`/player-ranking${qs}`, { scroll: false });
  }, [query, router]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, query]);

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-white mb-4">個人ランキング検索</h1>

        <input
          type="text"
          placeholder="選手名で検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-base"
        />

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <span className="text-gray-400">データ取得中...</span>
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <p className="text-center py-12 text-gray-500">「{query}」に一致する選手が見つかりません</p>
        )}

        {!loading && !query.trim() && (
          <p className="text-center py-12 text-gray-600 text-sm">選手名を入力してください</p>
        )}

        <div className="mt-4 space-y-4">
          {results.map((p, i) => {
            // ディビジョン内で自分より得点が多い選手の中で最低得点の選手を探す
            const divisionPlayers = players.filter(
              (x) => x.divisionLabel === p.divisionLabel
            );
            const abovePlayers = divisionPlayers
              .filter((x) => x.points > p.points)
              .sort((a, b) => a.points - b.points); // 昇順（一番近い上位者が先頭）
            const directlyAbove = abovePlayers[0] ?? null;
            const gap = directlyAbove ? directlyAbove.points - p.points : 0;

            // チーム内での自分より上位の選手
            const teamPlayers = players.filter(
              (x) => x.team === p.team && x.divisionLabel === p.divisionLabel
            );
            const aboveInTeam = teamPlayers
              .filter((x) => x.points > p.points)
              .sort((a, b) => a.points - b.points);
            const directlyAboveInTeam = aboveInTeam[0] ?? null;
            const teamGap = directlyAboveInTeam ? directlyAboveInTeam.points - p.points : 0;

            return (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* ヘッダー */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                  <span className={`${getDivisionColor(p.divisionLabel)} text-white text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0`}>
                    {p.divisionLabel}
                  </span>
                  <span className="text-white font-semibold">{p.name}</span>
                  <span className="text-gray-500 text-sm">#{p.jersey}</span>
                  <span className="text-gray-500 text-sm truncate">{p.team}</span>
                </div>

                <div className="px-4 py-3 space-y-3">
                  {/* 成績テーブル */}
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

                  {/* ディビジョンランキング */}
                  <div className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">ディビジョン内順位</span>
                      <span className="text-white font-bold text-lg">{p.divisionRank}<span className="text-gray-400 text-sm font-normal">位</span></span>
                    </div>

                    {p.divisionRank === 1 ? (
                      <p className="text-yellow-400 text-xs">ディビジョン得点1位</p>
                    ) : directlyAbove ? (
                      <div className="space-y-1 text-xs text-gray-400">
                        <p>
                          上位の
                          <span className="text-white mx-1">{directlyAbove.name}</span>
                          との差：
                          <span className="text-orange-400 font-semibold ml-1">+{gap}点</span>
                        </p>
                        <p className="text-gray-500">
                          あと<span className="text-white mx-1">{gap + 1}ゴール</span>または
                          <span className="text-white mx-1">{gap + 1}アシスト</span>で追い抜き可能
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* チーム内ランキング */}
                  <div className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">チーム内順位</span>
                      <span className="text-white font-bold text-lg">{p.teamRank}<span className="text-gray-400 text-sm font-normal">位</span></span>
                    </div>

                    {p.teamRank === 1 ? (
                      <p className="text-yellow-400 text-xs">チーム得点1位</p>
                    ) : directlyAboveInTeam ? (
                      <div className="space-y-1 text-xs text-gray-400">
                        <p>
                          上位の
                          <span className="text-white mx-1">{directlyAboveInTeam.name}</span>
                          との差：
                          <span className="text-orange-400 font-semibold ml-1">+{teamGap}点</span>
                        </p>
                        <p className="text-gray-500">
                          あと<span className="text-white mx-1">{teamGap + 1}ゴール</span>または
                          <span className="text-white mx-1">{teamGap + 1}アシスト</span>で追い抜き可能
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* 前シーズン（52nd）成績 */}
                  {(() => {
                    const prev = findPrevPlayer(p.name, p.divisionLabel);
                    if (!prev) return null;
                    const pointsDiff = p.points - prev.points;
                    const rankDiff = prev.divisionRank - p.divisionRank; // 正=順位上昇
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
                        {/* 前シーズン比較 */}
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

                  {/* 公式ランキングリンク */}
                  <div className="flex justify-end">
                    <a
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
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
        </div>
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
