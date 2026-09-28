"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { PlayerStat } from "../api/player-stats/route";
import type { PrevPlayerStat } from "../api/prev-season-players/route";
import type { PrevSeasonEntry } from "../api/prev-season/route";
import type { TeamStanding } from "../api/standings/route";
import type { GameScore } from "../api/scores/route";
import { seasonOrdinal, parseSeasonNumber } from "@/lib/season";
import { normalizeName } from "@/lib/teamName";

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

const DIVISIONS = ["Platinum", "Gold", "Silver", "Bronze", "Brass", "Copper", "Iron", "Women Gold", "Women Bronze", "35&Over"];

function getDivisionColor(division: string): string {
  for (const [key, color] of Object.entries(DIVISION_COLORS)) {
    if (division.includes(key)) return color;
  }
  return "bg-gray-500";
}

type Mode = "search" | "ranking" | "score";

function PlayerRankingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 今シーズン（公式ページから取得）。開幕直後はまだ空
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  // 過去シーズン（保存済み）。シーズン番号ごとに読み込んだ分だけ持つ
  const [pastPlayers, setPastPlayers] = useState<Record<number, PrevPlayerStat[]>>({});
  // データがある過去シーズン（新しい順）
  const [pastSeasonList, setPastSeasonList] = useState<number[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  // チームランキング: 今シーズン（公式ページから取得、開幕直後は空）と過去シーズン（保存済み）
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [pastTeams, setPastTeams] = useState<Record<number, PrevSeasonEntry[]>>({});
  const [pastTeamSeasonList, setPastTeamSeasonList] = useState<number[]>([]);
  const [pastTeamsLoading, setPastTeamsLoading] = useState(false);
  const [games, setGames] = useState<GameScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [standingsLoading, setStandingsLoading] = useState(false);
  // 0件でも取得済みとして扱う（件数で判定すると、開幕直後の空の順位表を取り直し続ける）
  const [standingsLoaded, setStandingsLoaded] = useState(false);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoresLoaded, setScoresLoaded] = useState(false);
  // 今シーズン（"54th" など）。APIが返すので表記を固定しない
  const [currentSeasonLabel, setCurrentSeasonLabel] = useState("");

  const [mode, setMode] = useState<Mode>(() => {
    const m = searchParams.get("mode");
    if (m === "search" || m === "ranking" || m === "score") return m;
    // 後方互換: 旧URL（?q=...）はそのまま個人ランク検索を開く
    if (searchParams.get("q")) return "search";
    return "ranking";
  });
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  // 検索対象: "current" = 今シーズン、数値 = その過去シーズン。
  // URLは ?season=53（旧URLの ?season=prev は前シーズンとして扱う）
  const [season, setSeason] = useState<"current" | number | "prev">(() => {
    const v = searchParams.get("season");
    if (v === "prev") return "prev";
    const n = Number(v);
    return v && Number.isInteger(n) ? n : "current";
  });
  const [selectedDivision, setSelectedDivision] = useState<string>(() => {
    const d = searchParams.get("div");
    return d && DIVISIONS.includes(d) ? d : "Platinum";
  });

  const currentSeasonNum = parseSeasonNumber(currentSeasonLabel);
  // 前年比に使うのは必ず「今シーズン − 1」（2シーズン離れたデータと比べない）
  const prevSeasonNum = currentSeasonNum !== undefined ? currentSeasonNum - 1 : undefined;
  const prevPlayers = prevSeasonNum !== undefined ? pastPlayers[prevSeasonNum] ?? [] : [];
  const selectedPastSeason = season === "prev" ? prevSeasonNum : season === "current" ? undefined : season;

  async function loadPastSeason(n: number) {
    const d = await fetch(`/api/prev-season-players?season=${n}`)
      .then((r) => r.json())
      .catch(() => ({ players: [] }));
    setPastPlayers((cur) => ({ ...cur, [n]: d.players ?? [] }));
    if (Array.isArray(d.available)) setPastSeasonList(d.available);
  }

  useEffect(() => {
    fetch("/api/player-stats")
      .then((r) => r.json())
      .then(async (d) => {
        setPlayers(d.players ?? []);
        setCurrentSeasonLabel(d.season ?? "");
        const current = parseSeasonNumber(d.season);
        if (current !== undefined) await loadPastSeason(current - 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 過去シーズンを選んだら、まだ読んでいなければ取得する
  useEffect(() => {
    if (selectedPastSeason === undefined || pastPlayers[selectedPastSeason] || pastLoading) return;
    setPastLoading(true);
    loadPastSeason(selectedPastSeason).finally(() => setPastLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPastSeason, pastPlayers, pastLoading]);

  async function loadPastTeams(n?: number) {
    const d = await fetch(`/api/past-standings${n !== undefined ? `?season=${n}` : ""}`)
      .then((r) => r.json())
      .catch(() => ({ data: [] }));
    if (typeof d.season === "number") setPastTeams((cur) => ({ ...cur, [d.season]: d.data ?? [] }));
    if (Array.isArray(d.available)) setPastTeamSeasonList(d.available);
  }

  // ranking モード初回ロード時に取得（今シーズンの順位表と、過去シーズンの一覧）
  useEffect(() => {
    if (mode === "ranking" && !standingsLoaded && !standingsLoading) {
      setStandingsLoading(true);
      Promise.all([
        fetch("/api/standings")
          .then((r) => r.json())
          .then((d) => {
            setStandings(d.standings ?? []);
            if (d.season) setCurrentSeasonLabel(d.season);
          })
          .catch(() => {}),
        loadPastTeams(),
      ]).finally(() => {
        setStandingsLoading(false);
        setStandingsLoaded(true);
      });
    }
    if (mode === "score" && !scoresLoaded && !scoresLoading) {
      setScoresLoading(true);
      fetch("/api/scores")
        .then((r) => r.json())
        .then((d) => setGames(d.games ?? []))
        .catch(() => {})
        .finally(() => {
          setScoresLoading(false);
          setScoresLoaded(true);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, standingsLoaded, scoresLoaded, standingsLoading, scoresLoading]);

  // 過去シーズンの順位を選んだら、まだ読んでいなければ取得する
  useEffect(() => {
    if (mode !== "ranking" || selectedPastSeason === undefined) return;
    if (pastTeams[selectedPastSeason] || pastTeamsLoading) return;
    setPastTeamsLoading(true);
    loadPastTeams(selectedPastSeason).finally(() => setPastTeamsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedPastSeason, pastTeams, pastTeamsLoading]);

  function findPrevPlayer(name: string, divisionLabel: string): PrevPlayerStat | undefined {
    // シーズンによって表記が微妙に違う（空白・全角・記号）ので正規化して比べる
    const key = normalizeName(name);
    if (!key) return undefined;
    return prevPlayers.find((p) => normalizeName(p.name) === key && p.divisionLabel === divisionLabel);
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode !== "ranking") params.set("mode", mode);
    if (mode === "search") {
      if (query) params.set("q", query);
    } else {
      if (selectedDivision !== "Platinum") params.set("div", selectedDivision);
    }
    // シーズンの選択は個人ランク・チームランキング・スコアで共通
    if (selectedPastSeason !== undefined) params.set("season", String(selectedPastSeason));
    const qs = params.toString();
    router.replace(`/player-ranking${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [mode, query, selectedPastSeason, selectedDivision, router]);

  const currentResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalizeName(query);
    return q ? players.filter((p) => normalizeName(p.name).includes(q)) : [];
  }, [players, query]);

  const pastResults = useMemo(() => {
    if (!query.trim() || selectedPastSeason === undefined) return [];
    const q = normalizeName(query);
    return q ? (pastPlayers[selectedPastSeason] ?? []).filter((p) => normalizeName(p.name).includes(q)) : [];
  }, [pastPlayers, selectedPastSeason, query]);

  const divisionStandings = useMemo(
    () => standings.filter((s) => s.divisionLabel === selectedDivision).sort((a, b) => a.rank - b.rank),
    [standings, selectedDivision]
  );

  // 過去シーズンの順位（保存済み）。52nd は勝敗・勝点が無く順位だけ
  const pastDivisionStandings = useMemo(
    () =>
      selectedPastSeason === undefined
        ? []
        : (pastTeams[selectedPastSeason] ?? [])
            .filter((s) => s.divisionLabel === selectedDivision)
            .sort((a, b) => a.rank - b.rank),
    [pastTeams, selectedPastSeason, selectedDivision]
  );

  // スコアは前シーズン（保存済み）・今シーズン・次シーズンが混在して返る。
  // 「今シーズン」は今シーズンの試合だけ、「過去シーズン」は選んだシーズンだけを出す
  // （次シーズンの日程は、そのシーズンが始まってから今シーズンとして出る）
  const scorePastSeasons = useMemo(() => {
    if (currentSeasonNum === undefined) return [];
    const set = new Set<number>();
    for (const g of games) {
      const n = parseSeasonNumber(g.season);
      if (n !== undefined && n < currentSeasonNum) set.add(n);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [games, currentSeasonNum]);

  const shownScoreSeason =
    selectedPastSeason !== undefined ? seasonOrdinal(selectedPastSeason) : currentSeasonLabel;

  const seasonGames = useMemo(
    () => (shownScoreSeason ? games.filter((g) => g.season === shownScoreSeason) : []),
    [games, shownScoreSeason]
  );

  const divisionGames = useMemo(
    () => seasonGames.filter((g) => g.divisionLabel === selectedDivision),
    [seasonGames, selectedDivision]
  );

  const gamesByDate = useMemo(() => {
    const map = new Map<string, GameScore[]>();
    for (const g of divisionGames) {
      const key = `${g.date} ${g.dayOfWeek}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    // 最新の日付が上に来るよう降順に並べる
    return Array.from(map.entries()).sort((a, b) => {
      const da = new Date(a[0].split(" ")[0]).getTime();
      const db = new Date(b[0].split(" ")[0]).getTime();
      return db - da;
    });
  }, [divisionGames]);

  // 「公式サイトで見る」の遷移先は、実際に表示しているスコア表のURLを使う
  const officialScoreUrl = useMemo(() => {
    const fromGames = divisionGames[0]?.sourceUrl;
    if (fromGames) return fromGames;
    const season = shownScoreSeason || currentSeasonLabel || games[0]?.season;
    if (!season) return "https://misconduct.co.jp/";
    const slug =
      selectedDivision === "Women Gold" ? "womengold"
      : selectedDivision === "Women Bronze" ? "womenbronze"
      : selectedDivision === "35&Over" ? "35over"
      : selectedDivision.toLowerCase();
    return `https://misconduct.co.jp/wordpress/wp-content/uploads/${season}_score_${slug}.htm`;
  }, [divisionGames, games, selectedDivision, shownScoreSeason, currentSeasonLabel]);

  const showingCurrent = selectedPastSeason === undefined;
  // 今シーズンがまだ空（開幕直後で公式に未掲載）
  const currentEmpty = showingCurrent && !loading && players.length === 0;
  const results = showingCurrent ? currentResults : pastResults;
  const noResults = !loading && !pastLoading && !currentEmpty && query.trim() && results.length === 0;

  // 「今シーズン」と「過去シーズン（保存済み）」の切り替え。個人ランク・チームランキング共通
  function renderSeasonPicker(pastList: number[]) {
    return (
      <div className="mt-3 space-y-2">
        <button
          onClick={() => setSeason("current")}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            showingCurrent
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 border border-gray-700"
          }`}
        >
          {currentSeasonLabel ? `今シーズン（${currentSeasonLabel}）` : "今シーズン"}
        </button>
        {pastSeasonList.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 flex-shrink-0">過去シーズン</span>
            <div className="flex flex-wrap gap-2">
              {pastSeasonList.map((n) => (
                <button
                  key={n}
                  onClick={() => setSeason(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedPastSeason === n
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 border border-gray-700"
                  }`}
                >
                  {seasonOrdinal(n)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

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

            {renderSeasonPicker(pastSeasonList)}

            {selectedPastSeason === 52 && (
              <p className="text-xs text-gray-500 mt-2">※ 過去データの履歴が一部破損しており、検索しても出てこない場合があります</p>
            )}

            {currentEmpty && (
              <p className="text-center py-12 text-gray-500 text-sm">
                {currentSeasonLabel || "今シーズン"} の個人成績はまだありません。<br />
                公式サイトに掲載されると表示されます。
              </p>
            )}

            {(loading || pastLoading) && (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="text-gray-400">データ取得中...</span>
              </div>
            )}

            {noResults && (
              <p className="text-center py-12 text-gray-500">「{query}」に一致する選手が見つかりません</p>
            )}

            {!loading && !currentEmpty && !query.trim() && (
              <p className="text-center py-12 text-gray-600 text-sm">選手名を入力してください</p>
            )}

            <div className="mt-4 space-y-4">
              {showingCurrent && currentResults.map((p, i) => {
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
                            <p className="text-gray-400 text-xs">前シーズン（{prevSeasonNum !== undefined ? seasonOrdinal(prevSeasonNum) : ""}）</p>
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

              {!showingCurrent && pastResults.map((p, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                    <span className={`${getDivisionColor(p.divisionLabel)} text-white text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0`}>
                      {p.divisionLabel}
                    </span>
                    <span className="text-white font-semibold">{p.name}</span>
                    <span className="text-gray-500 text-sm">#{p.jersey}</span>
                    <span className="text-gray-500 text-sm truncate">{p.team}</span>
                    {selectedPastSeason !== undefined && (
                      <span className="ml-auto text-gray-500 text-xs flex-shrink-0">{seasonOrdinal(selectedPastSeason)}</span>
                    )}
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

            <div className="mb-3">
              {renderSeasonPicker(mode === "ranking" ? pastTeamSeasonList : scorePastSeasons)}
            </div>

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
            {((showingCurrent && !standingsLoaded) ||
              (!showingCurrent && pastTeamsLoading && !pastTeams[selectedPastSeason!])) && (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="text-gray-400">ランキング取得中...</span>
              </div>
            )}

            {showingCurrent && standingsLoaded && standings.length === 0 && (
              <p className="text-center py-12 text-gray-500 text-sm">
                {currentSeasonLabel || "今シーズン"} の順位はまだありません。<br />
                公式サイトに掲載されると表示されます。
              </p>
            )}

            {showingCurrent && divisionStandings.length === 0 && standings.length > 0 && (
              <p className="text-center py-12 text-gray-500">このディビジョンのデータはありません</p>
            )}

            {!showingCurrent && pastTeams[selectedPastSeason!] && pastDivisionStandings.length === 0 && (
              <p className="text-center py-12 text-gray-500">
                {seasonOrdinal(selectedPastSeason!)} のこのディビジョンのデータはありません
              </p>
            )}

            {!showingCurrent && pastDivisionStandings.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-800">
                  {seasonOrdinal(selectedPastSeason!)} シーズン 最終順位
                </div>
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
                      {pastDivisionStandings.map((s) => (
                        <tr key={`${s.divisionLabel}-${s.team}`} className="border-b border-gray-800 last:border-b-0">
                          <td className="py-2 px-2 text-center text-white font-semibold">{s.rank}</td>
                          <td className="py-2 px-2 text-white">{s.team}</td>
                          <td className="py-2 px-2 text-center text-gray-300">{s.gp ?? "-"}</td>
                          <td className="py-2 px-1 text-center text-green-400">{s.wins ?? "-"}</td>
                          <td className="py-2 px-1 text-center text-red-400">{s.losses ?? "-"}</td>
                          <td className="py-2 px-1 text-center text-gray-400">{s.ties ?? "-"}</td>
                          <td className="py-2 px-2 text-center text-white font-bold">{s.points ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {showingCurrent && divisionStandings.length > 0 && (
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
              {showingCurrent && divisionStandings[0]?.sourceUrl && (
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
            {!scoresLoaded && (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="text-gray-400">スコア取得中...</span>
              </div>
            )}

            {scoresLoaded && seasonGames.length === 0 && (
              <p className="text-center py-12 text-gray-500 text-sm">
                {showingCurrent ? (
                  <>
                    {currentSeasonLabel || "今シーズン"} のスコアはまだありません。<br />
                    公式サイトに掲載されると表示されます。
                  </>
                ) : (
                  <>{shownScoreSeason} のスコアはありません</>
                )}
              </p>
            )}

            {scoresLoaded && seasonGames.length > 0 && gamesByDate.length === 0 && (
              <p className="text-center py-12 text-gray-500">このディビジョンのデータはありません</p>
            )}

            <div className="space-y-4">
              {gamesByDate.map(([dateKey, gs]) => (
                <div key={dateKey}>
                  <div className="text-xs text-gray-400 mb-2 font-medium">{dateKey}</div>
                  <div className="space-y-2">
                    {gs.map((g) => (
                      <div key={`${g.sourceUrl}-${g.gameNo}`} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
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
                href={officialScoreUrl}
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
