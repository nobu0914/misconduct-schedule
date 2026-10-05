// リーグニュース（ゲーム情報の上の枠と /news）。週1回（金曜の朝）AI がサイト内のデータから数本の記事を書く。
//
// 材料: 公式の試合結果・順位・個人成績・日程・お知らせ、前シーズンの優勝、アップロードされたスコア表（ユーザー了承済み）。
// ネガティブな話題（連敗・大敗・反則・ケガ・批判）は書かない。データに無いことは書かない。
// スコア表の記事にはリンクを付けない（コンテニューコードが分かると誰でも削除・修正できるため）。

import { analyzeGame, playerName, type ScoreSheet, type Side } from "./scoreSheet";
import { divisionAwards } from "./seasonAwards";
import { parseSeasonNumber, seasonOrdinal } from "./season";

export interface NewsScore {
  date: string;
  awayTeam: string;
  awayScore: number | null;
  homeTeam: string;
  homeScore: number | null;
  divisionLabel: string;
  played: boolean;
  season: string;
}
export interface NewsStanding {
  rank: number;
  team: string;
  divisionLabel: string;
  points: number;
  gp: number;
  wins: number;
  losses: number;
  ties: number;
  rankChange?: number;
}
export interface NewsPlayer {
  name: string;
  team: string;
  divisionLabel: string;
  goals: number;
  assists: number;
  points: number;
}
export interface NewsMatch {
  date: string;
  timeStart?: string;
  awayTeam: string;
  homeTeam: string;
  division: string;
  status?: string;
  round?: string;
  season?: string;
}
export interface NewsEvent {
  date: string;
  title: string;
  excerpt?: string;
  url: string;
}

export interface NewsInput {
  now: Date;
  /** 今シーズン（"54th"） */
  season?: string;
  scores: NewsScore[];
  standings: NewsStanding[];
  players: NewsPlayer[];
  matches: NewsMatch[];
  events: NewsEvent[];
  sheets: ScoreSheet[];
}

export const NEWS_TAGS = ["試合結果", "注目カード", "選手", "順位", "イベント", "リーグ"] as const;
export type NewsTag = (typeof NEWS_TAGS)[number];

export interface NewsItem {
  title: string;
  body: string;
  tag: NewsTag;
  link?: { label: string; href: string };
}

export interface NewsEdition {
  generatedAt: string;
  items: NewsItem[];
}

const DAY = 86400_000;

/** "2026/10/4" → その日の 00:00 JST の時刻（ms） */
export function jstDay(date: string): number | null {
  const m = date.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) - 9 * 3600_000;
}

/** 日程表のベンチ表記 "(A)" を外す */
const team = (name: string) => name.replace(/\s*[(（][A-Z][)）]\s*$/, "").trim();

