// 試合のスコア表（紙の Score Sheet）を入力したデータと、その集計。クライアント・サーバー両方から使う。
//
// 公式サイトには試合ごとの得点経過・シュート数（SOG）・反則の記録が無い。スコア表を入力すると、
// ゴーリーのセーブ率・決定率・前後半別の得失点・パワープレー得点・アシストの組み合わせが出せる。
// 時間は各ハーフの経過時間（"mm:ss"）。MHL は 20分ハーフ×2（＋OT）。

export type Side = "visitor" | "home";
/** 1 = 前半、2 = 後半、3 = OT */
export type Half = 1 | 2 | 3;

export interface SheetPlayer {
  no: string;
  name: string;
  /** "C" / "A" / "" */
  role?: string;
  goals?: number;
  assists?: number;
  pim?: number;
}

export interface SheetTeam {
  name: string;
  /** ハーフごとの得点 [前半, 後半, OT] */
  goals: [number, number, number];
  total: number;
  /** ハーフごとのシュート数 [前半, 後半, OT]。未記入は null */
  sog: [number | null, number | null, number | null];
  sogTotal: number | null;
  goalie: { no: string; name: string };
  players: SheetPlayer[];
}

export interface SheetGoal {
  side: Side;
  half: Half;
  time: string;
  scorer: string;
  assist1?: string;
  assist2?: string;
}

export interface SheetPenalty {
  side: Side;
  half: Half;
  no: string;
  time: string;
  minutes: number;
  reason: string;
}

export interface ScoreSheet {
  /** 保存キー（date と gameNo から作る） */
  id?: string;
  date: string; // "2026/9/6"
  time?: string;
  gameNo: string;
  division: string;
  visitor: SheetTeam;
  home: SheetTeam;
  goals: SheetGoal[];
  penalties: SheetPenalty[];
  savedAt?: string;
  /** 保存後に修正した日時 */
  editedAt?: string;
  /** 登録時に残っていた食い違い（要確認）。エラーがあっても登録できるようにしたので記録しておく */
  issues?: string[];
  /** 呼び出し用のコンテニューコード（保存時に発行） */
  continueCode?: string;
  /** AI 総評（初めて分析を開いたときに作って保存する） */
  review?: {
    summary: string;
    teams: { team: string; good: string[]; improve: string[] }[];
    players: string[];
    createdAt: string;
  };
}

export const DIVISIONS = ["Platinum", "Gold", "Silver", "Bronze", "Brass", "Copper", "Iron", "Women Gold", "Women Bronze", "35&Over"];

export function emptyTeam(): SheetTeam {
  return { name: "", goals: [0, 0, 0], total: 0, sog: [null, null, null], sogTotal: null, goalie: { no: "", name: "" }, players: [] };
}

export function emptySheet(): ScoreSheet {
  return { date: "", gameNo: "", division: "", visitor: emptyTeam(), home: emptyTeam(), goals: [], penalties: [] };
}

/** "1:29" → 89 秒（読めなければ null） */
export function parseClock(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2})[:：.](\d{1,2})$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 ? sec : null;
}

/** 何も入っていない（チーム名も得点も無い）か。要確認でも登録できるが、空は登録しない */
export function isBlankSheet(s: ScoreSheet): boolean {
  return !s.visitor.name && !s.home.name && s.goals.length === 0 && s.visitor.total + s.home.total === 0;
}

