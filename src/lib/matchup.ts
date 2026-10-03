// チーム相性（同ディビジョンの2チーム比較）の集計。クライアントから使うので依存は teamName だけ。
//
// 8軸はすべて「そのシーズン・そのディビジョンの中での相対値」（最高=100、最低=10、全員同じなら55）。
// 直接対決だけは2チーム間の勝点の取り合い（全シーズン通算）。

import { teamKey } from "./teamName";

export interface StandingRow {
  team: string;
  divisionLabel: string;
  rank?: number;
  totalTeams?: number;
  gp?: number;
  wins?: number;
  losses?: number;
  ties?: number;
  points?: number;
}

export interface ScoreRow {
  date: string; // "2026/3/29"
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
  divisionLabel: string;
  season: string; // "53rd"
}

export interface PlayerRow {
  name: string;
  team: string;
  divisionLabel: string;
  goals: number;
  points: number;
  pim: number;
}

export interface TeamSeasonStats {
  key: string;
  team: string;
  rank?: number;
  totalTeams?: number;
  gp: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  /** スコア表から数えた消化試合数（得失点の分母） */
  games: number;
  goalsFor: number;
  goalsAgainst: number;
  /** 1点以上取った選手の数 */
  scorers: number;
  /** 個人成績に載っている選手の数 */
  players: number;
  ace?: { name: string; goals: number; points: number };
  pim: number;
  /** 勝敗を順位表ではなくスコア表から数えた（順位表に勝敗が無いシーズン） */
  recordFromScores: boolean;
}

function isPlayed(g: ScoreRow): g is ScoreRow & { awayScore: number; homeScore: number } {
  return g.awayScore !== null && g.homeScore !== null;
}

/** ディビジョン内の全チームの成績を、順位表・スコア・個人成績から組み立てる（順位順） */
export function buildDivisionStats(
  division: string,
  standings: StandingRow[],
  scores: ScoreRow[],
  players: PlayerRow[]
): TeamSeasonStats[] {
  const byKey = new Map<string, TeamSeasonStats>();
  const blank = (team: string): TeamSeasonStats => ({
    key: teamKey(team), team, gp: 0, wins: 0, losses: 0, ties: 0, points: 0,
    games: 0, goalsFor: 0, goalsAgainst: 0, scorers: 0, players: 0, pim: 0, recordFromScores: false,
  });

  for (const s of standings) {
    if (s.divisionLabel !== division) continue;
    const t = blank(s.team);
    t.rank = s.rank;
    t.totalTeams = s.totalTeams;
    t.gp = s.gp ?? 0;
    t.wins = s.wins ?? 0;
    t.losses = s.losses ?? 0;
    t.ties = s.ties ?? 0;
    t.points = s.points ?? 0;
    byKey.set(t.key, t);
  }

  // 得失点はスコア表から。順位表に勝敗が無い（52nd の一部）ときはここで数える
  const fromScores = new Map<string, { w: number; l: number; t: number }>();
  for (const g of scores) {
    if (g.divisionLabel !== division || !isPlayed(g)) continue;
    for (const [team, gf, ga] of [
      [g.awayTeam, g.awayScore, g.homeScore],
      [g.homeTeam, g.homeScore, g.awayScore],
    ] as const) {
      const key = teamKey(team);
      if (!byKey.has(key)) byKey.set(key, blank(team));
      const t = byKey.get(key)!;
      t.games += 1;
      t.goalsFor += gf;
      t.goalsAgainst += ga;
      const r = fromScores.get(key) ?? { w: 0, l: 0, t: 0 };
      if (gf > ga) r.w += 1;
      else if (gf < ga) r.l += 1;
      else r.t += 1;
      fromScores.set(key, r);
    }
  }
  for (const t of byKey.values()) {
    if (t.gp === 0 && t.games > 0) {
      const r = fromScores.get(t.key)!;
      t.gp = t.games;
      t.wins = r.w;
      t.losses = r.l;
      t.ties = r.t;
      t.points = r.w * 2 + r.t;
      t.recordFromScores = true;
    }
  }

  for (const p of players) {
    if (p.divisionLabel !== division) continue;
    const t = byKey.get(teamKey(p.team));
    if (!t) continue;
    t.players += 1;
    if (p.goals > 0) t.scorers += 1;
    t.pim += p.pim;
    if (!t.ace || p.points > t.ace.points) t.ace = { name: p.name, goals: p.goals, points: p.points };
  }

  return [...byKey.values()].sort(
    (a, b) => (a.rank ?? 999) - (b.rank ?? 999) || b.points - a.points || a.team.localeCompare(b.team)
  );
}