const md = (date: string) => date.replace(/^\d{4}\//, "");

/**
 * AI に渡す材料（事実だけ）と、記事に付けてよいリンクの候補を作る。
 * 材料は期間で絞る（直近の結果・これからの試合）ので、古いシーズンの細かい結果は入らない。
 */
export function buildNewsDigest(input: NewsInput): { text: string; links: Record<string, { label: string; href: string }> } {
  const now = input.now.getTime();
  const today = jstDay(new Date(now + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "/"))!;
  const within = (date: string, from: number, to: number) => {
    const d = jstDay(date);
    return d !== null && d >= from && d < to;
  };
  const links: Record<string, { label: string; href: string }> = {};
  let n = 0;
  const link = (label: string, href: string) => {
    const hit = Object.entries(links).find(([, v]) => v.href === href);
    if (hit) return hit[0];
    const id = `L${++n}`;
    links[id] = { label, href };
    return id;
  };
  const lines: string[] = [];
  const dateStr = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  lines.push(`今日: ${dateStr}（日本時間）`);
  if (input.season) lines.push(`今シーズン: MHL ${input.season}`);

  // 前シーズンの優勝（開幕直後の「王者」などの背景）
  const cur = parseSeasonNumber(input.season);
  if (cur !== undefined) {
    const prev = cur - 1;
    const champs = ["Platinum", "Gold", "Silver", "Bronze", "Brass", "Copper", "Iron", "Women Gold", "35&Over"]
      .map((d) => divisionAwards(prev, d))
      .filter((a) => a?.champion)
      .map((a) => `${a!.division}=${a!.champion}${a!.runnerUp ? `（準優勝 ${a!.runnerUp}）` : ""}`);
    if (champs.length) lines.push(`\n■ 前シーズン（${seasonOrdinal(prev)}）のプレイオフ優勝\n${champs.join(" / ")}`);
  }

  // 公式の試合結果（直近7日。少なければ14日）
  const played = input.scores.filter((g) => g.played && g.awayScore !== null && g.homeScore !== null);
  let recent = played.filter((g) => within(g.date, today - 7 * DAY, today + DAY));
  if (recent.length < 3) recent = played.filter((g) => within(g.date, today - 14 * DAY, today + DAY));
  if (recent.length) {
    lines.push("\n■ 直近の公式の試合結果");
    for (const g of recent) {
      const margin = Math.abs(g.awayScore! - g.homeScore!);
      const tags = [g.awayScore === 0 || g.homeScore === 0 ? "完封" : "", margin >= 5 ? "大差" : "", margin === 1 ? "1点差" : "", margin === 0 ? "引き分け" : ""].filter(Boolean);
      lines.push(`${md(g.date)} ${g.divisionLabel}: ${team(g.awayTeam)} ${g.awayScore}-${g.homeScore} ${team(g.homeTeam)}${tags.length ? `（${tags.join("・")}）` : ""}`);
      link(`${g.divisionLabel} のスコア`, `/player-ranking?mode=score&div=${encodeURIComponent(g.divisionLabel)}`);
    }
  }

  // 連勝・無敗（今シーズンの公式結果から）
  if (input.season) {
    const bySeason = played.filter((g) => g.season === input.season).sort((a, b) => (jstDay(a.date) ?? 0) - (jstDay(b.date) ?? 0));
    const results = new Map<string, { div: string; r: ("W" | "L" | "T")[] }>();
    for (const g of bySeason) {
      for (const [me, my, their] of [
        [g.awayTeam, g.awayScore!, g.homeScore!],
        [g.homeTeam, g.homeScore!, g.awayScore!],
      ] as [string, number, number][]) {
        const k = `${g.divisionLabel}|${team(me)}`;
        const x = results.get(k) ?? { div: g.divisionLabel, r: [] };
        x.r.push(my > their ? "W" : my < their ? "L" : "T");
        results.set(k, x);
      }
    }
    const streaks: string[] = [];
    for (const [k, x] of results) {
      let s = 0;
      for (let i = x.r.length - 1; i >= 0 && x.r[i] === "W"; i--) s++;
      const unbeaten = x.r.length >= 3 && !x.r.includes("L");
      if (s >= 3 || unbeaten) streaks.push(`${x.div} ${k.split("|")[1]}: ${s >= 3 ? `${s}連勝中` : ""}${unbeaten ? `${s >= 3 ? "・" : ""}開幕から${x.r.length}試合負けなし` : ""}`);
    }
    if (streaks.length) lines.push(`\n■ 好調なチーム（今シーズン）\n${streaks.join("\n")}`);
  }

  // 順位（今シーズン）
  if (input.standings.length) {
    lines.push("\n■ 順位（今シーズン・ディビジョンごとの上位）");
    const divs = [...new Set(input.standings.map((s) => s.divisionLabel))];
    for (const d of divs) {
      const top = input.standings.filter((s) => s.divisionLabel === d).sort((a, b) => a.rank - b.rank).slice(0, 3);
      lines.push(`${d}: ${top.map((s) => `${s.rank}位 ${s.team}（${s.wins}勝${s.losses}敗${s.ties}分 勝点${s.points}${s.rankChange && s.rankChange > 0 ? ` ↑${s.rankChange}` : ""}）`).join(" / ")}`);
      link(`${d} のチームランキング`, `/player-ranking?div=${encodeURIComponent(d)}`);
    }
    const climbers = input.standings.filter((s) => (s.rankChange ?? 0) >= 2);
    if (climbers.length) lines.push(`順位を上げたチーム: ${climbers.map((s) => `${s.divisionLabel} ${s.team}（${s.rankChange}つ上げて${s.rank}位）`).join(" / ")}`);
  }

  // 個人成績（今シーズン・ディビジョンごとのポイント上位）
  if (input.players.length) {
    lines.push("\n■ 個人ポイント上位（今シーズン）");
    const divs = [...new Set(input.players.map((p) => p.divisionLabel))];
    for (const d of divs) {
      const top = input.players.filter((p) => p.divisionLabel === d).sort((a, b) => b.points - a.points || b.goals - a.goals).slice(0, 3);
      if (top[0]?.points) lines.push(`${d}: ${top.map((p) => `${p.name}（${p.team}）${p.goals}G ${p.assists}A`).join(" / ")}`);
    }
    link("個人ランク", "/player-ranking?mode=search");
  }

  // アップロードされたスコア表（直近21日の試合）
  const sheets = input.sheets.filter((s) => within(s.date, today - 21 * DAY, today + DAY));
  if (sheets.length) {
    lines.push("\n■ スコア表から分かる試合の詳細（記事にしてよい。リンクは付けない）");
    for (const s of sheets) lines.push(sheetFacts(s));
  }

  // 日程表から: 直近7日に行われた試合数と、開幕したばかりか（公式のスコアがまだ載っていないときの材料）
  const seasonMatches = input.matches.filter((m) => m.status !== "postponed" && input.season && m.season === input.season);
  const recentDays = new Map<string, number>();
  for (const m of seasonMatches) if (within(m.date, today - 7 * DAY, today + DAY)) recentDays.set(m.date, (recentDays.get(m.date) ?? 0) + 1);
  if (recentDays.size) {
    const first = seasonMatches.map((m) => jstDay(m.date) ?? Infinity).reduce((x, y) => Math.min(x, y), Infinity);
    const opened = first >= today - 7 * DAY;
    lines.push(
      `\n■ 日程表: 直近7日の試合 ${[...recentDays].map(([d, c]) => `${md(d)} ${c}試合`).join("・")}${opened ? `（${input.season} の開幕節）` : ""}`
    );
  }

  // これからの試合（9日先まで）
  const upcoming = input.matches.filter(
    (m) => m.status !== "postponed" && (!input.season || m.season === input.season || m.round) && within(m.date, today, today + 9 * DAY)
  );
  if (upcoming.length) {
    lines.push("\n■ これからの試合（9日先まで）");
    const rankOf = (div: string, name: string) =>
      input.standings.find((s) => s.divisionLabel === div && team(s.team) === team(name))?.rank;
    const byDay = new Map<string, NewsMatch[]>();
    for (const m of upcoming) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);
    for (const [day, ms] of byDay) {
      lines.push(`${md(day)}: ${ms.length}試合`);
      for (const m of ms) {
        const ra = rankOf(m.division, m.awayTeam);
        const rb = rankOf(m.division, m.homeTeam);
        const champ = cur !== undefined ? divisionAwards(cur - 1, m.division) : undefined;
        const champGame = champ?.champion && [team(m.awayTeam), team(m.homeTeam)].includes(champ.champion);
        const finalRematch =
          champ?.champion && champ.runnerUp && [champ.champion, champ.runnerUp].every((t) => [team(m.awayTeam), team(m.homeTeam)].includes(t));
        const notable = m.round || (ra && rb && ra <= 3 && rb <= 3) || champGame || finalRematch;
        if (!notable) continue;
        const why = [
          m.round ? `プレイオフ ${m.round}` : "",
          ra && rb && ra <= 3 && rb <= 3 ? `${ra}位と${rb}位の対戦` : "",
          finalRematch ? "前シーズン決勝の再戦" : champGame ? "前シーズン王者の試合" : "",
        ].filter(Boolean);
        const id = link(
          `${team(m.awayTeam)} vs ${team(m.homeTeam)} の相性`,
          `/player-ranking?${new URLSearchParams({ mode: "matchup", div: m.division, a: team(m.awayTeam), b: team(m.homeTeam) })}`
        );
        lines.push(`  ${m.timeStart ?? ""} ${m.division}: ${team(m.awayTeam)} vs ${team(m.homeTeam)}（${why.join("・")}）リンク候補 ${id}`);
      }
    }
    link("試合スケジュール", "/");
  } else {
    // 9日先まで試合が無いときは、次の試合日だけ
    const next = seasonMatches
      .filter((m) => (jstDay(m.date) ?? 0) >= today)
      .sort((x, y) => (jstDay(x.date) ?? 0) - (jstDay(y.date) ?? 0))[0];
    if (next) {
      const count = seasonMatches.filter((m) => m.date === next.date).length;
      lines.push(`\n■ 次の試合: ${md(next.date)}（${count}試合）`);
      link("試合スケジュール", "/");
    }
  }

  // 公式のお知らせ（14日以内）
  const events = input.events.filter((e) => within(e.date, today - 14 * DAY, today + DAY));
  if (events.length) {
    lines.push("\n■ 公式のお知らせ（14日以内）");
    for (const e of events) {
      const id = link(e.title.slice(0, 30), e.url);
      lines.push(`${md(e.date)} ${e.title}${e.excerpt ? `: ${e.excerpt.slice(0, 80)}` : ""} リンク候補 ${id}`);
    }
  }

  lines.push("\n■ 記事に付けてよいリンク（id: 内容）");
  for (const [id, l] of Object.entries(links)) lines.push(`${id}: ${l.label}`);
  return { text: lines.join("\n"), links };
}