/** 保存キー。日付も試合番号も読めないときは null（呼び出し側で一意なキーを作る） */
export function sheetId(s: Pick<ScoreSheet, "date" | "gameNo" | "division">): string | null {
  const date = s.date.replace(/[^\d]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const no = s.gameNo.replace(/[^\w]/g, "") || s.division.replace(/[^\w]/g, "");
  return date && no ? `${date}_${no}` : null;
}

const sideName = (s: Side) => (s === "visitor" ? "Visitor" : "Home");
const halfName = (h: Half) => (h === 1 ? "前半" : h === 2 ? "後半" : "OT");

/** 保存前のチェック。errors は分析が正しく出ない食い違い、warnings は確認だけ（どちらがあっても登録はできる） */
export function checkSheet(s: ScoreSheet): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s.date)) errors.push("日付は 2026/9/6 の形で入れてください");
  if (!s.division) errors.push("ディビジョンを選んでください");
  if (!s.visitor.name || !s.home.name) errors.push("両チームの名前を入れてください");

  for (const side of ["visitor", "home"] as const) {
    const t = s[side];
    const label = `${sideName(side)}（${t.name || "?"}）`;
    const sum = t.goals[0] + t.goals[1] + t.goals[2];
    if (sum !== t.total) errors.push(`${label}: ハーフごとの得点の合計 ${sum} と Total ${t.total} が合いません`);
    const listed = s.goals.filter((g) => g.side === side).length;
    if (listed !== t.total) errors.push(`${label}: 得点の記録 ${listed}件 と Total ${t.total} が合いません`);
    for (const h of [1, 2, 3] as const) {
      const inHalf = s.goals.filter((g) => g.side === side && g.half === h).length;
      if (inHalf !== t.goals[h - 1]) warnings.push(`${label}: ${halfName(h)}の得点の記録 ${inHalf}件 と ${t.goals[h - 1]} が合いません`);
    }
    const sogs = t.sog.filter((v): v is number => v !== null);
    if (t.sogTotal !== null && sogs.length > 0) {
      const sogSum = sogs.reduce((a, b) => a + b, 0);
      if (sogSum !== t.sogTotal) warnings.push(`${label}: SOG の合計 ${sogSum} と Total ${t.sogTotal} が合いません`);
    }
    if (t.sogTotal !== null && t.sogTotal < t.total) warnings.push(`${label}: シュート数 ${t.sogTotal} が得点 ${t.total} より少ないです`);
    if (!t.goalie.no && !t.goalie.name) warnings.push(`${label}: ゴーリーが未入力です（セーブ率が出せません）`);
  }

  s.goals.forEach((g, i) => {
    const label = `得点${i + 1}（${sideName(g.side)} ${halfName(g.half)} ${g.time || "?"}）`;
    if (parseClock(g.time) === null) errors.push(`${label}: 時間は 12:34 の形で入れてください`);
    if (!g.scorer) errors.push(`${label}: 得点者の番号がありません`);
    if (g.assist1 && g.assist1 === g.scorer) warnings.push(`${label}: 得点者とアシストが同じ番号です`);
  });
  s.penalties.forEach((p, i) => {
    const label = `反則${i + 1}（${sideName(p.side)} ${halfName(p.half)} ${p.time || "?"}）`;
    if (parseClock(p.time) === null) errors.push(`${label}: 時間は 12:34 の形で入れてください`);
    if (!(p.minutes > 0)) errors.push(`${label}: 分数を入れてください`);
  });
  return { errors, warnings };
}

// ───────── 集計 ─────────

export interface GameAnalysis {
  side: Side;
  team: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  byHalf: { for: [number, number, number]; against: [number, number, number] };
  shots: number | null;
  shotsAgainst: number | null;
  /** 決定率（得点 ÷ シュート） */
  shootingPct: number | null;
  goalie: { no: string; name: string; saves: number | null; shotsFaced: number | null; savePct: number | null };
  powerPlayGoals: number;
  shortHandedGoals: number;
  penaltyMinutes: number;
  scoredFirst: boolean;
  result: "W" | "L" | "T";
  /** 前半を負けていて勝った */
  comeback: boolean;
}

/**
 * 反則で退場している時間帯 [開始, 終了)（同じハーフ内）。2分以下の反則は、相手が
 * その間に得点したらそこで明ける（パワープレーのゴールで反則が終わるルール）。
 */