export interface HeadToHead {
  games: (ScoreRow & { awayScore: number; homeScore: number })[];
  aWins: number;
  bWins: number;
  ties: number;
  aGoals: number;
  bGoals: number;
}

/** 2チームの直接対決（渡したスコア全部から。シーズン・ディビジョンをまたいでよい）。新しい順 */
export function headToHead(scores: ScoreRow[], aTeam: string, bTeam: string): HeadToHead {
  const a = teamKey(aTeam);
  const b = teamKey(bTeam);
  const result: HeadToHead = { games: [], aWins: 0, bWins: 0, ties: 0, aGoals: 0, bGoals: 0 };
  for (const g of scores) {
    if (!isPlayed(g)) continue;
    const away = teamKey(g.awayTeam);
    const home = teamKey(g.homeTeam);
    let aGoals: number;
    let bGoals: number;
    if (away === a && home === b) [aGoals, bGoals] = [g.awayScore, g.homeScore];
    else if (away === b && home === a) [aGoals, bGoals] = [g.homeScore, g.awayScore];
    else continue;
    result.games.push(g);
    result.aGoals += aGoals;
    result.bGoals += bGoals;
    if (aGoals > bGoals) result.aWins += 1;
    else if (aGoals < bGoals) result.bWins += 1;
    else result.ties += 1;
  }
  result.games.sort((x, y) => dateValue(y.date) - dateValue(x.date));
  return result;
}

