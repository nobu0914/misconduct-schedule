// チーム総評（データ → チーム）。1チームの1シーズンを、ディビジョンの中での位置・直近の試合・主力選手・
// これまでのシーズンでまとめる。クライアントとサーバー（AI 総評の材料）の両方から使う。

import { buildDivisionStats, METRICS, relative, type ScoreRow, type TeamSeasonStats } from "./matchup";
import { playoffResult } from "./seasonAwards";
import { seasonOrdinal } from "./season";
import { teamKey } from "./teamName";
import type { SeasonData } from "./seasonData";

export interface ProfileMetric {
  key: "gf" | "ga" | "diff" | "win";
  label: string;
  value: string;
  /** ディビジョン内の順位（良い方から）と、比べたチーム数 */
  rank: number;
  of: number;
}

export interface ProfileGame {
  date: string;
  opponent: string;
  for: number;
  against: number;
  result: "W" | "L" | "T";
}

export interface ProfileUpcoming {
  date: string;
  timeStart?: string;
  opponent: string;
}

export interface SeasonLine {
  season: number;
  division: string;
  rank?: number;
  totalTeams?: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  playoff?: "champion" | "runnerUp";
}

/** 1指標のディビジョン内での位置（レーダーの1軸） */
export interface ProfileAxis {
  key: string;
  label: string;
  /** 10〜100（ディビジョン最高=100・最低=10）。データなしは 0 */
  value: number;
  /** ディビジョン平均の位置（同じ目盛り） */
  average: number;
  raw: string;
  rank?: number;
  of: number;
}

export interface Record3 {
  w: number;
  l: number;
  t: number;
}

export interface OpponentLine extends Record3 {
  opponent: string;
  rank?: number;
  gf: number;
  ga: number;
}

export interface TeamProfile {
  season: number;
  division: string;
  stats: TeamSeasonStats;
  totalTeams: number;
  metrics: ProfileMetric[];
  recent: ProfileGame[];
  /** 最後から続いている結果（例 3連勝） */
  streak?: { result: "W" | "L" | "T"; count: number };
  topPlayers: { name: string; goals: number; assists: number; points: number }[];
  playoff?: "champion" | "runnerUp";
  history: SeasonLine[];
  /** レーダー（7指標） */
  axes: ProfileAxis[];
  /** 全試合（古い順） */
  games: ProfileGame[];
  /** 1点差の試合 / 3点差以上の試合 / 上位（順位が上半分）相手 / 下位相手 */
  close: Record3;
  blowout: Record3;
  vsUpper: Record3;
  vsLower: Record3;
  shutoutWins: number;
  /** 無得点の試合 */
  scoreless: number;
  biggestWin?: ProfileGame;
  mostGoals?: ProfileGame;
  opponents: OpponentLine[];
  /** 選手全員（ポイント順） */
  players: { name: string; goals: number; assists: number; points: number; pim: number }[];
  /** チーム得点のうち得点王の割合（0〜1） */
  topScorerShare?: number;
  /** 1ゴールあたりのアシスト数（パスで崩しているか） */
  assistsPerGoal?: number;
  pim?: { total: number; perGame: number; rank: number; of: number };
}

const avg = (n: number, d: number) => (d > 0 ? n / d : 0);
const dateValue = (date: string) => {
  const [y, m, d] = date.split("/").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
};

/** 値の大きい（小さい）方から何位か。同じ値は同じ順位 */
function rankOf(values: number[], v: number, higherIsBetter: boolean): number {
  return values.filter((x) => (higherIsBetter ? x > v : x < v)).length + 1;
}