function penaltyWindow(s: ScoreSheet, p: SheetPenalty): { start: number; end: number } | null {
  const start = parseClock(p.time);
  if (start === null) return null;
  let end = start + p.minutes * 60;
  if (p.minutes <= 2) {
    for (const g of s.goals) {
      const t = parseClock(g.time);
      if (g.side !== p.side && g.half === p.half && t !== null && t > start && t < end) end = t + 0.5;
    }
  }
  return { start, end };
}

function inPenalty(s: ScoreSheet, p: SheetPenalty, half: Half, sec: number): boolean {
  if (p.half !== half) return false;
  const w = penaltyWindow(s, p);
  return w !== null && sec >= w.start && sec < w.end;
}

/** 各得点が パワープレー（PP）・ショートハンド（SH）・通常（""）のどれか。s.goals と同じ順 */
export function goalSituations(s: ScoreSheet): ("PP" | "SH" | "")[] {
  return s.goals.map((g) => {
    const sec = parseClock(g.time);
    if (sec === null) return "";
    const opp: Side = g.side === "visitor" ? "home" : "visitor";
    const oppIn = s.penalties.some((p) => p.side === opp && inPenalty(s, p, g.half, sec));
    const ownIn = s.penalties.some((p) => p.side === g.side && inPenalty(s, p, g.half, sec));
    return oppIn && !ownIn ? "PP" : ownIn && !oppIn ? "SH" : "";
  });
}

export function goalOrder(a: SheetGoal, b: SheetGoal): number {
  return a.half - b.half || (parseClock(a.time) ?? 0) - (parseClock(b.time) ?? 0);
}

/** シュート数の合計。Total 欄が空ならハーフごとの数を足す（用紙の Total が書かれていないことがある） */
export function shotsOf(t: SheetTeam): number | null {
  if (t.sogTotal !== null) return t.sogTotal;
  const halves = t.sog.filter((v): v is number => v !== null);
  return halves.length > 0 ? halves.reduce((a, b) => a + b, 0) : null;
}

export function analyzeGame(s: ScoreSheet): Record<Side, GameAnalysis> {
  const first = [...s.goals].sort(goalOrder)[0];
  const make = (side: Side): GameAnalysis => {
    const oppSide: Side = side === "visitor" ? "home" : "visitor";
    const t = s[side];
    const o = s[oppSide];
    const situations = goalSituations(s);
    const mine = situations.filter((_, i) => s.goals[i].side === side);
    const pp = mine.filter((x) => x === "PP").length;
    const sh = mine.filter((x) => x === "SH").length;
    const shots = shotsOf(t);
    const shotsFaced = shotsOf(o);
    const saves = shotsFaced !== null ? Math.max(0, shotsFaced - o.total) : null;
    const firstHalfDiff = t.goals[0] - o.goals[0];
    const result = t.total > o.total ? "W" : t.total < o.total ? "L" : "T";
    return {
      side,
      team: t.name,
      opponent: o.name,
      goalsFor: t.total,
      goalsAgainst: o.total,
      byHalf: { for: t.goals, against: o.goals },
      shots,
      shotsAgainst: shotsFaced,
      shootingPct: shots ? t.total / shots : null,
      goalie: {
        ...t.goalie,
        saves,
        shotsFaced,
        savePct: shotsFaced ? (saves ?? 0) / shotsFaced : null,
      },
      powerPlayGoals: pp,
      shortHandedGoals: sh,
      penaltyMinutes: s.penalties.filter((p) => p.side === side).reduce((a, p) => a + p.minutes, 0),
      scoredFirst: first?.side === side,
      result,
      comeback: firstHalfDiff < 0 && result === "W",
    };
  };
  return { visitor: make("visitor"), home: make("home") };
}

/** 番号から名前（スコア表の選手欄から） */
export function playerName(team: SheetTeam, no: string | undefined): string {
  if (!no) return "";
  if (team.goalie.no === no) return team.goalie.name;
  return team.players.find((p) => p.no === no)?.name ?? "";
}

