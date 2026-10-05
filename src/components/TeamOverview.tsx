"use client";

// データ → チーム: 1チームの総評（ディビジョンの中での位置・直近の試合・得点源・これからの試合・これまでのシーズン・AI総評）
import { useEffect, useMemo, useRef, useState } from "react";
import { seasonOrdinal } from "@/lib/season";
import { closestTeam, teamKey } from "@/lib/teamName";
import { buildDivisionStats, playerLabel } from "@/lib/matchup";
import { hasPlayedGame, loadAllSeasons, type SeasonData } from "@/lib/seasonData";
import { teamProfile, type ProfileUpcoming } from "@/lib/teamProfile";
import { trackFeature } from "@/lib/trackEvent";
import SheetTeamStats from "@/components/SheetTeamStats";
import type { TeamReview } from "@/lib/teamReviewAi";
import { HistoryRanks, PlayerPoints, RecordBar, SeasonFlow, TeamRadar } from "@/components/TeamCharts";

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

/** チーム総評の AI（総評・持ち味・注目・勝つためのポイント）。保存分があればそれを使う（サーバー側で月1回更新） */
function useTeamReview(season: number | undefined, division: string, team: string | undefined, enabled: boolean) {
  const [review, setReview] = useState<TeamReview | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled || season === undefined || !team) {
      setState("idle");
      setReview(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    setReview(null);
    setMessage("");
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
  }, [season, division, team, enabled]);
  return { review, state, message };
}

function AiReviewBox({ review, state, message }: ReturnType<typeof useTeamReview>) {
  if (state === "idle") return null;
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
                {review.strengths.map((x) => (
                  <li key={x} className="text-xs text-gray-200">◎ {x}</li>
                ))}
              </ul>
            </div>
          )}
          {review.watch.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">これからの注目ポイント</p>
              <ul className="space-y-0.5">
                {review.watch.map((x) => (
                  <li key={x} className="text-xs text-gray-200">▶ {x}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-gray-500">
            公式の順位・スコア・個人成績の数字だけから AI が書いたコメントです（{newsMonth(review.createdAt)}作成・今シーズン分は月1回更新）。
          </p>
        </>
      )}
    </div>
  );
}

