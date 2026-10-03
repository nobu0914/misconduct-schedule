"use client";

import { useEffect, useMemo, useState } from "react";
import { parseSeasonNumber, seasonOrdinal } from "@/lib/season";
import { teamKey } from "@/lib/teamName";
import { playoffResult } from "@/lib/seasonAwards";
import { trackFeature } from "@/lib/trackEvent";
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
  const [copied, setCopied] = useState(false);
  const [showBasis, setShowBasis] = useState(false);

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

  // 指定されたチーム（試合のモーダルや共有リンクから）がこのシーズン・ディビジョンにいないとき
  const missing = [teamA, teamB].filter((t) => t && !stats.some((x) => x.key === teamKey(t)));

  const allScores = useMemo(() => Object.values(data).flatMap((d) => d.scores), [data]);
  const h2h = useMemo(() => (a && b ? headToHead(allScores, a.team, b.team) : undefined), [allScores, a, b]);
  const axes = useMemo(() => (a && b && h2h ? radarAxes(stats, a, b, h2h) : []), [stats, a, b, h2h]);
  const adv = countAdvantages(axes);

  useEffect(() => {
    onChange({ season: selectedSeason, a: a?.team, b: b?.team });
    // onChange は親の setState（安定）なので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, a?.team, b?.team]);

  /** 開いた人にも同じ比較が出るリンク（シーズン・ディビジョン・2チームを含む）を共有する */
  async function handleShare() {
    if (!a || !b) return;
    const params = new URLSearchParams({ mode: "matchup", div: division });
    if (season !== undefined) params.set("season", String(season));
    params.set("a", a.team);
    params.set("b", b.team);
    const url = `${window.location.origin}/player-ranking?${params}`;
    const title = `チーム相性 ${a.team} vs ${b.team}（${season !== undefined ? seasonOrdinal(season) : ""} ${division}）`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // 共有シートを閉じただけ
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("このリンクをコピーしてください", url);
    }
  }

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
              data-feature={`相性 > シーズン > ${seasonOrdinal(n)}`}
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
            data-feature={`相性 > ディビジョン > ${div}`}
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
          {missing.length > 0 && (
            <p className="text-xs text-amber-200 bg-amber-900/20 border border-amber-800/50 rounded px-3 py-2">
              {missing.map((t) => `「${t}」`).join("・")}は {season !== undefined ? seasonOrdinal(season) : ""} の {division} に成績がないため、
              ほかのチームを表示しています。シーズンを切り替えるか、チームを選び直してください。
            </p>
          )}

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
              data-feature="相性 > 左右入れ替え"
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
            <button
              onClick={handleShare}
              data-feature="相性 > 共有"
              data-track="チーム相性を共有"
              className={`mt-3 w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                copied ? "bg-green-600 text-white" : "bg-gray-800 text-gray-300 border border-gray-700 hover:text-white"
              }`}
            >
              {copied ? "リンクをコピーしました" : "この比較を共有"}
            </button>
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
            <button
              onClick={() => setShowBasis(true)}
              data-feature="相性 > 数値の根拠"
              data-track="チーム相性 数値の根拠"
              className="ml-1 text-blue-400 underline underline-offset-2"
            >
              数値の根拠
            </button>
          </p>

          {showBasis && (
            <BasisSheet
              axes={axes}
              a={a}
              b={b}
              title={`${season !== undefined ? seasonOrdinal(season) : ""} ${division}`}
              onClose={() => setShowBasis(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 8項目の数値の根拠（計算式・実際の数字・ディビジョン内の順位・元データ）をまとめて見せる */
function BasisSheet({
  axes,
  a,
  b,
  title,
  onClose,
}: {
  axes: RadarAxis[];
  a: TeamSeasonStats;
  b: TeamSeasonStats;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const rank = (r: number | undefined, n: number | undefined) => (r && n ? `（${n}チーム中 ${r}位）` : "");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label="数値の根拠"
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div>
            <h3 className="text-base font-bold text-white">数値の根拠</h3>
            <p className="text-xs text-gray-500">{title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 text-gray-300" aria-label="閉じる">
            ✕
          </button>
        </div>

        <div className="px-4 py-3 space-y-4 text-sm">
          <div className="text-xs text-gray-400 space-y-1">
            <p>
              八角形の各項目は、そのシーズン・ディビジョンの全チームの中での<strong className="text-gray-200">相対評価</strong>
              です（いちばん良いチーム＝100、いちばん悪いチーム＝10、その間は比例、全チーム同じなら55、データなしは0）。直接対決だけは2チーム間の比較です。
            </p>
            <p>差が5未満の項目は「互角」として数えています。データはすべて公式サイトの順位表・スコア表・個人成績です。</p>
          </div>

          {axes.map((x) => (
            <section key={x.key} className="border-t border-gray-800 pt-3">
              <h4 className="font-bold text-white">{x.label}</h4>
              <p className="text-xs text-gray-400 mt-0.5">{x.detail.description}</p>
              <dl className="mt-2 space-y-1.5">
                <div>
                  <dt className={`text-xs font-bold ${A_COLOR.text}`}>
                    {a.team} {rank(x.detail.rankA, x.detail.ranked)}
                  </dt>
                  <dd className="text-gray-200">{x.detail.calcA}</dd>
                </div>
                <div>
                  <dt className={`text-xs font-bold ${B_COLOR.text}`}>
                    {b.team} {rank(x.detail.rankB, x.detail.ranked)}
                  </dt>
                  <dd className="text-gray-200">{x.detail.calcB}</dd>
                </div>
              </dl>
              {x.detail.best && x.detail.worst && (
                <p className="text-xs text-gray-500 mt-1.5">
                  ディビジョン1位 {x.detail.best.team} {x.detail.best.raw} ／ 最下位 {x.detail.worst.team} {x.detail.worst.raw}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                八角形: <span className={A_COLOR.text}>{Math.round(x.a)}</span> 対{" "}
                <span className={B_COLOR.text}>{Math.round(x.b)}</span> ・ {x.detail.scale}
              </p>
              <p className="text-xs text-gray-600 mt-1">元データ: {x.detail.source}</p>
            </section>
          ))}
        </div>
      </div>
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
      onChange={(e) => {
        onChange(stats.find((t) => t.key === e.target.value)?.team ?? "");
        trackFeature("相性 > チーム選択");
      }}
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
      <div className={`text-sm font-bold truncate ${color.text}`}>{team.team}</div>
      {/* 最終結果（プレイオフ）があればそれを大きく出し、レギュラーシーズンの順位は添える */}
      {result ? (
        <>
          <div className="text-[10px] text-gray-500 mt-1">プレイオフ</div>
          <div className={`text-2xl font-bold ${result === "champion" ? "text-yellow-300" : "text-gray-200"}`}>
            {result === "champion" ? "🏆 優勝" : "準優勝"}
          </div>
          <div className="text-[11px] text-gray-400 mt-1 whitespace-nowrap">
            レギュラー {team.rank ? `${team.rank}位` : "—"}
            {team.totalTeams ? ` / ${team.totalTeams}チーム` : ""}
          </div>
        </>
      ) : (
        <>
          <div className="text-[10px] text-gray-500 mt-1">レギュラーシーズン</div>
          <div className="text-2xl font-bold text-white">
            {team.rank ? `${team.rank}位` : "—"}
            {team.totalTeams ? <span className="text-xs text-gray-500 font-normal"> / {team.totalTeams}チーム</span> : null}
          </div>
        </>
      )}
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