export interface TeamTotals {
  team: string;
  division: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: [number, number, number];
  goalsAgainst: [number, number, number];
  shots: number;
  shotsGames: number;
  shotGoals: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  penaltyMinutes: number;
  scoredFirstGames: number;
  scoredFirstWins: number;
  comebacks: number;
}

export interface GoalieTotals {
  name: string;
  no: string;
  team: string;
  division: string;
  games: number;
  shotsFaced: number;
  goalsAgainst: number;
  saves: number;
}

export interface Combo {
  team: string;
  division: string;
  from: string;
  to: string;
  count: number;
}

export function aggregate(sheets: ScoreSheet[]) {
  const teams = new Map<string, TeamTotals>();
  const goalies = new Map<string, GoalieTotals>();
  const combos = new Map<string, Combo>();
  for (const s of sheets) {
    const a = analyzeGame(s);
    for (const side of ["visitor", "home"] as const) {
      const g = a[side];
      const key = `${s.division}|${g.team}`;
      const t =
        teams.get(key) ??
        ({
          team: g.team, division: s.division, games: 0, wins: 0, losses: 0, ties: 0,
          goalsFor: [0, 0, 0], goalsAgainst: [0, 0, 0], shots: 0, shotsGames: 0, shotGoals: 0,
          powerPlayGoals: 0, shortHandedGoals: 0, penaltyMinutes: 0, scoredFirstGames: 0, scoredFirstWins: 0, comebacks: 0,
        } satisfies TeamTotals);
      t.games += 1;
      if (g.result === "W") t.wins += 1;
      else if (g.result === "L") t.losses += 1;
      else t.ties += 1;
      for (const i of [0, 1, 2]) {
        t.goalsFor[i] += g.byHalf.for[i];
        t.goalsAgainst[i] += g.byHalf.against[i];
      }
      if (g.shots !== null) {
        t.shots += g.shots;
        t.shotsGames += 1;
        t.shotGoals += g.goalsFor;
      }
      t.powerPlayGoals += g.powerPlayGoals;
      t.shortHandedGoals += g.shortHandedGoals;
      t.penaltyMinutes += g.penaltyMinutes;
      if (g.scoredFirst) {
        t.scoredFirstGames += 1;
        if (g.result === "W") t.scoredFirstWins += 1;
      }
      if (g.comeback) t.comebacks += 1;
      teams.set(key, t);

      if ((g.goalie.no || g.goalie.name) && g.goalie.shotsFaced !== null) {
        const gk = `${key}|${g.goalie.no || g.goalie.name}`;
        const v = goalies.get(gk) ?? { name: g.goalie.name, no: g.goalie.no, team: g.team, division: s.division, games: 0, shotsFaced: 0, goalsAgainst: 0, saves: 0 };
        v.games += 1;
        v.shotsFaced += g.goalie.shotsFaced;
        v.goalsAgainst += g.goalsAgainst;
        v.saves += g.goalie.saves ?? 0;
        if (!v.name && g.goalie.name) v.name = g.goalie.name;
        goalies.set(gk, v);
      }
    }
    for (const goal of s.goals) {
      if (!goal.assist1) continue;
      const team = s[goal.side];
      const name = (no: string) => `#${no}${playerName(team, no) ? ` ${playerName(team, no)}` : ""}`;
      const key = `${s.division}|${team.name}|${goal.assist1}|${goal.scorer}`;
      const c = combos.get(key) ?? { team: team.name, division: s.division, from: name(goal.assist1), to: name(goal.scorer), count: 0 };
      c.count += 1;
      combos.set(key, c);
    }
  }
  return {
    teams: [...teams.values()].sort((x, y) => x.division.localeCompare(y.division) || y.wins - x.wins),
    goalies: [...goalies.values()].sort((x, y) => y.saves / (y.shotsFaced || 1) - x.saves / (x.shotsFaced || 1)),
    combos: [...combos.values()].sort((x, y) => y.count - x.count),
  };
}

// ───────── 保存前の整形（誰でも送れるので、サーバーで形と大きさを揃える） ─────────