function HowToBeatBox({ team, review }: { team: string; review: TeamReview | null }) {
  if (!review?.howToBeat?.length) return null;
  return (
    <div className="rounded-lg bg-orange-950/30 border border-orange-800/50 px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-semibold text-orange-200">🎯 {team} に勝つためには？</p>
      <ol className="space-y-1">
        {review.howToBeat.map((x, i) => (
          <li key={x} className="flex gap-2 text-xs text-gray-100 leading-relaxed">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-orange-600/70 text-[10px] flex items-center justify-center">{i + 1}</span>
            <span>{x}</span>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-gray-500">データ（勝てなかった試合・接戦の成績・得点の偏りなど）から AI が考えた戦い方のヒントです。</p>
    </div>
  );
}

const newsMonth = (iso: string) => {
  const d = new Date(Date.parse(iso) + 9 * 3600_000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-gray-800/60 px-2.5 py-2">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-base font-bold text-white leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section>
      <p className="text-xs text-gray-400 mb-1.5">
        {title}
        {note && <span className="ml-2 text-[10px] text-gray-500">{note}</span>}
      </p>
      {children}
    </section>
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
        // 今シーズンは公式の成績が出る前（開幕直後）でも選べる（アップロードされたスコア表・これからの試合を見るため）
        .filter((n) => n === currentSeason || data[n].standings.length > 0 || hasPlayedGame(data[n]))
        .sort((x, y) => y - x),
    [data, currentSeason]
  );
  // 最初に開いたときは公式の成績があるいちばん新しいシーズン（開幕直後の今シーズンは選べば見られる）
  const withRecords = seasons.find((n) => data[n].standings.length > 0 || hasPlayedGame(data[n])) ?? seasons[0];
  const season = selectedSeason !== undefined && seasons.includes(selectedSeason) ? selectedSeason : withRecords;
  const teams = useMemo(
    () => (season !== undefined ? buildDivisionStats(division, data[season].standings, data[season].scores, data[season].players) : []),
    [data, season, division]
  );
  // 選べるチーム。公式の成績がまだ無いシーズンは、日程表に出てくるチーム
  const teamOptions = useMemo(() => {
    if (teams.length > 0 || season === undefined) return teams.map((t) => ({ key: t.key, team: t.team, rank: t.rank }));
    const label = seasonOrdinal(season);
    const seen = new Map<string, { key: string; team: string; rank?: number }>();
    for (const m of matches) {
      if (m.season !== label || m.division !== division) continue;
      for (const name of [m.awayTeam, m.homeTeam].map(benchless)) if (!seen.has(teamKey(name))) seen.set(teamKey(name), { key: teamKey(name), team: name });
    }
    return [...seen.values()].sort((a, b) => a.team.localeCompare(b.team, "ja"));
  }, [teams, season, matches, division]);
  // ディビジョンを切り替えたら、前のディビジョンのチームの指定は外す（「見つからない」を出さない）
  const firstDivision = useRef(true);
  useEffect(() => {
    if (firstDivision.current) {
      firstDivision.current = false;
      return;
    }
    setSelectedTeam("");
  }, [division]);

  // リンクで指定されたチームが見つからなければ、近い名前（読み間違い1〜2文字）を探す。それも無ければ先頭のチームを出して知らせる
  const matched = selectedTeam ? closestTeam(teamOptions, selectedTeam) : undefined;
  const team = matched?.team ?? teamOptions[0]?.team;
  const missingTeam = selectedTeam && !matched && teamOptions.length > 0 ? selectedTeam : null;
  const profile = useMemo(
    () => (season !== undefined && team ? teamProfile(data, season, division, team) : undefined),
    [data, season, division, team]
  );

  const ai = useTeamReview(profile?.season, division, profile?.stats.team, (profile?.stats.gp ?? 0) > 0);
  const [showAllPlayers, setShowAllPlayers] = useState(false);

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

      {teamOptions.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {season !== undefined ? seasonOrdinal(season) : ""} の {division} にはチームの成績がありません。
        </p>
      ) : (
        <>
          {missingTeam && (
            <p className="text-xs text-amber-200 bg-amber-900/20 border border-amber-800/50 rounded px-3 py-2">
              「{missingTeam}」は {season !== undefined ? seasonOrdinal(season) : ""} の {division} に見つからないため、ほかのチームを表示しています。
              シーズン・ディビジョンを切り替えるか、チームを選び直してください。
            </p>
          )}
          <select
            value={teamKey(team ?? "")}
            onChange={(e) => {
              setSelectedTeam(teamOptions.find((t) => t.key === e.target.value)?.team ?? "");
              trackFeature(`チーム > チーム選択 > ${division} > ${teamOptions.find((t) => t.key === e.target.value)?.team ?? ""}`);
            }}
            className="w-full bg-gray-900 border-2 border-blue-500 rounded-lg px-3 py-2.5 text-sm text-white"
          >
            {teamOptions.map((t) => (
              <option key={t.key} value={t.key}>
                {t.rank ? `${t.rank}位 ` : ""}
                {t.team}
              </option>
            ))}
          </select>

          {!profile || !s ? (
            /* 公式の成績がまだ無い（開幕直後）: スコア表とこれからの試合だけ */
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 space-y-4">
              <div>
                <p className="text-[11px] text-gray-500">
                  {season !== undefined ? seasonOrdinal(season) : ""} {division}
                </p>
                <h3 className="text-xl font-bold text-white">{team}</h3>
                <p className="text-xs text-gray-500 mt-1">公式の成績はまだありません。公式サイトに載ると、順位・AI総評などが出ます。</p>
              </div>
              {team && season !== undefined && <SheetTeamStats division={division} team={team} season={season} />}
              {upcoming.length > 0 && (
                <Section title="これからの試合">
                  <div className="space-y-1">
                    {upcoming.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 w-20">
                          {md(m.date)} {m.timeStart}
                        </span>
                        <span className="text-gray-200 flex-1 truncate">vs {m.opponent}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          ) : (
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

            <div className="px-4 py-3 space-y-6">
              {/* ── 前半: ひと目で分かる大事なこと ── */}
              <AiReviewBox {...ai} />

              {profile.axes.some((x) => x.value > 0) && (
                <Section title="ディビジョンの中での力関係" note="7つの指標">
                  <TeamRadar axes={profile.axes} />
                </Section>
              )}

              <HowToBeatBox team={s.team} review={ai.review} />

              {profile.metrics.length > 0 && (
                <Section title="ディビジョンの中での位置">
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
                </Section>
              )}

              {profile.games.length > 0 && (
                <Section
                  title="シーズンの流れ"
                  note={profile.streak?.result === "W" ? `${profile.streak.count}連勝中` : undefined}
                >
                  <SeasonFlow games={profile.games} />
                </Section>
              )}

              {profile.topPlayers.length > 0 && (
                <Section title="得点源（ポイント上位）">
                  <div className="grid grid-cols-3 gap-2">
                    {profile.topPlayers.map((p, i) => (
                      <div key={p.name} className="rounded-lg bg-gray-800/60 px-2 py-2 text-center">
                        <p className="text-[10px] text-gray-500">{["🥇", "🥈", "🥉"][i]}</p>
                        <p className="text-xs text-gray-100 font-medium truncate">{playerLabel(p)}</p>
                        <p className="text-lg font-bold text-white leading-tight">{p.points}<span className="text-[10px] text-gray-400 font-normal">pt</span></p>
                        <p className="text-[10px] text-gray-400">
                          {p.goals}G {p.assists}A
                        </p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {upcoming.length > 0 && (
                <Section title="これからの試合">
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
                </Section>
              )}

              {/* アップロードされたスコア表から（後半失点率など） */}
              <SheetTeamStats division={profile.division} team={s.team} season={profile.season} />

              {/* ── 後半: 細かいデータ ── */}
              {profile.games.length > 0 && (
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 tracking-wider">くわしいデータ</p>
                </div>
              )}

              {profile.games.length > 0 && (
                <Section title="試合の傾向">
                  <div className="space-y-2">
                    <RecordBar label="接戦（1点差）" rec={profile.close} />
                    <RecordBar label="大差（3点差以上）" rec={profile.blowout} />
                    <RecordBar label="上位チーム相手" note="順位が上半分" rec={profile.vsUpper} />
                    <RecordBar label="下位チーム相手" rec={profile.vsLower} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <Stat label="完封勝ち" value={`${profile.shutoutWins}試合`} />
                    <Stat label="無得点の試合" value={`${profile.scoreless}試合`} />
                    {profile.biggestWin && (
                      <Stat
                        label="最大得点差の勝利"
                        value={`${profile.biggestWin.for}-${profile.biggestWin.against}`}
                        sub={`${md(profile.biggestWin.date)} vs ${profile.biggestWin.opponent}`}
                      />
                    )}
                    {profile.mostGoals && (
                      <Stat
                        label="1試合の最多得点"
                        value={`${profile.mostGoals.for}点`}
                        sub={`${md(profile.mostGoals.date)} vs ${profile.mostGoals.opponent}`}
                      />
                    )}
                  </div>
                </Section>
              )}

              {profile.players.length > 0 && (
                <Section
                  title="選手のポイント"
                  note={[
                    profile.topScorerShare !== undefined ? `得点王の得点割合 ${Math.round(profile.topScorerShare * 100)}%` : "",
                    profile.assistsPerGoal !== undefined ? `1ゴールあたりアシスト ${profile.assistsPerGoal.toFixed(1)}` : "",
                  ]
                    .filter(Boolean)
                    .join("・")}
                >
                  <PlayerPoints players={showAllPlayers ? profile.players : profile.players.slice(0, 8)} />
                  {profile.players.length > 8 && (
                    <button onClick={() => setShowAllPlayers((v) => !v)} className="mt-1 text-xs text-blue-400">
                      {showAllPlayers ? "閉じる" : `全員を見る（${profile.players.length}人）`}
                    </button>
                  )}
                </Section>
              )}

              {profile.opponents.length > 0 && (
                <Section title="対戦相手別の成績">
                  <div className="divide-y divide-gray-800 rounded-lg border border-gray-800">
                    {profile.opponents.map((o) => (
                      <div key={o.opponent} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                        <span className="text-gray-500 w-7">{o.rank ? `${o.rank}位` : ""}</span>
                        <span className="text-gray-200 flex-1 truncate">{o.opponent}</span>
                        <span className="text-gray-300 tabular-nums w-16 text-right">
                          {o.w}勝{o.l}敗{o.t}分
                        </span>
                        <span className="text-white tabular-nums w-12 text-right">
                          {o.gf}-{o.ga}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {profile.recent.length > 0 && (
                <Section title="直近の試合">
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
                </Section>
              )}

              {profile.pim && (
                <Section title="反則">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Stat label="ペナルティ時間（合計）" value={`${profile.pim.total}分`} />
                    <Stat label="1試合あたり" value={`${profile.pim.perGame.toFixed(1)}分`} sub={`少ない順 ${profile.pim.rank}位 / ${profile.pim.of}チーム`} />
                  </div>
                </Section>
              )}

              {profile.history.length > 0 && (
                <Section title="これまでのシーズン">
                  <HistoryRanks
                    history={profile.history.map((h) => ({
                      season: h.season,
                      label: seasonOrdinal(h.season),
                      rank: h.rank,
                      totalTeams: h.totalTeams,
                      champion: h.playoff === "champion",
                    }))}
                  />
                  <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 mt-2">
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
                </Section>
              )}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}
