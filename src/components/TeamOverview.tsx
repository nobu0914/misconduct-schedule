"use client";

// データ → チーム: 1チームの総評（ディビジョンの中での位置・直近の試合・得点源・これからの試合・これまでのシーズン・AI総評）
import { useEffect, useMemo, useState } from "react";
import { seasonOrdinal } from "@/lib/season";
import { teamKey } from "@/lib/teamName";
import { buildDivisionStats } from "@/lib/matchup";
import { hasPlayedGame, loadAllSeasons, type SeasonData } from "@/lib/seasonData";
import { teamProfile, type ProfileUpcoming } from "@/lib/teamProfile";
import { trackFeature } from "@/lib/trackEvent";
import type { TeamReview } from "@/lib/teamReviewAi";

export interface TeamSelection {
  season?: number;
  team?: string;
}

interface Props {
  divisions: string[];
  division: string;
  onDivisionChange: (division: string) => void;
  divisionColor: (division: string) => string;
  initial: TeamSelection;
  onChange: (selection: TeamSelection) => void;
}

interface Match {
  date: string;
  timeStart?: string;
  awayTeam: string;
  homeTeam: string;
  division: string;
  status?: string;
  round?: string;
  season?: string;
}

const RESULT_STYLE = { W: "bg-green-600 text-white", L: "bg-red-700/80 text-white", T: "bg-gray-600 text-white" };
const RESULT_LABEL = { W: "勝", L: "負", T: "分" };
const md = (date: string) => date.replace(/^\d{4}\//, "");
const benchless = (name: string) => name.replace(/\s*[(（][A-Z][)）]\s*$/, "");

function AiReviewBox({ season, division, team }: { season: number; division: string; team: string }) {
  const [review, setReview] = useState<TeamReview | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setReview(null);
    const q = new URLSearchParams({ season: String(season), div: division, team });
    fetch(`/api/team-review?${q}`, { method: "POST" })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (d.review) setReview(d.review);
        if (!ok && !d.review) setMessage(d.message ?? "総評を作れませんでした。");
        setState(d.review ? "done" : "error");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [season, division, team]);

  return (
    <div className="rounded-lg bg-violet-950/30 border border-violet-800/50 px-3 py-2.5 space-y-2">
      <p className="text-xs font-semibold text-violet-200">✨ AI総評</p>
      {state === "loading" && <p className="text-xs text-gray-400 animate-pulse">AI が総評を書いています…（初めて開いたときは20秒ほど）</p>}
      {state === "error" && <p className="text-xs text-gray-400">{message || "総評を作れませんでした。"}</p>}
      {review && (
        <>
          <p className="text-sm text-gray-100 leading-relaxed">{review.summary}</p>
          {review.strengths.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">持ち味</p>
              <ul className="space-y-0.5">
                {review.strengths.map((s) => (
                  <li key={s} className="text-xs text-gray-200">◎ {s}</li>
                ))}
              </ul>
            </div>
          )}
          {review.watch.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">これからの注目ポイント</p>
              <ul className="space-y-0.5">
                {review.watch.map((s) => (
                  <li key={s} className="text-xs text-gray-200">▶ {s}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-gray-500">公式の順位・スコア・個人成績の数字だけから AI が書いたコメントです。</p>
        </>
      )}
    </div>
  );
}

export default function TeamOverview({ divisions, division, onDivisionChange, divisionColor, initial, onChange }: Props) {
  const [data, setData] = useState<Record<number, SeasonData>>({});
  const [currentSeason, setCurrentSeason] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(initial.season);
  const [selectedTeam, setSelectedTeam] = useState(initial.team ?? "");
  const [matches, setMatches] = useState<Match[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAllSeasons().then(({ data: next, current }) => {
      if (cancelled) return;
      setData(next);
      setCurrentSeason(current);
      setLoading(false);
    });
    fetch("/api/schedule")
      .then((r) => r.json())
      .then((d) => !cancelled && setMatches(d.matches ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const seasons = useMemo(
    () =>
      Object.keys(data)
        .map(Number)
        .filter((n) => data[n].standings.length > 0 || hasPlayedGame(data[n]))
        .sort((x, y) => y - x),
    [data]
  );
  const season = selectedSeason !== undefined && seasons.includes(selectedSeason) ? selectedSeason : seasons[0];
  const teams = useMemo(
    () => (season !== undefined ? buildDivisionStats(division, data[season].standings, data[season].scores, data[season].players) : []),
    [data, season, division]
  );
  const team = teams.find((t) => t.key === teamKey(selectedTeam))?.team ?? teams[0]?.team;
  const profile = useMemo(
    () => (season !== undefined && team ? teamProfile(data, season, division, team) : undefined),
    [data, season, division, team]
  );

  // これからの試合（今シーズンを見ているときだけ）
  const upcoming: ProfileUpcoming[] = useMemo(() => {
    if (!team || season !== currentSeason) return [];
    const todayKey = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const dayKey = (date: string) => {
      const [y, m, d] = date.split("/");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    };
    return matches
      .filter(
        (m) =>
          m.status !== "postponed" &&
          m.division === division &&
          m.season === seasonOrdinal(season!) &&
          dayKey(m.date) >= todayKey &&
          (teamKey(m.awayTeam) === teamKey(team) || teamKey(m.homeTeam) === teamKey(team))
      )
      .sort((a, b) => (dayKey(a.date) + (a.timeStart ?? "").padStart(5, "0")).localeCompare(dayKey(b.date) + (b.timeStart ?? "").padStart(5, "0")))
      .slice(0, 3)
      .map((m) => ({
        date: m.date,
        timeStart: m.timeStart,
        opponent: benchless(teamKey(m.awayTeam) === teamKey(team) ? m.homeTeam : m.awayTeam),
      }));
  }, [matches, team, season, currentSeason, division]);

  useEffect(() => {
    onChange({ season: selectedSeason, team });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, team]);

  /** 開いた人にも同じチーム・シーズンの総評が出るリンクを共有する */
  async function handleShare() {
    if (!team || season === undefined) return;
    const params = new URLSearchParams({ mode: "team", div: division, season: String(season), t: team });
    const url = `${window.location.origin}/player-ranking?${params}`;
    const title = `チーム総評 ${team}（${seasonOrdinal(season)} ${division}）`;
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
  if (seasons.length === 0) return <p className="text-sm text-gray-500 py-8 text-center">チームのデータがまだありません。</p>;

  const s = profile?.stats;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">チーム総評</h2>
        <p className="text-xs text-gray-500 mt-1">1チームのシーズンを、ディビジョンの中での位置・直近の試合・得点源などでまとめます。</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 flex-shrink-0">シーズン</span>
        <div className="flex flex-wrap gap-2">
          {seasons.map((n) => (
            <button
              key={n}
              onClick={() => setSelectedSeason(n)}
              data-feature={`チーム > シーズン > ${seasonOrdinal(n)}`}
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

      <div className="flex flex-wrap gap-2">
        {divisions.map((div) => (
          <button
            key={div}
            onClick={() => onDivisionChange(div)}
            data-feature={`チーム > ディビジョン > ${div}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              division === div ? `${divisionColor(div)} text-white` : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            {div}
          </button>
        ))}
      </div>

      {teams.length === 0 || !profile || !s ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {season !== undefined ? seasonOrdinal(season) : ""} の {division} にはチームの成績がありません。
        </p>
      ) : (
        <>
          <select
            value={s.key}
            onChange={(e) => {
              setSelectedTeam(teams.find((t) => t.key === e.target.value)?.team ?? "");
              trackFeature(`チーム > チーム選択 > ${division} > ${teams.find((t) => t.key === e.target.value)?.team ?? ""}`);
            }}
            className="w-full bg-gray-900 border-2 border-blue-500 rounded-lg px-3 py-2.5 text-sm text-white"
          >
            {teams.map((t) => (
              <option key={t.key} value={t.key}>
                {t.rank ? `${t.rank}位 ` : ""}
                {t.team}
              </option>
            ))}
          </select>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* 見出し */}
            <div className="px-4 py-3 border-b border-gray-800 space-y-1">
              <p className="text-[11px] text-gray-500">
                {seasonOrdinal(profile.season)} {profile.division}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-white">{s.team}</h3>
                {profile.playoff === "champion" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-300 font-medium">優勝</span>}
                {profile.playoff === "runnerUp" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-600/40 text-gray-300 font-medium">準優勝</span>}
              </div>
              <div className="flex items-baseline gap-4 text-sm">
                {s.rank && (
                  <span className="text-gray-300">
                    <span className="text-2xl font-bold text-white">{s.rank}</span>位 / {profile.totalTeams}
                  </span>
                )}
                <span className="text-gray-300">
                  <span className="text-green-400 font-semibold">{s.wins}</span>勝 <span className="text-red-400 font-semibold">{s.losses}</span>敗{" "}
                  <span className="font-semibold">{s.ties}</span>分
                </span>
                <span className="text-gray-300">
                  勝点 <span className="text-white font-bold">{s.points}</span>
                </span>
              </div>
              <button
                onClick={handleShare}
                data-feature={`チーム > 共有 > ${division} > ${s.team}`}
                className={`mt-2 w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  copied ? "bg-green-600 text-white" : "bg-gray-800 text-gray-300 border border-gray-700 hover:text-white"
                }`}
              >
                {copied ? "リンクをコピーしました" : "🔗 このチーム総評を共有"}
              </button>
            </div>

            <div className="px-4 py-3 space-y-5">
              {s.gp > 0 && <AiReviewBox season={profile.season} division={profile.division} team={s.team} />}

              {/* ディビジョンの中での位置 */}
              {profile.metrics.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">ディビジョンの中での位置</p>
                  <div className="grid grid-cols-2 gap-2">
                    {profile.metrics.map((m) => (
                      <div key={m.key} className="rounded-lg bg-gray-800/60 px-2.5 py-2">
                        <p className="text-[10px] text-gray-500">{m.label}</p>
                        <p className="text-lg font-bold text-white leading-tight">{m.value}</p>
                        <div className="mt-1 h-1.5 rounded bg-gray-700 overflow-hidden">
                          <div
                            className={`h-full ${m.rank === 1 ? "bg-yellow-400" : "bg-blue-500"}`}
                            style={{ width: `${m.of > 1 ? ((m.of - m.rank) / (m.of - 1)) * 90 + 10 : 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {m.of}チーム中 <span className={m.rank === 1 ? "text-yellow-300 font-semibold" : "text-gray-200"}>{m.rank}位</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 直近の試合 */}
              {profile.recent.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">
                    直近の試合
                    {profile.streak?.result === "W" && <span className="ml-2 text-green-400 font-semibold">{profile.streak.count}連勝中</span>}
                  </p>
                  <div className="space-y-1">
                    {profile.recent.map((g, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${RESULT_STYLE[g.result]}`}>{RESULT_LABEL[g.result]}</span>
                        <span className="text-gray-500 w-11">{md(g.date)}</span>
                        <span className="text-gray-200 flex-1 truncate">vs {g.opponent}</span>
                        <span className="text-white font-semibold tabular-nums">
                          {g.for} - {g.against}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 得点源 */}
              {profile.topPlayers.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">得点源（ポイント上位）</p>
                  <div className="space-y-1">
                    {profile.topPlayers.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 w-4">{i + 1}</span>
                        <span className="text-gray-100 flex-1 truncate">{p.name}</span>
                        <span className="text-gray-300 tabular-nums">
                          {p.goals}G {p.assists}A
                        </span>
                        <span className="text-white font-semibold w-10 text-right tabular-nums">{p.points}P</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* これからの試合 */}
              {upcoming.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">これからの試合</p>
                  <div className="space-y-1">
                    {upcoming.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 w-20">
                          {md(m.date)} {m.timeStart}
                        </span>
                        <span className="text-gray-200 flex-1 truncate">vs {m.opponent}</span>
                        <a
                          href={`/player-ranking?${new URLSearchParams({ mode: "matchup", div: division, a: s.team, b: m.opponent })}`}
                          data-feature={`チーム > 相性を見る > ${division} > ${s.team} vs ${m.opponent}`}
                          className="text-blue-400 flex-shrink-0"
                        >
                          相性 →
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* これまでのシーズン */}
              {profile.history.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">これまでのシーズン</p>
                  <div className="divide-y divide-gray-800 rounded-lg border border-gray-800">
                    {profile.history.map((h) => (
                      <div key={`${h.season}-${h.division}`} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                        <span className="text-gray-400 w-10">{seasonOrdinal(h.season)}</span>
                        <span className="text-gray-500 w-20 truncate">{h.division}</span>
                        <span className="text-white font-semibold w-10">{h.rank ? `${h.rank}位` : "—"}</span>
                        <span className="text-gray-300 flex-1">
                          {h.wins}勝{h.losses}敗{h.ties}分
                        </span>
                        {h.playoff === "champion" && <span className="text-[10px] px-1.5 rounded bg-yellow-600/30 text-yellow-300">優勝</span>}
                        {h.playoff === "runnerUp" && <span className="text-[10px] px-1.5 rounded bg-gray-600/40 text-gray-300">準優勝</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
