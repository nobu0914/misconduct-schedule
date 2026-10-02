"use client";

import { useEffect, useMemo, useState } from "react";
import { parseSeasonNumber, seasonOrdinal } from "@/lib/season";
import { teamKey } from "@/lib/teamName";
import { playoffResult } from "@/lib/seasonAwards";
import {
  buildDivisionStats,
  countAdvantages,
  headToHead,
  radarAxes,
  type PlayerRow,
  type RadarAxis,
  type ScoreRow,
  type StandingRow,
  type TeamSeasonStats,
} from "@/lib/matchup";

interface SeasonData {
  standings: StandingRow[];
  scores: ScoreRow[];
  players: PlayerRow[];
}

export interface MatchupSelection {
  season?: number;
  a?: string;
  b?: string;
}

interface Props {
  divisions: string[];
  division: string;
  onDivisionChange: (division: string) => void;
  divisionColor: (division: string) => string;
  /** URL から復元した初期選択 */
  initial: MatchupSelection;
  /** URL に残すための通知 */
  onChange: (selection: MatchupSelection) => void;
}

const A_COLOR = { text: "text-blue-400", bg: "bg-blue-500", border: "border-blue-500" };
const B_COLOR = { text: "text-orange-400", bg: "bg-orange-500", border: "border-orange-500" };