/** 1チーム・1シーズンの総評データ。そのシーズン・ディビジョンに成績が無ければ undefined */
export function teamProfile(
  data: Record<number, SeasonData>,
  season: number,
  division: string,
  team: string
): TeamProfile | undefined {
  const d = data[season];
  if (!d) return undefined;
  const all = buildDivisionStats(division, d.standings, d.scores, d.players);
  const key = teamKey(team);
  const stats = all.find((t) => t.key === key);
  if (!stats) return undefined;

  const withGames = all.filter((t) => t.games > 0);
  const metrics: ProfileMetric[] = [];
  if (stats.games > 0) {
    const gf = withGames.map((t) => avg(t.goalsFor, t.games));
    const ga = withGames.map((t) => avg(t.goalsAgainst, t.games));
    const diff = withGames.map((t) => t.goalsFor - t.goalsAgainst);
    const myGf = avg(stats.goalsFor, stats.games);
    const myGa = avg(stats.goalsAgainst, stats.games);
    const myDiff = stats.goalsFor - stats.goalsAgainst;
    metrics.push(
      { key: "gf", label: "1試合の平均得点", value: myGf.toFixed(1), rank: rankOf(gf, myGf, true), of: withGames.length },
      { key: "ga", label: "1試合の平均失点", value: myGa.toFixed(1), rank: rankOf(ga, myGa, false), of: withGames.length },
      { key: "diff", label: "得失点差", value: `${myDiff > 0 ? "+" : ""}${myDiff}`, rank: rankOf(diff, myDiff, true), of: withGames.length }
    );
  }
  const withRecord = all.filter((t) => t.gp > 0);
  if (stats.gp > 0) {
    const pct = (t: TeamSeasonStats) => avg(t.wins + t.ties * 0.5, t.gp);
    metrics.push({
      key: "win",
      label: "勝率（引き分けは0.5勝）",
      value: `${Math.round(pct(stats) * 100)}%`,
      rank: rankOf(withRecord.map(pct), pct(stats), true),
      of: withRecord.length,
    });
  }

  // 直近の試合（新しい順に5試合）
  const games: ProfileGame[] = d.scores
    .filter(
      (g): g is ScoreRow & { awayScore: number; homeScore: number } =>
        g.divisionLabel === division && g.awayScore !== null && g.homeScore !== null && (teamKey(g.awayTeam) === key || teamKey(g.homeTeam) === key)
    )
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))
    .map((g) => {
      const home = teamKey(g.homeTeam) === key;
      const f = home ? g.homeScore : g.awayScore;
      const a = home ? g.awayScore : g.homeScore;
      return { date: g.date, opponent: home ? g.awayTeam : g.homeTeam, for: f, against: a, result: f > a ? "W" : f < a ? "L" : "T" } as ProfileGame;
    });
  let streak: TeamProfile["streak"];
  if (games.length) {
    let count = 0;
    while (count < games.length && games[count].result === games[0].result) count++;
    if (count >= 2) streak = { result: games[0].result, count };
  }

  const topPlayers = d.players
    .filter((p) => p.divisionLabel === division && teamKey(p.team) === key && p.points > 0)
    .sort((a, b) => b.points - a.points || b.goals - a.goals)
    .slice(0, 3)
    .map((p) => ({ name: p.name, goals: p.goals, assists: p.assists ?? p.points - p.goals, points: p.points }));

  // レーダー: matchup と同じ7指標を、このチームとディビジョン平均で
  const axes: ProfileAxis[] = METRICS.map((m) => {
    const vals = all.map((t) => m.value(t)).filter((v): v is number => v !== null);
    const mine = m.value(stats);
    const mean = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    return {
      key: m.key,
      label: m.label,
      value: relative(mine, vals, m.lowerIsBetter),
      average: relative(mean, vals, m.lowerIsBetter),
      raw: mine === null ? "—" : m.format(mine),
      rank: mine === null ? undefined : rankOf(vals, mine, !m.lowerIsBetter),
      of: vals.length,
    };
  });

  const ordered = [...games].reverse();
  const rec = (list: ProfileGame[]): Record3 => ({
    w: list.filter((g) => g.result === "W").length,
    l: list.filter((g) => g.result === "L").length,
    t: list.filter((g) => g.result === "T").length,
  });
  const rankByKey = new Map(all.map((t) => [t.key, t.rank]));
  const half = Math.ceil(all.length / 2);
  const oppRank = (name: string) => rankByKey.get(teamKey(name));
  const opponents = new Map<string, OpponentLine>();
  for (const g of ordered) {
    const k = teamKey(g.opponent);
    const o = opponents.get(k) ?? { opponent: g.opponent.replace(/\s*[(（][A-Z][)）]\s*$/, ""), rank: oppRank(g.opponent), w: 0, l: 0, t: 0, gf: 0, ga: 0 };
    o[g.result === "W" ? "w" : g.result === "L" ? "l" : "t"] += 1;
    o.gf += g.for;
    o.ga += g.against;
    opponents.set(k, o);
  }
  const wins = ordered.filter((g) => g.result === "W");
  const teamPlayers = d.players
    .filter((p) => p.divisionLabel === division && teamKey(p.team) === key)
    .map((p) => ({ name: p.name, goals: p.goals, assists: p.assists ?? p.points - p.goals, points: p.points, pim: p.pim }))
    .sort((a, b) => b.points - a.points || b.goals - a.goals);
  const teamGoals = teamPlayers.reduce((n, p) => n + p.goals, 0);
  const teamAssists = teamPlayers.reduce((n, p) => n + p.assists, 0);
  const pimTeams = all.filter((t) => t.gp > 0 && t.players > 0);
  const pimPer = (t: TeamSeasonStats) => t.pim / t.gp;

  return {
    season,
    division,
    stats,
    axes,
    games: ordered,
    close: rec(ordered.filter((g) => Math.abs(g.for - g.against) === 1)),
    blowout: rec(ordered.filter((g) => Math.abs(g.for - g.against) >= 3)),
    vsUpper: rec(ordered.filter((g) => (oppRank(g.opponent) ?? 99) <= half)),
    vsLower: rec(ordered.filter((g) => (oppRank(g.opponent) ?? 0) > half)),
    shutoutWins: wins.filter((g) => g.against === 0).length,
    scoreless: ordered.filter((g) => g.for === 0).length,
    biggestWin: [...wins].sort((a, b) => b.for - b.against - (a.for - a.against))[0],
    mostGoals: [...ordered].sort((a, b) => b.for - a.for)[0],
    opponents: [...opponents.values()].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    players: teamPlayers,
    topScorerShare: teamGoals > 0 ? Math.max(...teamPlayers.map((p) => p.goals)) / teamGoals : undefined,
    assistsPerGoal: teamGoals > 0 ? teamAssists / teamGoals : undefined,
    pim:
      stats.gp > 0 && stats.players > 0
        ? { total: stats.pim, perGame: pimPer(stats), rank: rankOf(pimTeams.map(pimPer), pimPer(stats), false), of: pimTeams.length }
        : undefined,
    totalTeams: stats.totalTeams ?? all.length,
    metrics,
    recent: games.slice(0, 5),
    streak,
    topPlayers,
    playoff: playoffResult(season, division, team),
    history: teamHistory(data, team),
  };
}

