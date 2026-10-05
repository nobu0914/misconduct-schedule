// 管理画面のアクセス解析レポート（週1回、月曜 7:00 JST に AI が総評を書く）。サーバー専用。
//
// 対象は「直近の7日（昨日まで、UTC の日付キー）」と、その前の7日（比較用）。集計は /api/track が記録した KV をそのまま読む。
//   news と同じく、保存は analytics:report:latest（いまの号）と analytics:report:history（新しい順・52号）。

import { LEAGUE_RULES } from "./aiRules";
import { kv } from "@vercel/kv";
import { TRACKED_PAGES, pageLabelOf, type ActivityEntry, ACTIVITY_LOG_KEY } from "./analyticsConstants";
import { SHEET_LOG_KEY, type SheetLogEntry } from "./scoreSheetLog";

export const REPORT_LATEST_KEY = "analytics:report:latest";
const HISTORY_KEY = "analytics:report:history";
const HISTORY_MAX = 52;

export interface WeekNumbers {
  from: string;
  to: string;
  pv: number;
  visitors: number;
  returning: number;
  sessions: number;
  pages: Record<string, number>;
}

export interface AnalyticsReport {
  generatedAt: string;
  week: WeekNumbers;
  prev: WeekNumbers;
  summary: string;
  good: string[];
  concerns: string[];
  suggestions: string[];
}

const DAY = 86400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

async function sumHashes(prefix: string, dates: string[]): Promise<Record<string, number>> {
  const all = await Promise.all(dates.map((d) => kv.hgetall<Record<string, number>>(`${prefix}:${d}`).catch(() => null)));
  const out: Record<string, number> = {};
  for (const h of all) for (const [k, v] of Object.entries(h ?? {})) out[k] = (out[k] ?? 0) + Number(v);
  return out;
}

async function weekNumbers(dates: string[]): Promise<WeekNumbers> {
  const unique = async (prefix: string) => {
    const [first, ...rest] = dates.map((d) => `${prefix}:${d}`);
    return kv.pfcount(first, ...rest).catch(() => 0);
  };
  const pageKeys = dates.flatMap((d) => TRACKED_PAGES.map((p) => `pv:${d}:${p}`));
  const [totals, pageValues, sessions, visitors, returning] = await Promise.all([
    kv.mget<(number | null)[]>(...dates.map((d) => `pv:${d}:total`)),
    kv.mget<(number | null)[]>(...pageKeys),
    kv.mget<(number | null)[]>(...dates.map((d) => `ss:${d}`)),
    unique("uv"),
    unique("uvret"),
  ]);
  const pages: Record<string, number> = {};
  pageKeys.forEach((k, i) => {
    const label = pageLabelOf(k.split(":").slice(2).join(":"));
    pages[label] = (pages[label] ?? 0) + (Number(pageValues[i]) || 0);
  });
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (Number(v) || 0), 0);
  return { from: dates[dates.length - 1], to: dates[0], pv: sum(totals), visitors, returning, sessions: sum(sessions), pages };
}

const top = (h: Record<string, number>, n: number) =>
  Object.entries(h)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