function hasPlayedGame(d: SeasonData): boolean {
  return d.scores.some((g) => g.awayScore !== null && g.homeScore !== null);
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function TeamMatchup({ divisions, division, onDivisionChange, divisionColor, initial, onChange }: Props) {
  const [data, setData] = useState<Record<number, SeasonData>>({});
  const [currentSeason, setCurrentSeason] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(initial.season);
  const [teamA, setTeamA] = useState(initial.a ?? "");
  const [teamB, setTeamB] = useState(initial.b ?? "");

  // 今シーズン（公式ページ）と保存済みの過去シーズンをまとめて読む
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cur, curScores, curPlayers, pastIndex] = await Promise.all([
        getJson<{ standings?: StandingRow[]; season?: string }>("/api/standings"),
        getJson<{ games?: ScoreRow[] }>("/api/scores"),
        getJson<{ players?: PlayerRow[] }>("/api/player-stats"),
        getJson<{ season?: number; data?: StandingRow[]; available?: number[] }>("/api/past-standings"),
      ]);
      const next: Record<number, SeasonData> = {};
      const cn = parseSeasonNumber(cur?.season);
      if (cn !== undefined) {
        next[cn] = {
          standings: cur?.standings ?? [],
          scores: (curScores?.games ?? []).filter((g) => g.season === cur?.season),
          players: curPlayers?.players ?? [],
        };
      }
      const past = await Promise.all(
        (pastIndex?.available ?? []).map(async (n) => {
          const [st, sc, pl] = await Promise.all([
            n === pastIndex?.season
              ? Promise.resolve(pastIndex)
              : getJson<{ data?: StandingRow[] }>(`/api/past-standings?season=${n}`),
            getJson<{ games?: ScoreRow[] }>(`/api/past-scores?season=${n}`),
            getJson<{ players?: PlayerRow[] }>(`/api/prev-season-players?season=${n}`),
          ]);
          return [n, { standings: st?.data ?? [], scores: sc?.games ?? [], players: pl?.players ?? [] }] as const;
        })
      );
      for (const [n, d] of past) next[n] = d;
      if (cancelled) return;
      setData(next);
      setCurrentSeason(cn);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // データがあるシーズン（新しい順）。開幕直後の今シーズンは出さない
  const seasons = useMemo(
    () =>
      Object.keys(data)
        .map(Number)
        .filter((n) => data[n].standings.length > 0 || hasPlayedGame(data[n]))
        .sort((x, y) => y - x),
    [data]
  );
  const season = selectedSeason !== undefined && seasons.includes(selectedSeason) ? selectedSeason : seasons[0];
  const seasonData = season !== undefined ? data[season] : undefined;

  const stats = useMemo(
    () => (seasonData ? buildDivisionStats(division, seasonData.standings, seasonData.scores, seasonData.players) : []),
    [seasonData, division]
  );

  // 選択中のチームがこのシーズン・ディビジョンにいなければ上位から補う
  const a: TeamSeasonStats | undefined = stats.find((t) => t.key === teamKey(teamA)) ?? stats[0];
  const b: TeamSeasonStats | undefined =
    stats.find((t) => t.key === teamKey(teamB) && t.key !== a?.key) ?? stats.find((t) => t.key !== a?.key);

  const allScores = useMemo(() => Object.values(data).flatMap((d) => d.scores), [data]);
  const h2h = useMemo(() => (a && b ? headToHead(allScores, a.team, b.team) : undefined), [allScores, a, b]);
  const axes = useMemo(() => (a && b && h2h ? radarAxes(stats, a, b, h2h) : []), [stats, a, b, h2h]);
  const adv = countAdvantages(axes);

  useEffect(() => {
    onChange({ season: selectedSeason, a: a?.team, b: b?.team });
    // onChange は親の setState（安定）なので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, a?.team, b?.team]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (seasons.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">比較できるデータがまだありません。</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">チーム相性</h2>
        <p className="text-xs text-gray-500 mt-1">同じディビジョンの2チームを、シーズンの成績と直接対決で比べます。</p>
      </div>

      {/* シーズン */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 flex-shrink-0">シーズン</span>
        <div className="flex flex-wrap gap-2">
          {seasons.map((n) => (
            <button
              key={n}
              onClick={() => setSelectedSeason(n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                season === n ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"
              }`}
            >
              {seasonOrdinal(n)}
              {n === currentSeason ? "（今シーズン）" : ""}
            </button>
          ))}
        </div>
      </div>

      {/* ディビジョン */}
      <div className="flex flex-wrap gap-2">
        {divisions.map((div) => (
          <button
            key={div}
            onClick={() => onDivisionChange(div)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              division === div ? `${divisionColor(div)} text-white` : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            {div}
          </button>
        ))}
      </div>

      {stats.length < 2 || !a || !b ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {season !== undefined ? seasonOrdinal(season) : ""} の {division} は比べられるチームがありません。
        </p>
      ) : (
        <>
          {/* チーム選択 */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <TeamSelect stats={stats} value={a.key} onChange={(t) => setTeamA(t)} color={A_COLOR} />
            <button
              onClick={() => {
                setTeamA(b.team);
                setTeamB(a.team);
              }}
              className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
              aria-label="左右を入れ替える"
            >
              ⇄
            </button>
            <TeamSelect stats={stats} value={b.key} onChange={(t) => setTeamB(t)} color={B_COLOR} exclude={a.key} />
          </div>

          {/* 概要 */}
          <div className="grid grid-cols-2 gap-3">
            <TeamSummary team={a} color={A_COLOR} result={playoffResult(season, division, a.team)} />
            <TeamSummary team={b} color={B_COLOR} result={playoffResult(season, division, b.team)} />
          </div>

          {/* 八角形 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <Octagon axes={axes} />
            <p className="text-center text-sm text-gray-300 mt-1">
              8項目中 <span className={`${A_COLOR.text} font-bold`}>{a.team} {adv.a}</span>
              {" ・ "}
              <span className={`${B_COLOR.text} font-bold`}>{b.team} {adv.b}</span>
              {adv.even > 0 && <span className="text-gray-500">{" ・ "}互角 {adv.even}</span>}
            </p>
          </div>

          {/* 数値の比較 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {axes.map((x) => {
              const aWins = x.a - x.b >= 5;
              const bWins = x.b - x.a >= 5;
              return (
                <div key={x.key} className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 border-b border-gray-800 last:border-b-0">
                  <span className={`text-sm text-left ${aWins ? `${A_COLOR.text} font-bold` : "text-gray-300"}`}>{x.rawA}</span>
                  <span className="text-xs text-gray-500 text-center px-2" title={x.hint}>
                    {x.label}
                  </span>
                  <span className={`text-sm text-right ${bWins ? `${B_COLOR.text} font-bold` : "text-gray-300"}`}>{x.rawB}</span>
                </div>
              );
            })}
          </div>

          {/* 直接対決 */}
          {h2h && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">直接対決（全シーズン）</h3>
              {h2h.games.length === 0 ? (
                <p className="text-sm text-gray-500">保存されている試合の中に対戦はありません。</p>
              ) : (
                <div className="space-y-1.5">
                  {h2h.games.slice(0, 10).map((g, i) => {
                    const aIsAway = teamKey(g.awayTeam) === a.key;
                    const aScore = aIsAway ? g.awayScore : g.homeScore;
                    const bScore = aIsAway ? g.homeScore : g.awayScore;
                    return (
                      <div key={`${g.date}-${i}`} className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 text-xs w-24">
                          {g.date.slice(5)}（{g.season}）
                        </span>
                        <span className={`font-bold ${aScore > bScore ? A_COLOR.text : "text-gray-400"}`}>{aScore}</span>
                        <span className="text-gray-600">-</span>
                        <span className={`font-bold ${bScore > aScore ? B_COLOR.text : "text-gray-400"}`}>{bScore}</span>
                        <span className="text-xs text-gray-500 w-24 text-right">
                          {aScore > bScore ? `${a.team} 勝ち` : bScore > aScore ? `${b.team} 勝ち` : "引き分け"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-600">
            ※各項目はそのシーズン・ディビジョン内での相対評価（最高=100）。順位はレギュラーシーズン。直接対決は保存済みの全シーズン通算。
          </p>
        </>
      )}
    </div>
  );
}

function TeamSelect({
  stats,
  value,
  onChange,
  color,
  exclude,
}: {
  stats: TeamSeasonStats[];
  value: string;
  onChange: (team: string) => void;
  color: typeof A_COLOR;
  exclude?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(stats.find((t) => t.key === e.target.value)?.team ?? "")}
      className={`w-full min-w-0 bg-gray-900 border-2 ${color.border} rounded-lg px-2 py-2 text-sm text-white`}
    >
      {stats
        .filter((t) => t.key !== exclude)
        .map((t) => (
          <option key={t.key} value={t.key}>
            {t.rank ? `${t.rank}. ` : ""}
            {t.team}
          </option>
        ))}
    </select>
  );
}

function TeamSummary({
  team,
  color,
  result,
}: {
  team: TeamSeasonStats;
  color: typeof A_COLOR;
  /** プレイオフの公式結果（順位はレギュラーシーズンなので別に出す） */
  result?: "champion" | "runnerUp";
}) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-3 border-t-4 ${color.border}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-sm font-bold truncate ${color.text}`}>{team.team}</span>
        {result === "champion" && (
          <span className="flex-shrink-0 bg-yellow-600/30 text-yellow-300 text-[10px] px-1.5 py-0.5 rounded font-medium">優勝</span>
        )}
        {result === "runnerUp" && (
          <span className="flex-shrink-0 bg-gray-600/40 text-gray-300 text-[10px] px-1.5 py-0.5 rounded font-medium">準優勝</span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mt-1">
        {team.rank ? `${team.rank}位` : "—"}
        {team.totalTeams ? <span className="text-xs text-gray-500 font-normal"> / {team.totalTeams}チーム</span> : null}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        {team.wins}勝 {team.losses}敗 {team.ties}分 ・ {team.points}pt
      </div>
      {team.ace && (
        <div className="text-xs text-gray-500 mt-1 truncate">
          エース {team.ace.name}（{team.ace.points}pt）
        </div>
      )}
    </div>
  );
}

function Octagon({ axes }: { axes: RadarAxis[] }) {
  const c = 150;
  const r = 105;
  const n = axes.length;
  const angle = (i: number) => ((-90 + (i * 360) / n) * Math.PI) / 180;
  const point = (i: number, v: number) => [c + Math.cos(angle(i)) * (r * v) / 100, c + Math.sin(angle(i)) * (r * v) / 100];
  const polygon = (values: number[]) => values.map((v, i) => point(i, v).join(",")).join(" ");

  return (
    <svg viewBox="-40 -8 380 318" className="w-full max-w-[360px] mx-auto block" role="img" aria-label="チーム相性の八角形チャート">
      {[25, 50, 75, 100].map((level) => (
        <polygon key={level} points={polygon(axes.map(() => level))} fill="none" stroke="#374151" strokeWidth={1} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#374151" strokeWidth={1} />;
      })}
      <polygon points={polygon(axes.map((x) => x.b))} fill="rgba(249,115,22,0.22)" stroke="#fb923c" strokeWidth={2} />
      <polygon points={polygon(axes.map((x) => x.a))} fill="rgba(59,130,246,0.25)" stroke="#60a5fa" strokeWidth={2} />
      {axes.map((x, i) => {
        const [lx, ly] = point(i, 122);
        const cos = Math.cos(angle(i));
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <text key={x.key} x={lx} y={ly + 4} textAnchor={anchor} fontSize={12} fill="#d1d5db">
            {x.label}
          </text>
        );
      })}
    </svg>
  );
}
