// 順位表の「上のチームを抜くには」。クライアントから使うので依存は teamName だけ。
//
// 勝点は 勝ち2・引き分け1・負け0（公式の順位表の Pts と一致することを確認済み）。
// 勝点が同じときの順位の決め方は公式に書かれていないので、
// 「抜く」は勝点で上回ること、「並ぶ」は同じ勝点にすることとして計算する。
// 残り試合は「公開済みの日程（延期・プレイオフを除く）− 消化試合数」。日程が未公開の月は数えられない。

import { normalizeName, teamKey } from "./teamName";

export interface GapStanding {
  team: string;
  divisionLabel: string;
  rank: number;
  points?: number;
  gp?: number;
}

export interface GapMatch {
  awayTeam: string;
  homeTeam: string;
  division: string;
  status?: string;
  round?: string;
  season?: string;
}

export interface GapScore {
  awayTeam: string;
  homeTeam: string;
  divisionLabel: string;
  played: boolean;
  season: string;
}

/**
 * 上のチームに対する見込み
 * - self: 残りを全勝すれば相手の結果に関係なく抜ける（自力）
 * - help: 全勝しても、相手も勝ち続けると届かない（相手が勝点を落とす必要がある）
 * - tieOnly: 全勝してやっと並ぶ（勝点では上回れない）
 * - impossible: 全勝しても届かない
 * - final: どちらも残り試合なし（最終の差）
 */
export type ChaseVerdict = "self" | "help" | "tieOnly" | "impossible" | "final";

export interface Chase {
  target: string;
  targetRank: number;
  /** 勝点差（相手 − 自分）。順位が下でも勝点で並んでいれば 0 */
  gap: number;
  /** 抜くのに必要な勝点（相手がこれ以上勝点を取らない場合） */
  toPass: number;
  /** その勝点を勝ちだけで取るのに必要な勝ち数 */
  winsToPass: number;
  /** 残り試合（日程が無いと undefined） */
  remaining?: number;
  targetRemaining?: number;
  /** 2チームの直接対決の残り */
  headToHead: number;
  verdict?: ChaseVerdict;
  /** help のとき、相手が落とす必要がある勝点（自分が全勝する前提） */
  helpPoints?: number;
}

export interface TeamGap {
  team: string;
  rank: number;
  remaining?: number;
  /** 残り全勝したときの勝点 */
  maxPoints?: number;
  /** 上のチーム全部（近い順）。先頭が1つ上 */
  above: Chase[];
  /** 1位のときだけ: 2位との勝点差と、1位が確定したか */
  lead?: { over: string; gap: number; clinched: boolean };
}

const sameDivision = (a: string, b: string) => normalizeName(a) === normalizeName(b);

/** 公開済みの日程から数えたチームごとの試合数（レギュラーシーズン・延期を除く） */
export function scheduledGames(matches: GapMatch[], season: string, division: string): Map<string, number> {
  const count = new Map<string, number>();
  for (const m of matches) {
    if (m.season !== season || m.round || m.status === "postponed" || !sameDivision(m.division, division)) continue;
    for (const t of [m.awayTeam, m.homeTeam]) count.set(teamKey(t), (count.get(teamKey(t)) ?? 0) + 1);
  }
  return count;
}

/** 2チームの直接対決の残り = 日程の対戦数 − スコア表で消化済みの対戦数 */
export function headToHeadRemaining(
  matches: GapMatch[],
  scores: GapScore[],
  season: string,
  division: string,
  a: string,
  b: string
): number {
  const ka = teamKey(a);
  const kb = teamKey(b);
  const isPair = (x: string, y: string) => {
    const kx = teamKey(x);
    const ky = teamKey(y);
    return (kx === ka && ky === kb) || (kx === kb && ky === ka);
  };
  const scheduled = matches.filter(
    (m) => m.season === season && !m.round && m.status !== "postponed" && sameDivision(m.division, division) && isPair(m.awayTeam, m.homeTeam)
  ).length;
  const played = scores.filter(
    (g) => g.season === season && g.played && sameDivision(g.divisionLabel, division) && isPair(g.awayTeam, g.homeTeam)
  ).length;
  return Math.max(0, scheduled - played);
}

function judge(myPoints: number, myRem: number, targetPoints: number, targetRem: number, h2h: number): Pick<Chase, "verdict" | "helpPoints"> {
  if (myRem === 0 && targetRem === 0) return { verdict: "final" };
  const myMax = myPoints + 2 * myRem;
  if (myMax < targetPoints) return { verdict: "impossible" };
  if (myMax === targetPoints) return { verdict: "tieOnly" };
  // 直接対決を全部勝てば、その分の勝点は相手に入らない
  const targetBest = targetPoints + 2 * Math.max(0, targetRem - h2h);
  if (myMax > targetBest) return { verdict: "self" };
  return { verdict: "help", helpPoints: targetBest - myMax + 1 };
}

/**
 * ディビジョンの順位表（順位順）から、各チームの「上を抜くには」を出す。
 * matches/scores を渡さない（過去シーズンなど）ときは残り試合 0 として最終の差だけになる。
 */
export function standingsGaps(
  standings: GapStanding[],
  opts: { season?: string; matches?: GapMatch[]; scores?: GapScore[]; final?: boolean } = {}
): TeamGap[] {
  const rows = [...standings].filter((s) => typeof s.points === "number").sort((a, b) => a.rank - b.rank);
  if (rows.length === 0) return [];
  const division = rows[0].divisionLabel;
  const scheduled =
    !opts.final && opts.season && opts.matches ? scheduledGames(opts.matches, opts.season, division) : undefined;
  // 日程が1件も無いディビジョンは残り試合がわからない（0 にはしない）
  const remainingOf = (s: GapStanding): number | undefined => {
    if (opts.final) return 0;
    if (!scheduled || scheduled.size === 0) return undefined;
    const total = scheduled.get(teamKey(s.team));
    return total === undefined ? undefined : Math.max(0, total - (s.gp ?? 0));
  };
  const rem = rows.map(remainingOf);
  const h2h = (a: string, b: string) =>
    !opts.final && opts.season && opts.matches
      ? headToHeadRemaining(opts.matches, opts.scores ?? [], opts.season, division, a, b)
      : 0;

  return rows.map((me, i) => {
    const myRem = rem[i];
    const myPoints = me.points!;
    const above: Chase[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const t = rows[j];
      const gap = t.points! - myPoints;
      const toPass = Math.max(1, gap + 1);
      const headToHead = h2h(me.team, t.team);
      const c: Chase = {
        target: t.team,
        targetRank: t.rank,
        gap,
        toPass,
        winsToPass: Math.ceil(toPass / 2),
        remaining: myRem,
        targetRemaining: rem[j],
        headToHead,
      };
      if (myRem !== undefined && rem[j] !== undefined) Object.assign(c, judge(myPoints, myRem, t.points!, rem[j]!, headToHead));
      above.push(c);
    }
    const gap: TeamGap = {
      team: me.team,
      rank: me.rank,
      remaining: myRem,
      maxPoints: myRem === undefined ? undefined : myPoints + 2 * myRem,
      above,
    };
    if (i === 0 && rows.length > 1) {
      const others = rows.slice(1).map((s, k) => (rem[k + 1] === undefined ? undefined : s.points! + 2 * rem[k + 1]!));
      gap.lead = {
        over: rows[1].team,
        gap: myPoints - rows[1].points!,
        // 2位以下が全勝しても勝点で並べない（並んだときの決め方は不明なので、並べる間は確定にしない）
        clinched: others.every((m) => m !== undefined && m < myPoints),
      };
    }
    return gap;
  });
}