/** 材料（数字）を集めて文章にする */
export async function buildReportDigest(now = new Date()): Promise<{ text: string; week: WeekNumbers; prev: WeekNumbers }> {
  const today = Date.parse(ymd(now.getTime()));
  const week = Array.from({ length: 7 }, (_, i) => ymd(today - (i + 1) * DAY));
  const prevWeek = Array.from({ length: 7 }, (_, i) => ymd(today - (i + 8) * DAY));
  const [w, p, devices, browsers, referrers, hours, dwell, features, clicks, sheetLog, act] = await Promise.all([
    weekNumbers(week),
    weekNumbers(prevWeek),
    sumHashes("dev", week),
    sumHashes("br", week),
    sumHashes("ref", week),
    sumHashes("hr", week),
    sumHashes("dw", week),
    Promise.all(week.map((d) => kv.hgetall<Record<string, number>>(`ev:${d}:feature`).catch(() => null))).then((hs) => {
      const out: Record<string, number> = {};
      for (const h of hs) for (const [k, v] of Object.entries(h ?? {})) out[k] = (out[k] ?? 0) + Number(v);
      return out;
    }),
    Promise.all(week.map((d) => kv.hgetall<Record<string, number>>(`ev:${d}:click`).catch(() => null))).then((hs) => {
      const out: Record<string, number> = {};
      for (const h of hs) for (const [k, v] of Object.entries(h ?? {})) out[k] = (out[k] ?? 0) + Number(v);
      return out;
    }),
    kv.lrange<SheetLogEntry>(SHEET_LOG_KEY, 0, 1999).catch(() => []),
    kv.lrange<ActivityEntry>(ACTIVITY_LOG_KEY, 0, 4999).catch(() => []),
  ]);

  const from = Date.parse(week[6]);
  const to = today;
  const inWeek = (iso: string) => {
    const t = Date.parse(iso);
    return t >= from && t < to;
  };
  const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%` : "前週データなし");
  const lines = [
    `期間: ${w.from}〜${w.to}（前週 ${p.from}〜${p.to}）`,
    `PV ${w.pv}（前週 ${p.pv}、${pct(w.pv, p.pv)}）/ 訪問者 ${w.visitors}（前週 ${p.visitors}、${pct(w.visitors, p.visitors)}）/ うちリピーター ${w.returning} / 訪問 ${w.sessions}（前週 ${p.sessions}）`,
    `ページ別PV: ${Object.entries(w.pages)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${v}（前週 ${p.pages[k] ?? 0}）`)
      .join(" / ")}`,
    `端末: ${top(devices, 6).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `ブラウザ: ${top(browsers, 6).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `流入元（訪問）: ${top(referrers, 8).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `時間帯（JST, PV上位）: ${top(hours, 6).map(([k, v]) => `${k}時 ${v}`).join(" / ")}`,
  ];
  const dwellTotal = Object.values(dwell).reduce((s, v) => s + v, 0);
  if (w.pv > 0 && dwellTotal > 0) {
    lines.push(
      `滞在時間（ページ別の合計秒）: ${top(dwell, 6)
        .map(([k, v]) => `${pageLabelOf(k)} ${Math.round(v / 60)}分`)
        .join(" / ")}`
    );
  }
  if (Object.keys(features).length) lines.push(`機能の利用（上位）: ${top(features, 30).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
  if (Object.keys(clicks).length) lines.push(`タップ（上位）: ${top(clicks, 12).map(([k, v]) => `${k} ${v}`).join(" / ")}`);

  const ops = (sheetLog ?? []).filter((e) => inWeek(e.at));
  if (ops.length) {
    const count: Record<string, number> = {};
    for (const e of ops) {
      const k = e.action === "lookup" && e.via ? `lookup(${e.via})` : e.action;
      count[k] = (count[k] ?? 0) + 1;
    }
    lines.push(`スコア表分析の操作: ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
  }

  // 行動ログ: 訪問ごとの操作数（30分空いたら別の訪問）
  const acts = (act ?? []).filter((e) => inWeek(e.at)).sort((a, b) => a.at.localeCompare(b.at));
  if (acts.length) {
    const last = new Map<string, number>();
    const visits: number[] = [];
    const firstPages: Record<string, number> = {};
    for (const e of acts) {
      const t = Date.parse(e.at);
      const prev = last.get(e.vid);
      if (prev === undefined || t - prev > 30 * 60_000) {
        visits.push(0);
        if (e.t === "pv") {
          const page = pageLabelOf(e.v.split("?")[0]);
          firstPages[page] = (firstPages[page] ?? 0) + 1;
        }
      }
      visits[visits.length - 1] += 1;
      last.set(e.vid, t);
    }
    const avg = visits.reduce((s, v) => s + v, 0) / visits.length;
    lines.push(
      `行動ログ: 訪問 ${visits.length}回・1訪問あたりの操作 ${avg.toFixed(1)}回・1操作だけで終わった訪問 ${visits.filter((v) => v <= 1).length}回 / 最初に開いたページ: ${top(firstPages, 5)
        .map(([k, v]) => `${k} ${v}`)
        .join(" / ")}`
    );
  }
  return { text: lines.join("\n"), week: w, prev: p };
}

const MODEL = "claude-sonnet-5-5";

const PROMPT = `あなたは小さなファン向けウェブサイト（アイスホッケーリーグ MHL の非公式ツール「Rinnavi」）のアクセス解析の担当者です。

${LEAGUE_RULES}
下の1週間の数字だけを使って、サイト運営者向けの週次レポートを書いてください。

サイトの構成: ゲーム情報（試合日程・リーグニュース）、データ（ランク・チーム総評・相性・個人・スコア・スコア表分析）、リンク予定（リンクの貸し出し予定・水曜練習会）、イベント、お問い合わせ。
機能の利用は「ページ > 機能 > 詳細」の形で、何回使われたか。

ルール:
- 数字に無いことは書かない（推測で原因を断定しない。考えられる理由は「〜かもしれません」）。前週との比較を必ず入れる。
- summary は2〜3文（150文字程度）で、この週の全体像。
- good はよく使われた・伸びた点を2〜4個、concerns は気になる点（減った・使われていない機能・すぐ帰る訪問など）を1〜3個、
  suggestions は運営者がすぐできる改善案を2〜3個。各60文字以内。具体的な数字や機能名を入れる。
- です・ます調。

出力は次の JSON だけ（前後に文章を付けない）:
{"summary":"...","good":["..."],"concerns":["..."],"suggestions":["..."]}`;

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

/** 数字を集めて AI にレポートを書かせ、保存する */
export async function generateAnalyticsReport(): Promise<{ report: AnalyticsReport; digest: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no_key");
  const { text, week, prev } = await buildReportDigest();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: "user", content: `${PROMPT}\n\n---\n${text}` }] }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    console.error("analytics report failed", res.status, (await res.text()).slice(0, 500));
    throw new Error(`api_${res.status}`);
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = jsonFromText(body.content);
  if (!raw || typeof raw.summary !== "string") throw new Error("no_result");
  const list = (v: unknown, n: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, n) : [];
  const report: AnalyticsReport = {
    generatedAt: new Date().toISOString(),
    week,
    prev,
    summary: raw.summary.trim().slice(0, 400),
    good: list(raw.good, 4),
    concerns: list(raw.concerns, 3),
    suggestions: list(raw.suggestions, 3),
  };
  await kv.set(REPORT_LATEST_KEY, report);
  await kv.lpush(HISTORY_KEY, report);
  await kv.ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1);
  return { report, digest: text };
}

export async function loadReports(): Promise<{ latest: AnalyticsReport | null; history: AnalyticsReport[] }> {
  const [latest, history] = await Promise.all([
    kv.get<AnalyticsReport>(REPORT_LATEST_KEY).catch(() => null),
    kv.lrange<AnalyticsReport>(HISTORY_KEY, 1, 12).catch(() => []),
  ]);
  return { latest: latest ?? null, history: history ?? [] };
}