const MAX_TEXT = 40;
const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : typeof v === "number" ? String(v) : "");
const count = (v: unknown, max = 99) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
const countOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(999, Math.max(0, Math.round(v))) : null);
const toHalf = (v: unknown): Half => (v === 2 ? 2 : v === 3 ? 3 : 1);
const toSide = (v: unknown): Side | null => (v === "visitor" || v === "home" ? v : null);

function sanitizeTeam(raw: unknown): SheetTeam {
  const t = (raw ?? {}) as Partial<SheetTeam>;
  const g = Array.isArray(t.goals) ? t.goals : [];
  const sog = Array.isArray(t.sog) ? t.sog : [];
  return {
    name: text(t.name),
    goals: [count(g[0]), count(g[1]), count(g[2])],
    total: count(t.total),
    sog: [countOrNull(sog[0]), countOrNull(sog[1]), countOrNull(sog[2])],
    sogTotal: countOrNull(t.sogTotal),
    goalie: { no: text(t.goalie?.no), name: text(t.goalie?.name) },
    players: (Array.isArray(t.players) ? t.players : []).slice(0, 40).map((p) => ({
      no: text(p?.no),
      name: text(p?.name),
      role: text(p?.role).slice(0, 1),
      goals: count(p?.goals),
      assists: count(p?.assists),
      pim: count(p?.pim, 999),
    })),
  };
}

export function sanitizeSheet(raw: unknown): ScoreSheet {
  const r = (raw ?? {}) as Partial<ScoreSheet>;
  return {
    date: text(r.date),
    time: text(r.time),
    gameNo: text(r.gameNo).replace(/^#/, ""),
    division: DIVISIONS.includes(text(r.division)) ? text(r.division) : "",
    visitor: sanitizeTeam(r.visitor),
    home: sanitizeTeam(r.home),
    goals: (Array.isArray(r.goals) ? r.goals : []).slice(0, 80).flatMap((g) => {
      const side = toSide(g?.side);
      return side
        ? [{ side, half: toHalf(g.half), time: text(g.time), scorer: text(g.scorer), assist1: text(g.assist1) || undefined, assist2: text(g.assist2) || undefined }]
        : [];
    }),
    penalties: (Array.isArray(r.penalties) ? r.penalties : []).slice(0, 80).flatMap((p) => {
      const side = toSide(p?.side);
      return side ? [{ side, half: toHalf(p.half), no: text(p.no), time: text(p.time), minutes: count(p.minutes, 20), reason: text(p.reason) }] : [];
    }),
  };
}

// ───────── コンテニューコード ─────────
// 会員登録なしで、保存したデータを呼び出すためのコード（例 "K7QM3XRA"）。
// 半角の大文字と数字だけで、利用者が自由に決められる（4〜8文字。ユーザー指示は「最大8文字」、
// 短すぎると他人に当てられて見られる・消されるので4文字以上にした）。
// おまかせで作る候補だけは、読み間違えやすい 0/O・1/I/L を使わない（31文字 × 8桁）。
export const CONTINUE_MIN = 4;
export const CONTINUE_MAX = 8;

export const CONTINUE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 正しいコンテニューコード（半角大文字・数字 4〜8文字）なら そのまま、違えば null */
export function normalizeContinueCode(input: string): string | null {
  return new RegExp(`^[A-Z0-9]{${CONTINUE_MIN},${CONTINUE_MAX}}$`).test(input) ? input : null;
}

/** おまかせのコード（8文字、読み間違えにくい文字だけ） */
export function suggestContinueCode(random: (n: number) => number): string {
  return Array.from({ length: CONTINUE_MAX }, () => CONTINUE_ALPHABET[random(CONTINUE_ALPHABET.length)]).join("");
}

/** 入力欄で打った文字を、使える文字（半角大文字・数字）だけにする */
export function continueCodeInput(typed: string): string {
  return typed
    .replace(/[ａ-ｚＡ-Ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CONTINUE_MAX);
}