function dateValue(date: string): number {
  const [y, m, d] = date.split("/").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export interface RadarAxis {
  key: string;
  label: string;
  /** 0〜100（八角形の半径の割合） */
  a: number;
  b: number;
  rawA: string;
  rawB: string;
  hint: string;
  detail: AxisDetail;
}

/** 「根拠」シートに出す説明（数値の出どころと計算） */
export interface AxisDetail {
  /** 何を表す項目か */
  description: string;
  /** 元データ */
  source: string;
  /** 各チームの実際の計算（データなしなら理由） */
  calcA: string;
  calcB: string;
  /** ディビジョン内の順位（良い順。直接対決は無し） */
  rankA?: number;
  rankB?: number;
  /** 順位の母数（データのあるチーム数） */
  ranked?: number;
  best?: { team: string; raw: string };
  worst?: { team: string; raw: string };
  /** 八角形の値の決め方（ひとこと） */
  scale: string;
}

type Metric = {
  key: string;
  label: string;
  hint: string;
  description: string;
  source: (t: TeamSeasonStats) => string;
  /** null = データなし */
  value: (t: TeamSeasonStats) => number | null;
  format: (v: number) => string;
  /** 実際の数字を入れた計算式（データなしなら理由） */
  calc: (t: TeamSeasonStats) => string;
  lowerIsBetter?: boolean;
};

const SCORE_SOURCE = "公式スコア表（結果が入った試合）の得点・失点";
const PLAYER_SOURCE = "公式の個人成績（ディビジョン別）";
const NO_PLAYERS = "個人成績のデータがありません";
const NO_GAMES = "結果が入った試合がありません";
const fmt1 = (v: number) => v.toFixed(1);

const perGame = (n: number, games: number) => (games > 0 ? n / games : null);

export const METRICS: Metric[] = [
  {
    key: "winRate", label: "勝率", hint: "（勝ち＋引き分け×0.5）÷ 試合数",
    description: "シーズンでどれだけ勝ったか。引き分けは0.5勝として数えます。",
    source: (t) =>
      t.recordFromScores
        ? "公式スコア表から数えた勝敗（このシーズンは順位表に勝敗が載っていないため）"
        : "公式順位表の勝敗（試合数・勝ち・負け・引き分け）",
    value: (t) => (t.gp > 0 ? (t.wins + t.ties * 0.5) / t.gp : null),
    format: (v) => `${Math.round(v * 100)}%`,
    calc: (t) =>
      t.gp > 0
        ? `（${t.wins}勝 ＋ ${t.ties}分×0.5）÷ ${t.gp}試合 ＝ ${Math.round(((t.wins + t.ties * 0.5) / t.gp) * 100)}%`
        : NO_GAMES,
  },
  {
    key: "attack", label: "FW力", hint: "1試合あたりの得点",
    description: "攻撃力の目安。1試合に平均何点取っているかです。",
    source: () => SCORE_SOURCE,
    value: (t) => perGame(t.goalsFor, t.games),
    format: fmt1,
    calc: (t) => (t.games > 0 ? `${t.goalsFor}得点 ÷ ${t.games}試合 ＝ ${fmt1(t.goalsFor / t.games)}` : NO_GAMES),
  },
  {
    key: "defense", label: "DF力", hint: "1試合あたりの失点（少ないほど高い）",
    description: "守備力（ゴーリー含む）の目安。1試合に平均何点取られているかで、少ないほど高く評価します。",
    source: () => SCORE_SOURCE,
    value: (t) => perGame(t.goalsAgainst, t.games),
    format: fmt1,
    calc: (t) => (t.games > 0 ? `${t.goalsAgainst}失点 ÷ ${t.games}試合 ＝ ${fmt1(t.goalsAgainst / t.games)}` : NO_GAMES),
    lowerIsBetter: true,
  },
  {
    key: "goalDiff", label: "得失点差", hint: "1試合あたりの得失点差",
    description: "攻守を合わせた総合力。1試合あたり平均何点差をつけているかです。",
    source: () => SCORE_SOURCE,
    value: (t) => perGame(t.goalsFor - t.goalsAgainst, t.games),
    format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
    calc: (t) => {
      if (t.games === 0) return NO_GAMES;
      const v = (t.goalsFor - t.goalsAgainst) / t.games;
      return `（${t.goalsFor}得点 − ${t.goalsAgainst}失点）÷ ${t.games}試合 ＝ ${v > 0 ? "+" : ""}${fmt1(v)}`;
    },
  },
  {
    key: "depth", label: "得点の層", hint: "1点以上取った選手の数",
    description: "得点が一部の選手に偏らず、何人で点を取れているか。1ゴール以上挙げた選手の人数です。",
    source: () => PLAYER_SOURCE,
    value: (t) => (t.scorers > 0 ? t.scorers : null),
    format: (v) => `${v}人`,
    calc: (t) => (t.scorers > 0 ? `1ゴール以上の選手 ${t.scorers}人（個人成績に載っている ${t.players}人中）` : NO_PLAYERS),
  },
  {
    key: "ace", label: "エース力", hint: "チーム最多ポイントの選手",
    description: "チームで一番ポイント（ゴール＋アシスト）を挙げた選手のポイントです。",
    source: () => PLAYER_SOURCE,
    value: (t) => t.ace?.points ?? null,
    format: (v) => `${v}pt`,
    calc: (t) =>
      t.ace
        ? `${t.ace.name}：${t.ace.goals}ゴール ＋ ${t.ace.points - t.ace.goals}アシスト ＝ ${t.ace.points}pt`
        : NO_PLAYERS,
  },
  {
    key: "discipline", label: "規律", hint: "1試合あたりのペナルティ時間（少ないほど高い）",
    description: "反則の少なさ。チーム全員のペナルティ時間（PIM）の合計を試合数で割ったもので、少ないほど高く評価します。",
    source: (t) => `${PLAYER_SOURCE}のPIM合計 ÷ ${t.recordFromScores ? "スコア表" : "公式順位表"}の試合数`,
    value: (t) => (t.gp > 0 && t.scorers > 0 ? t.pim / t.gp : null),
    format: (v) => `${v.toFixed(1)}分`,
    calc: (t) =>
      t.gp > 0 && t.scorers > 0 ? `PIM合計 ${t.pim}分 ÷ ${t.gp}試合 ＝ ${(t.pim / t.gp).toFixed(1)}分` : NO_PLAYERS,
    lowerIsBetter: true,
  },
];

const FLOOR = 10;
const EVEN = 55;

/** ディビジョン内での相対値（最高=100、最低=10、全員同じなら55、データなし=0） */
function relative(value: number | null, all: number[], lowerIsBetter = false): number {
  if (value === null || all.length === 0) return 0;
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (max === min) return EVEN;
  const ratio = lowerIsBetter ? (max - value) / (max - min) : (value - min) / (max - min);
  return FLOOR + (100 - FLOOR) * ratio;
}

/** 良い順の順位（同じ値は同順位） */
function rankOf(value: number | null, all: number[], lowerIsBetter = false): number | undefined {
  if (value === null) return undefined;
  return 1 + all.filter((v) => (lowerIsBetter ? v < value : v > value)).length;
}

function scaleText(lowerIsBetter: boolean | undefined): string {
  return lowerIsBetter ? "少ないほど高評価" : "多いほど高評価";
}

/** 八角形の8軸（7指標＋直接対決） */
export function radarAxes(
  division: TeamSeasonStats[],
  a: TeamSeasonStats,
  b: TeamSeasonStats,
  h2h: HeadToHead
): RadarAxis[] {
  const axes: RadarAxis[] = METRICS.map((m) => {
    const withValue = division
      .map((t) => ({ team: t.team, v: m.value(t) }))
      .filter((x): x is { team: string; v: number } => x.v !== null);
    const all = withValue.map((x) => x.v);
    const va = m.value(a);
    const vb = m.value(b);
    const ordered = [...withValue].sort((x, y) => (m.lowerIsBetter ? x.v - y.v : y.v - x.v));
    const best = ordered[0];
    const worst = ordered[ordered.length - 1];
    return {
      key: m.key,
      label: m.label,
      hint: m.hint,
      a: relative(va, all, m.lowerIsBetter),
      b: relative(vb, all, m.lowerIsBetter),
      rawA: va === null ? "—" : m.format(va),
      rawB: vb === null ? "—" : m.format(vb),
      detail: {
        description: m.description,
        source: m.source(a) === m.source(b) ? m.source(a) : `${a.team}: ${m.source(a)} / ${b.team}: ${m.source(b)}`,
        calcA: m.calc(a),
        calcB: m.calc(b),
        rankA: rankOf(va, all, m.lowerIsBetter),
        rankB: rankOf(vb, all, m.lowerIsBetter),
        ranked: all.length,
        best: best && { team: best.team, raw: m.format(best.v) },
        worst: worst && { team: worst.team, raw: m.format(worst.v) },
        scale: scaleText(m.lowerIsBetter),
      },
    };
  });

  // 直接対決: 勝ち2・引き分け1で勝点を取り合った割合
  const aPts = h2h.aWins * 2 + h2h.ties;
  const bPts = h2h.bWins * 2 + h2h.ties;
  const total = aPts + bPts;
  const record = (w: number, l: number) => `${w}勝${l}敗${h2h.ties}分`;
  axes.push({
    key: "h2h",
    label: "直接対決",
    hint: "直接対決で取った勝点の割合（全シーズン）",
    a: total === 0 ? EVEN : FLOOR + (100 - FLOOR) * (aPts / total),
    b: total === 0 ? EVEN : FLOOR + (100 - FLOOR) * (bPts / total),
    rawA: h2h.games.length ? record(h2h.aWins, h2h.bWins) : "対戦なし",
    rawB: h2h.games.length ? record(h2h.bWins, h2h.aWins) : "対戦なし",
    detail: {
      description:
        "2チームが直接戦った結果。勝ち＝2・引き分け＝1の勝点を、どちらがどれだけ取ったかの割合です。" +
        "ほかの7項目と違い、シーズン・ディビジョンをまたいだ通算です。",
      source: "保存済みの全シーズンの公式スコア表から、この2チームの対戦だけを抜き出したもの",
      calcA: h2h.games.length
        ? `${record(h2h.aWins, h2h.bWins)} → 勝点 ${aPts}（${Math.round((aPts / total) * 100)}%）・総得点 ${h2h.aGoals}`
        : "対戦なし",
      calcB: h2h.games.length
        ? `${record(h2h.bWins, h2h.aWins)} → 勝点 ${bPts}（${Math.round((bPts / total) * 100)}%）・総得点 ${h2h.bGoals}`
        : "対戦なし",
      scale: "勝点の取り分で決まる・対戦なしは互角",
    },
  });
  return axes;
}

/** 差がこれ未満の軸は「互角」とみなす */
export const EVEN_MARGIN = 5;

export function countAdvantages(axes: RadarAxis[]): { a: number; b: number; even: number } {
  let a = 0;
  let b = 0;
  let even = 0;
  for (const x of axes) {
    if (x.a === 0 && x.b === 0) continue;
    if (Math.abs(x.a - x.b) < EVEN_MARGIN) even += 1;
    else if (x.a > x.b) a += 1;
    else b += 1;
  }
  return { a, b, even };
}