/** スコア表1枚から、記事になりそうな事実だけを1行にする */
function sheetFacts(s: ScoreSheet): string {
  const a = analyzeGame(s);
  const facts: string[] = [];
  for (const side of ["visitor", "home"] as Side[]) {
    const t = s[side];
    const x = a[side];
    const goals = new Map<string, number>();
    const pts = new Map<string, number>();
    for (const g of s.goals.filter((g) => g.side === side)) {
      if (g.scorer) {
        goals.set(g.scorer, (goals.get(g.scorer) ?? 0) + 1);
        pts.set(g.scorer, (pts.get(g.scorer) ?? 0) + 1);
      }
      for (const as of [g.assist1, g.assist2]) if (as) pts.set(as, (pts.get(as) ?? 0) + 1);
    }
    const who = (no: string) => `#${no}${playerName(t, no) ? ` ${playerName(t, no)}` : ""}（${x.team}）`;
    for (const [no, gl] of goals) if (gl >= 3) facts.push(`${who(no)} ${gl}得点${gl === 3 ? "のハットトリック" : ""}`);
    for (const [no, p] of pts) if (p >= 4 && (goals.get(no) ?? 0) < 3) facts.push(`${who(no)} ${goals.get(no) ?? 0}G ${p - (goals.get(no) ?? 0)}A の${p}ポイント`);
    if (x.goalie.savePct !== null && (x.goalie.shotsFaced ?? 0) >= 15 && x.goalie.savePct >= 0.9 && x.result !== "L")
      facts.push(`${x.team} ゴーリー ${x.goalie.name || `#${x.goalie.no}`} セーブ率${Math.round(x.goalie.savePct * 100)}%（${x.goalie.saves}/${x.goalie.shotsFaced}）`);
    if (x.goalsAgainst === 0 && x.result === "W") facts.push(`${x.team} 完封勝ち`);
    if (x.comeback) facts.push(`${x.team} の逆転勝ち（前半${x.byHalf.for[0]}-${x.byHalf.against[0]}から）`);
    if (x.shortHandedGoals > 0 && x.result !== "L") facts.push(`${x.team} ショートハンドで${x.shortHandedGoals}得点`);
  }
  const review = s.review?.summary ? ` 試合の総評: ${s.review.summary.slice(0, 150)}` : "";
  return `${md(s.date)} ${s.division}: ${s.visitor.name} ${s.visitor.total}-${s.home.total} ${s.home.name}${facts.length ? ` / ${facts.join(" / ")}` : ""}${review}`;
}

const MODEL = "claude-sonnet-5-5";

const PROMPT = `あなたは日本のアマチュアアイスホッケーリーグ「MHL（Metro Hockey League）」の、ファン向けニュースサイトの記者です。
下のデータ（事実）だけを使って、今週のリーグニュースを3〜5本書いてください。Yahoo!ニュースのトップのような、短く読みやすい記事にします。

ルール:
- データに書かれていないことは書かない（推測・誇張・架空のコメントは禁止）。数字・チーム名・選手名はデータのとおりに書く。
- ネガティブな話題は書かない（連敗、大敗した側、反則、ケガ、ミス、批判、不調など）。勝った側・活躍した選手・楽しみな試合・イベントなど、前向きな話題だけ。
- 負けたチームの名前を出すときも、責めたり見下したりしない（「〜を下した」程度にとどめる）。
- 目立った出来事（ハットトリック、連勝、逆転勝ち、完封、首位、前シーズン王者、注目の対戦、イベント）を優先して選ぶ。同じ試合・同じ話題を2本書かない。
- 見出し（title）は全角30文字以内、本文（body）は2〜3文・150文字程度。です・ます調。
- tag は次のどれか: ${["試合結果", "注目カード", "選手", "順位", "イベント", "リーグ"].join(" / ")}
- link はデータ末尾の「記事に付けてよいリンク」の id を1つ（例 "L3"）。合うものが無ければ ""。スコア表の試合の記事は ""。

出力は次の JSON だけ（前後に文章を付けない）:
{"items":[{"title":"...","body":"...","tag":"試合結果","link":"L1"}]}`;

function jsonFromText(content: { type: string; text?: string }[] | undefined): Record<string, unknown> | undefined {
  const text = (content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** AI の出力を検証して記事にする（形式が違うもの・リンク候補に無いものは捨てる） */
export function normalizeNews(raw: unknown, links: Record<string, { label: string; href: string }>): NewsItem[] {
  const items = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const out: NewsItem[] = [];
  for (const it of items) {
    const x = it as Record<string, unknown>;
    if (typeof x?.title !== "string" || typeof x.body !== "string" || !x.title.trim() || !x.body.trim()) continue;
    const tag = (NEWS_TAGS as readonly string[]).includes(x.tag as string) ? (x.tag as NewsTag) : "リーグ";
    const l = typeof x.link === "string" ? links[x.link] : undefined;
    out.push({ title: x.title.trim().slice(0, 40), body: x.body.trim().slice(0, 300), tag, ...(l ? { link: l } : {}) });
  }
  return out.slice(0, 5);
}

export class NewsError extends Error {}

export async function writeNews(digest: { text: string; links: Record<string, { label: string; href: string }> }): Promise<NewsItem[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new NewsError("no_key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: `${PROMPT}\n\n---\n${digest.text}` }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    console.error("league news failed", res.status, (await res.text()).slice(0, 500));
    throw new NewsError(`api_${res.status}`);
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const items = normalizeNews(jsonFromText(body.content), digest.links);
  if (items.length === 0) throw new NewsError("no_result");
  return items;
}