/** そのチームの全シーズンの成績（新しい順）。ディビジョンが変わっていても追う */
export function teamHistory(data: Record<number, SeasonData>, team: string): SeasonLine[] {
  const key = teamKey(team);
  const lines: SeasonLine[] = [];
  for (const season of Object.keys(data).map(Number).sort((a, b) => b - a)) {
    const d = data[season];
    const divisions = new Set([...d.standings.map((s) => s.divisionLabel), ...d.scores.map((g) => g.divisionLabel)]);
    for (const division of divisions) {
      const t = buildDivisionStats(division, d.standings, d.scores, []).find((x) => x.key === key);
      if (!t || t.gp === 0) continue;
      lines.push({
        season,
        division,
        rank: t.rank,
        totalTeams: t.totalTeams,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        points: t.points,
        playoff: playoffResult(season, division, team),
      });
    }
  }
  return lines;
}

/** AI 総評に渡す材料（事実だけ） */
export function profileInput(p: TeamProfile): string {
  const s = p.stats;
  const lines = [
    `チーム: ${s.team}（${seasonOrdinal(p.season)} ${p.division}）`,
    `成績: ${s.gp}試合 ${s.wins}勝${s.losses}敗${s.ties}分 勝点${s.points}${s.rank ? ` / 順位 ${s.rank}位（${p.totalTeams}チーム中）` : ""}`,
  ];
  if (p.playoff) lines.push(`プレイオフ: ${p.playoff === "champion" ? "優勝" : "準優勝"}`);
  for (const m of p.metrics) lines.push(`${m.label}: ${m.value}（ディビジョン${m.rank}位 / ${m.of}チーム）`);
  if (s.games) lines.push(`総得点 ${s.goalsFor} / 総失点 ${s.goalsAgainst}（${s.games}試合）`);
  if (p.streak) lines.push(`直近: ${p.streak.count}${p.streak.result === "W" ? "連勝" : p.streak.result === "T" ? "試合連続引き分け" : "連敗"}`);
  if (p.recent.length)
    lines.push(`直近の試合: ${p.recent.map((g) => `${g.date.replace(/^\d{4}\//, "")} vs ${g.opponent} ${g.for}-${g.against}`).join(" / ")}`);
  if (p.topPlayers.length) lines.push(`得点源: ${p.topPlayers.map((x) => `${x.name} ${x.goals}G ${x.assists}A`).join(" / ")}`);
  if (s.players) lines.push(`得点した選手 ${s.scorers}人（個人成績に載っている選手 ${s.players}人）`);
  const r3 = (r: Record3) => `${r.w}勝${r.l}敗${r.t}分`;
  if (p.axes.length) lines.push(`7指標（ディビジョン内の順位）: ${p.axes.filter((a) => a.rank).map((a) => `${a.label} ${a.raw}（${a.rank}位/${a.of}）`).join(" / ")}`);
  if (p.games.length) {
    lines.push(`1点差の試合 ${r3(p.close)} / 3点差以上の試合 ${r3(p.blowout)} / 上位（上半分）相手 ${r3(p.vsUpper)} / 下位相手 ${r3(p.vsLower)}`);
    lines.push(`完封勝ち ${p.shutoutWins} / 無得点の試合 ${p.scoreless}`);
    const lost = p.games.filter((g) => g.result !== "W");
    if (lost.length) lines.push(`勝てなかった試合: ${lost.map((g) => `vs ${g.opponent} ${g.for}-${g.against}${g.result === "T" ? "（引き分け）" : ""}`).join(" / ")}`);
  }
  if (p.opponents.length) lines.push(`対戦相手別: ${p.opponents.map((o) => `${o.opponent}${o.rank ? `（${o.rank}位）` : ""} ${o.w}勝${o.l}敗${o.t}分 ${o.gf}-${o.ga}`).join(" / ")}`);
  if (p.topScorerShare !== undefined) lines.push(`チーム得点のうち得点王の割合 ${Math.round(p.topScorerShare * 100)}% / 1ゴールあたりアシスト ${p.assistsPerGoal?.toFixed(2)}`);
  if (p.pim) lines.push(`反則 PIM合計 ${p.pim.total}分・1試合 ${p.pim.perGame.toFixed(1)}分（少ない順 ${p.pim.rank}位/${p.pim.of}）`);
  const past = p.history.filter((h) => h.season !== p.season);
  if (past.length)
    lines.push(
      `これまでのシーズン: ${past
        .map((h) => `${seasonOrdinal(h.season)} ${h.division} ${h.rank ? `${h.rank}位` : ""} ${h.wins}勝${h.losses}敗${h.ties}分${h.playoff === "champion" ? " 優勝" : h.playoff === "runnerUp" ? " 準優勝" : ""}`)
        .join(" / ")}`
    );
  return lines.join("\n");
}
