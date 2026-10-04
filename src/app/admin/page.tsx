"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ActivityLog from "@/components/ActivityLog";
import { isTrackingExcluded, setTrackingExcluded } from "@/lib/analyticsClient";
import { VISIT_BUCKETS } from "@/lib/analyticsConstants";

const PAGE_LABELS: Record<string, string> = {
  "/": "ゲーム情報",
  "/player-ranking": "データ（ランク）",
  "/rental": "リンク予定",
  "/events": "イベント",
  "/contact": "お問い合わせ",
  "/disclaimer": "免責事項",
  "/changelog": "バージョン履歴",
};

interface DayData {
  date: string;
  total: number;
  pages: Record<string, number>;
}

// --- PIN 入力コンポーネント ---
function PinInput({ onSubmit, error }: { onSubmit: (code: string) => void; error: string }) {
  const [values, setValues] = useState(["", "", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback((index: number, val: string) => {
    // 英字枠(0,1): 英字のみ → 大文字化、数字枠(2-5): 数字のみ
    let cleaned: string;
    if (index < 2) {
      cleaned = val.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(-1);
    } else {
      cleaned = val.replace(/[^0-9]/g, "").slice(-1);
    }
    const next = [...values];
    next[index] = cleaned;
    setValues(next);
    if (cleaned && index < 5) {
      refs.current[index + 1]?.focus();
    }
  }, [values]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }, [values]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim();
    if (text.length !== 6) return;
    const letters = text.slice(0, 2).toUpperCase();
    const digits = text.slice(2, 6);
    if (!/^[A-Z]{2}$/.test(letters) || !/^\d{4}$/.test(digits)) return;
    const next = [...letters.split(""), ...digits.split("")];
    setValues(next);
    refs.current[5]?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = values.join("");
    if (code.length < 6) return;
    setSubmitting(true);
    await onSubmit(code);
    setSubmitting(false);
  }

  // 全桁入力済みで自動送信
  useEffect(() => {
    const code = values.join("");
    if (code.length === 6 && /^[A-Z]{2}\d{4}$/.test(code)) {
      onSubmit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-800 mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white">管理者認証</h1>
          <p className="text-sm text-gray-500 mt-1">パスコードを入力してください</p>
        </div>

        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {values.map((v, i) => (
            <div key={i}>
              <input
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode={i < 2 ? "text" : "numeric"}
                maxLength={1}
                value={v}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`w-11 h-14 text-center text-xl font-bold rounded-xl border-2 bg-gray-900 text-white focus:outline-none transition-colors ${
                  error ? "border-red-500" : v ? "border-blue-500" : "border-gray-700 focus:border-blue-500"
                }`}
              />
            </div>
          ))}
        </div>

        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={values.join("").length < 6 || submitting}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold transition-colors"
        >
          {submitting ? "認証中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  search: "ゲーム情報 検索ワード",
  card: "カードタップ",
  "rank-search": "ランク検索ワード",
  click: "タップされたボタン・リンク（ページ｜文言）",
};

/** 機能の利用（「ページ > 機能 > 詳細」）をページ → 機能 → 詳細 の階層にして見せる */
function FeatureUsage({ items }: { items: Record<string, number> }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  type Node = { total: number; details: Record<string, number> };
  const pages: Record<string, { total: number; features: Record<string, Node> }> = {};
  for (const [value, count] of Object.entries(items)) {
    const [page, feature = "（その他）", ...rest] = value.split(" > ");
    const p = (pages[page] ??= { total: 0, features: {} });
    p.total += count;
    const f = (p.features[feature] ??= { total: 0, details: {} });
    f.total += count;
    if (rest.length) f.details[rest.join(" > ")] = (f.details[rest.join(" > ")] ?? 0) + count;
  }
  const order = Object.entries(pages).sort(([, a], [, b]) => b.total - a.total);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-300">機能の利用（過去7日）</h2>
      {order.map(([page, p]) => {
        const features = Object.entries(p.features).sort(([, a], [, b]) => b.total - a.total);
        const max = Math.max(...features.map(([, f]) => f.total));
        return (
          <div key={page} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{page}</h3>
              <span className="text-xs text-gray-400">{p.total.toLocaleString()} 回</span>
            </div>
            {features.map(([name, f]) => {
              const key = `${page}>${name}`;
              const details = Object.entries(f.details).sort(([, a], [, b]) => b - a);
              return (
                <div key={name}>
                  <button
                    onClick={() => details.length && setOpenKey((k) => (k === key ? null : key))}
                    className="w-full grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-xs text-left"
                  >
                    <span className="text-gray-200 truncate">
                      {details.length > 0 && <span className="text-gray-500">{openKey === key ? "▼" : "▶"} </span>}
                      {name}
                    </span>
                    <span className="h-2 rounded bg-gray-800 overflow-hidden">
                      <span className="block h-full bg-blue-500" style={{ width: `${(f.total / max) * 100}%` }} />
                    </span>
                    <span className="text-white font-semibold text-right">{f.total}</span>
                  </button>
                  {openKey === key && (
                    <div className="mt-1 ml-4 space-y-0.5">
                      {details.slice(0, 50).map(([d, c]) => (
                        <div key={d} className="flex justify-between text-[11px]">
                          <span className="text-gray-400 truncate mr-2">{d}</span>
                          <span className="text-gray-200">{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

interface VisitorStats {
  since: string | null;
  uv7: number;
  returning7: number;
  uv30: number;
  returning30: number;
  sessions7: number;
  daily: { date: string; visitors: number; returning: number; sessions: number }[];
  devices: Record<string, number>;
  browsers: Record<string, number>;
  referrers: Record<string, number>;
  hours: Record<string, number>;
  dwellSeconds: Record<string, number>;
  visitHistogram: Record<string, number>;
}

const DEVICE_GROUP: Record<string, string> = {
  iPhone: "スマホ", Android: "スマホ",
  iPad: "タブレット", "Androidタブレット": "タブレット",
  Windows: "PC", Mac: "PC",
};

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function percent(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
}

/** 項目ごとの横棒（多い順） */
function BarList({ items, emptyText = "データなし" }: { items: [string, number][]; emptyText?: string }) {
  const rows = items.filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const max = Math.max(...rows.map(([, v]) => v), 1);
  if (rows.length === 0) return <p className="text-sm text-gray-600">{emptyText}</p>;
  return (
    <div className="space-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-28 flex-shrink-0 text-gray-300 truncate">{label}</span>
          <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
            <div className="bg-blue-500 h-3 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="w-16 flex-shrink-0 text-right text-white">
            {value} <span className="text-gray-500">{percent(value, total)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** この端末のアクセスを集計から除外するスイッチ（管理者自身のアクセスを数えないため） */
function TrackingToggle() {
  const [excluded, setExcluded] = useState<boolean | null>(null);
  useEffect(() => setExcluded(isTrackingExcluded()), []);
  if (excluded === null) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-sm">
        <div className="text-white">この端末のアクセス</div>
        <div className={`text-xs mt-0.5 ${excluded ? "text-green-400" : "text-yellow-400"}`}>
          {excluded ? "集計から除外中（数えません）" : "集計しています"}
        </div>
      </div>
      <button
        onClick={() => {
          setTrackingExcluded(!excluded);
          setExcluded(!excluded);
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-200 hover:text-white"
      >
        {excluded ? "集計に含める" : "集計から除外する"}
      </button>
    </div>
  );
}

/** 直近7日のうち、訪問者の計測を始めた日以降の PV（1訪問あたりPV・平均滞在の分母） */
function pvSinceTracking(days: DayData[], todayStr: string, since: string | null) {
  const byPage: Record<string, number> = {};
  let total = 0;
  if (!since) return { total, byPage };
  for (const d of days) {
    const diff = (new Date(todayStr).getTime() - new Date(d.date).getTime()) / 86400000;
    if (diff < 0 || diff >= 7 || d.date < since) continue;
    total += d.total;
    for (const [p, c] of Object.entries(d.pages)) byPage[p] = (byPage[p] ?? 0) + c;
  }
  return { total, byPage };
}

function VisitorsSection({ v, days, todayStr }: { v: VisitorStats; days: DayData[]; todayStr: string }) {
  const pv = pvSinceTracking(days, todayStr, v.since);
  const dwellTotal = Object.values(v.dwellSeconds).reduce((s, x) => s + x, 0);
  const pvByDate = Object.fromEntries(days.map((d) => [d.date, d.total]));
  const devices = Object.entries(v.devices) as [string, number][];
  const deviceGroups: Record<string, number> = {};
  for (const [d, n] of devices) deviceGroups[DEVICE_GROUP[d] ?? "その他"] = (deviceGroups[DEVICE_GROUP[d] ?? "その他"] ?? 0) + n;
  const maxHour = Math.max(...Array.from({ length: 24 }, (_, h) => v.hours[String(h)] ?? 0), 1);

  if (!v.since) {
    return (
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-500">
        訪問者・端末・滞在時間などは、次のアクセスから計測されます。
      </section>
    );
  }

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">
          訪問者（過去7日）<span className="text-xs text-gray-500 font-normal ml-2">{v.since.slice(5).replace("-", "/")} から計測</span>
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "訪問者", value: String(v.uv7), sub: `30日 ${v.uv30}人` },
            { label: "リピーター率", value: percent(v.returning7, v.uv7), sub: `${v.returning7}人` },
            { label: "訪問回数", value: String(v.sessions7), sub: "30分空いたら別の訪問" },
            { label: "1訪問あたりPV", value: v.sessions7 > 0 ? (pv.total / v.sessions7).toFixed(1) : "—", sub: "ページ数" },
            { label: "平均滞在", value: formatDuration(pv.total > 0 ? dwellTotal / pv.total : 0), sub: "1ページあたり" },
            { label: "リピーター率（30日）", value: percent(v.returning30, v.uv30), sub: `${v.returning30}人` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">{value}</div>
              <div className="text-xs text-gray-400 mt-1">{label}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">日別の訪問者（直近14日）</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-normal pb-1">日付</th>
              <th className="text-right font-normal pb-1">訪問者</th>
              <th className="text-right font-normal pb-1">うちリピーター</th>
              <th className="text-right font-normal pb-1">訪問回数</th>
              <th className="text-right font-normal pb-1">PV</th>
            </tr>
          </thead>
          <tbody>
            {v.daily
              .filter((d) => d.date >= (v.since ?? ""))
              .map((d) => (
                <tr key={d.date} className="border-t border-gray-800">
                  <td className="py-1 text-gray-400">{d.date.slice(5).replace("-", "/")}</td>
                  <td className="py-1 text-right text-white">{d.visitors}</td>
                  <td className="py-1 text-right text-gray-300">{d.returning}</td>
                  <td className="py-1 text-right text-gray-300">{d.sessions}</td>
                  <td className="py-1 text-right text-gray-300">{pvByDate[d.date] ?? 0}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">端末（過去7日・訪問者数）</h2>
          <div className="flex gap-4 text-xs text-gray-400 mb-2">
            {["スマホ", "タブレット", "PC", "その他"].map((g) =>
              deviceGroups[g] ? (
                <span key={g}>
                  {g} <span className="text-white">{percent(deviceGroups[g], devices.reduce((s, [, n]) => s + n, 0))}</span>
                </span>
              ) : null
            )}
          </div>
          <BarList items={devices} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">ブラウザ（過去7日・訪問者数）</h2>
          <BarList items={Object.entries(v.browsers)} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">流入元（過去7日・訪問回数）</h2>
          <BarList
            items={Object.entries(v.referrers).map(([k, n]) => [k === "direct" ? "直接（ブックマーク・アプリ内など）" : k, n])}
          />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">来訪日数（これまでの累計・人数）</h2>
          <BarList items={VISIT_BUCKETS.map((b) => [b, Number(v.visitHistogram[b] ?? 0)])} />
        </div>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">時間帯（過去7日・PV・日本時間）</h2>
        <div className="flex items-end gap-0.5 h-20">
          {Array.from({ length: 24 }, (_, h) => {
            const n = v.hours[String(h)] ?? 0;
            return (
              <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}時台 ${n}PV`}>
                <div className="w-full bg-blue-500 rounded-t" style={{ height: `${(n / maxHour) * 100}%`, minHeight: n > 0 ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          {[0, 6, 12, 18, 23].map((h) => (
            <span key={h}>{h}時</span>
          ))}
        </div>
      </section>
    </>
  );
}

// 日付データを月ごとにグループ化
function groupByMonth(days: DayData[]): { month: string; days: DayData[]; total: number }[] {
  const map = new Map<string, DayData[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7); // "2026-04"
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  return Array.from(map.entries()).map(([month, days]) => ({
    month,
    days,
    total: days.reduce((s, d) => s + d.total, 0),
  }));
}

// --- アナリティクス表示 ---
interface TrashEntry {
  id: string;
  code: string;
  sheet: {
    date: string;
    division: string;
    gameNo: string;
    visitor: { name: string; total: number };
    home: { name: string; total: number };
  };
  deletedAt: string;
  deletedBy: { ip: string; userAgent: string; visitorId: string | null };
}

interface SheetLog {
  at: string;
  action: string;
  code?: string;
  game?: string;
  note?: string;
  via?: "link" | "input";
  ip: string;
  userAgent: string;
  visitorId: string | null;
}

const VIA_LABEL: Record<string, { label: string; cls: string }> = {
  link: { label: "共有リンクから", cls: "bg-sky-800/60 text-sky-100" },
  input: { label: "コード入力", cls: "bg-gray-800 text-gray-300 border border-gray-700" },
};

/** どのアプリから開いたか（LINE などのアプリ内ブラウザはリンクを踏んだ目安になる） */
function appOf(ua: string): string | null {
  if (/\bLine\//i.test(ua)) return "LINE内ブラウザ";
  if (/Instagram/i.test(ua)) return "Instagram内ブラウザ";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook内ブラウザ";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return null;
}

const LOG_LABEL: Record<string, { label: string; cls: string }> = {
  read: { label: "アップロード", cls: "bg-blue-700/60 text-blue-100" },
  read_failed: { label: "読取失敗", cls: "bg-gray-700 text-gray-200" },
  save: { label: "保存", cls: "bg-green-700/60 text-green-100" },
  lookup: { label: "呼び出し", cls: "bg-gray-700 text-gray-200" },
  review: { label: "AI総評", cls: "bg-violet-700/60 text-violet-100" },
  delete: { label: "削除", cls: "bg-red-700/70 text-red-100" },
  restore: { label: "復元", cls: "bg-amber-700/60 text-amber-100" },
};

/** スコア表分析の操作ログ（アップロード・保存・呼び出し・AI総評・削除・復元） */
function ScoreSheetLog({ log }: { log: SheetLog[] | null }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  // "lookup:link" / "lookup:input" は呼び出しを経路で絞る
  const shown = (log ?? []).filter((l) => {
    if (!filter) return true;
    const [action, via] = filter.split(":");
    return l.action === action && (!via || l.via === via);
  });
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <section className="space-y-2">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">スコア表の操作ログ（直近{log?.length ?? "…"}件）</h2>
        <span className="text-xs text-blue-400">{open ? "閉じる ▲" : "開く ▼"}</span>
      </button>
      {open && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              ["", "すべて"],
              ...Object.entries(LOG_LABEL).flatMap(([k, v]) =>
                k === "lookup"
                  ? [[k, v.label], ["lookup:link", "└ 共有リンクから"], ["lookup:input", "└ コード入力"]]
                  : [[k, v.label]]
              ),
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-2 py-0.5 rounded-full text-[11px] ${filter === k ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="text-xs text-gray-500">ログはありません。</p>}
          <div className="divide-y divide-gray-800">
            {shown.map((l, i) => {
              const tag = LOG_LABEL[l.action] ?? { label: l.action, cls: "bg-gray-700 text-gray-200" };
              return (
                <div key={i} className="py-1.5 space-y-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 tabular-nums">{fmt(l.at)}</span>
                    <span className={`px-1.5 rounded text-[10px] ${tag.cls}`}>{tag.label}</span>
                    {l.via && VIA_LABEL[l.via] && (
                      <span className={`px-1.5 rounded text-[10px] ${VIA_LABEL[l.via].cls}`}>{VIA_LABEL[l.via].label}</span>
                    )}
                    {l.code && <span className="tracking-wider text-gray-200">{l.code}</span>}
                  </div>
                  {(l.game || l.note) && (
                    <p className="text-[11px] text-gray-300">
                      {l.game}
                      {l.note && <span className="text-gray-500">（{l.note}）</span>}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-500 break-all">
                    {appOf(l.userAgent) && <span className="text-gray-400">{appOf(l.userAgent)} ／ </span>}
                    IP {l.ip} ／ 端末ID {l.visitorId ?? "—"} ／ {l.userAgent}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** 利用者が削除したスコア表（バックアップ180日）と復元 */
function ScoreSheetTrash({ passcode }: { passcode: string }) {
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [log, setLog] = useState<SheetLog[] | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await fetch("/api/admin/scoresheets", { headers: { "x-admin-passcode": passcode } })
      .then((r) => r.json())
      .catch(() => ({ entries: [], log: [] }));
    setEntries(d.entries ?? []);
    setLog(d.log ?? []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passcode]);

  async function restore(e: TrashEntry) {
    if (!confirm(`コード ${e.code} の試合を復元しますか？`)) return;
    const res = await fetch("/api/admin/scoresheets", {
      method: "POST",
      headers: { "x-admin-passcode": passcode, "content-type": "application/json" },
      body: JSON.stringify({ id: e.id }),
    });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? `${e.code} を復元しました。` : d.message ?? "復元できませんでした。");
    load();
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
    <ScoreSheetLog log={log} />
    <section className="space-y-2">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">削除されたスコア表（{entries?.length ?? "…"}）</h2>
        <span className="text-xs text-blue-400">{open ? "閉じる ▲" : "開く ▼"}</span>
      </button>
      {open && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
          <p className="text-[11px] text-gray-500">利用者が削除したデータは180日間ここに残ります。復元すると元のコンテニューコードで呼び出せるようになります。</p>
          {msg && <p className="text-xs text-green-300">{msg}</p>}
          {entries && entries.length === 0 && <p className="text-xs text-gray-500">削除されたデータはありません。</p>}
          {entries?.map((e) => (
            <div key={e.id} className="border border-gray-800 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">{e.sheet.date} {e.sheet.division} #{e.sheet.gameNo}</span>
                <span className="ml-auto tracking-wider text-gray-200">{e.code}</span>
              </div>
              <p className="text-sm text-gray-100">
                {e.sheet.visitor.name} {e.sheet.visitor.total} − {e.sheet.home.total} {e.sheet.home.name}
              </p>
              <p className="text-[11px] text-gray-500 break-all">
                削除 {fmt(e.deletedAt)} ／ IP {e.deletedBy.ip} ／ 端末ID {e.deletedBy.visitorId ?? "—"}
                <br />
                {e.deletedBy.userAgent}
              </p>
              <button onClick={() => restore(e)} className="px-3 py-1 rounded bg-blue-600 text-white text-xs">
                復元する
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
    </>
  );
}

function AnalyticsDashboard({ passcode }: { passcode: string }) {
  const [data, setData] = useState<DayData[] | null>(null);
  const [events, setEvents] = useState<Record<string, Record<string, number>>>({});
  const [visitors, setVisitors] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics", {
      headers: { "x-admin-passcode": passcode },
    })
      .then((r) => {
        if (!r.ok) throw new Error("unauthorized");
        return r.json();
      })
      .then((d) => {
        setData(d.days);
        setEvents(d.events ?? {});
        setVisitors(d.visitors ?? null);
        // 最新月を自動展開
        if (d.days?.length > 0) {
          setExpandedMonth(d.days[0].date.slice(0, 7));
        }
      })
      .catch(() => setError("データの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [passcode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  // 全日付マップ（今日・昨日用）
  const todayStr = new Date().toISOString().slice(0, 10);
  const yday = new Date(); yday.setDate(yday.getDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);
  const todayData = data.find((d) => d.date === todayStr);
  const ydayData = data.find((d) => d.date === ydayStr);
  const weekTotal = data.filter((d) => {
    const diff = (new Date(todayStr).getTime() - new Date(d.date).getTime()) / 86400000;
    return diff >= 0 && diff < 7;
  }).reduce((s, d) => s + d.total, 0);

  const months = groupByMonth(data);

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">アクセス解析</h1>
          <button
            onClick={() => {
              sessionStorage.removeItem("admin_passcode");
              window.location.reload();
            }}
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            ログアウト
          </button>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "今日", value: todayData?.total ?? 0 },
            { label: "昨日", value: ydayData?.total ?? 0 },
            { label: "過去7日", value: weekTotal },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        <TrackingToggle />

        {visitors && <VisitorsSection v={visitors} days={data} todayStr={todayStr} />}

        <ScoreSheetTrash passcode={passcode} />

        {/* 月別PV（アコーディオン） */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-300">日別PV（月別）</h2>
          {months.map(({ month, days, total }) => {
            const isOpen = expandedMonth === month;
            const [y, m] = month.split("-");
            const label = `${y}年${parseInt(m)}月`;
            const maxInMonth = Math.max(...days.map((d) => d.total), 1);
            return (
              <div key={month} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedMonth(isOpen ? null : month)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
                >
                  <span className="text-white font-medium text-sm">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">{total.toLocaleString()} PV</span>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 space-y-1.5">
                    {days.map((d) => {
                      const pct = maxInMonth > 0 ? (d.total / maxInMonth) * 100 : 0;
                      const dateLabel = d.date.slice(5).replace("-", "/");
                      return (
                        <div key={d.date} className="flex items-center gap-2 text-xs">
                          <span className="w-12 text-gray-500 flex-shrink-0">{dateLabel}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                            <div
                              className="bg-blue-500 h-4 rounded-full transition-all flex items-center justify-end pr-1.5"
                              style={{ width: `${Math.max(pct, d.total > 0 ? 8 : 0)}%` }}
                            >
                              {d.total > 0 && (
                                <span className="text-[10px] text-white font-medium">{d.total}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {months.length === 0 && <p className="text-sm text-gray-600">データなし</p>}
        </section>

        {/* 今日のページ別 */}
        {todayData && Object.keys(todayData.pages).length > 0 && (
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">今日のページ別PV</h2>
            <div className="space-y-2">
              {Object.entries(todayData.pages)
                .sort(([, a], [, b]) => b - a)
                .map(([path, count]) => (
                  <div key={path} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{PAGE_LABELS[path] ?? path}</span>
                    <span className="text-white font-semibold">{count}</span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* 過去7日のページ別合計 */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">過去7日のページ別PV・平均滞在</h2>
          <div className="space-y-2">
            {(() => {
              // 平均滞在 = 滞在時間の合計 ÷ 計測を始めた日以降のPV
              const pvTracked = pvSinceTracking(data, todayStr, visitors?.since ?? null).byPage;
              const dwellOf = (path: string) =>
                visitors && pvTracked[path] ? formatDuration((visitors.dwellSeconds[path] ?? 0) / pvTracked[path]) : "—";
              const totals: Record<string, number> = {};
              data.filter((d) => {
                const diff = (new Date(todayStr).getTime() - new Date(d.date).getTime()) / 86400000;
                return diff >= 0 && diff < 7;
              }).forEach((d) => {
                Object.entries(d.pages).forEach(([p, c]) => {
                  totals[p] = (totals[p] ?? 0) + c;
                });
              });
              const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
              if (sorted.length === 0) return <p className="text-sm text-gray-600">データなし</p>;
              return sorted.map(([path, count]) => (
                <div key={path} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{PAGE_LABELS[path] ?? path}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">滞在 {dwellOf(path)}</span>
                    <span className="text-white font-semibold w-8 text-right">{count}</span>
                  </span>
                </div>
              ));
            })()}
          </div>
        </section>

        {events.feature && Object.keys(events.feature).length > 0 && <FeatureUsage items={events.feature} />}

        <ActivityLog passcode={passcode} />

        {/* イベント履歴（過去7日） */}
        {Object.keys(events).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-300">ユーザー行動（過去7日）</h2>
            {Object.entries(events)
              .filter(([ev]) => ev !== "feature")
              .map(([ev, items]) => {
              const sorted = Object.entries(items).sort(([, a], [, b]) => b - a).slice(0, 20);
              return (
                <div key={ev} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">{EVENT_LABELS[ev] ?? ev}</h3>
                  <div className="space-y-1.5">
                    {sorted.map(([value, count]) => (
                      <div key={value} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300 truncate mr-3">{value}</span>
                        <span className="text-white font-semibold flex-shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

// --- メインページ ---
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  // セッション復元
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_passcode");
    if (saved) {
      setPasscode(saved);
      setAuthed(true);
    }
  }, []);

  async function handleLogin(code: string) {
    setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      if (res.ok) {
        // 管理者の端末は自分のアクセスを数えない（管理画面のスイッチで戻せる）
        setTrackingExcluded(true);
        sessionStorage.setItem("admin_passcode", code);
        setPasscode(code);
        setAuthed(true);
      } else {
        setError("パスコードが正しくありません");
      }
    } catch {
      setError("通信エラーが発生しました");
    }
  }

  if (authed && passcode) {
    return <AnalyticsDashboard passcode={passcode} />;
  }

  return <PinInput onSubmit={handleLogin} error={error} />;
}
