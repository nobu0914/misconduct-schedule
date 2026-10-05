"use client";

// 管理画面: アクセス解析の週次レポート（AI総評）。毎週月曜 7:00 に自動で作る。「今すぐ作り直す」もできる
import { useEffect, useState } from "react";
import type { AnalyticsReport, WeekNumbers } from "@/lib/analyticsReport";

const md = (ymd: string) => ymd.slice(5).replace("-", "/").replace(/^0/, "").replace(/\/0/, "/");

function Change({ now, prev }: { now: number; prev: number }) {
  if (!prev) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  return <span className={`text-[10px] ml-1 ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>{pct >= 0 ? `▲${pct}` : `▼${-pct}`}%</span>;
}

function Numbers({ w, p }: { w: WeekNumbers; p: WeekNumbers }) {
  const items: [string, number, number][] = [
    ["PV", w.pv, p.pv],
    ["訪問者", w.visitors, p.visitors],
    ["リピーター", w.returning, p.returning],
    ["訪問", w.sessions, p.sessions],
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map(([label, n, b]) => (
        <div key={label} className="rounded-lg bg-gray-800/60 px-2 py-1.5 text-center">
          <p className="text-[10px] text-gray-500">{label}</p>
          <p className="text-base font-bold text-white leading-tight">
            {n.toLocaleString()}
            <Change now={n} prev={b} />
          </p>
        </div>
      ))}
    </div>
  );
}

function ReportBody({ r }: { r: AnalyticsReport }) {
  const block = (title: string, items: string[], mark: string, cls: string) =>
    items.length > 0 && (
      <div>
        <p className="text-[11px] text-gray-400 mb-0.5">{title}</p>
        <ul className="space-y-0.5">
          {items.map((x) => (
            <li key={x} className={`text-xs ${cls}`}>
              {mark} {x}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-gray-500">
        {md(r.week.from)}〜{md(r.week.to)}（前週比）
      </p>
      <Numbers w={r.week} p={r.prev} />
      <p className="text-sm text-gray-100 leading-relaxed">{r.summary}</p>
      {block("よかった点", r.good, "◎", "text-gray-200")}
      {block("気になる点", r.concerns, "△", "text-amber-200")}
      {block("改善のアイデア", r.suggestions, "▶", "text-sky-200")}
    </div>
  );
}

export default function AdminReport({ passcode }: { passcode: string }) {
  const [latest, setLatest] = useState<AnalyticsReport | null | undefined>(undefined);
  const [history, setHistory] = useState<AnalyticsReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openPast, setOpenPast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics-report", { headers: { "x-admin-passcode": passcode } })
      .then((r) => r.json())
      .then((d) => {
        setLatest(d.latest ?? null);
        setHistory(d.history ?? []);
      })
      .catch(() => setLatest(null));
  }, [passcode]);

  async function regenerate() {
    if (!confirm("直近7日（昨日まで）の数字で、AI のレポートを作り直します。よろしいですか？")) return;
    setBusy(true);
    setMsg("作成中…（1分ほどかかります）");
    const res = await fetch("/api/admin/analytics-report", { method: "POST", headers: { "x-admin-passcode": passcode } }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && d?.report) {
      if (latest) setHistory((h) => [latest, ...h]);
      setLatest(d.report);
      setMsg("");
    } else setMsg(`作れませんでした（${d?.error ?? res?.status ?? "通信エラー"}）`);
  }

  return (
    <section className="bg-gray-900 border border-violet-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-violet-200">✨ 今週のレポート（AI総評）</h2>
        <button onClick={() => void regenerate()} disabled={busy} className="ml-auto px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 disabled:opacity-50">
          今すぐ作り直す
        </button>
      </div>
      {msg && <p className="text-xs text-gray-300">{msg}</p>}
      {latest === undefined && <p className="text-xs text-gray-500">読み込み中…</p>}
      {latest === null && !busy && <p className="text-xs text-gray-500">まだレポートはありません。毎週月曜 7:00 に自動で作ります（「今すぐ作り直す」でも作れます）。</p>}
      {latest && <ReportBody r={latest} />}
      {history.length > 0 && (
        <div className="pt-2 border-t border-gray-800 space-y-1.5">
          <p className="text-[11px] text-gray-500">過去のレポート</p>
          {history.map((r) => (
            <div key={r.generatedAt}>
              <button onClick={() => setOpenPast((k) => (k === r.generatedAt ? null : r.generatedAt))} className="text-xs text-gray-300">
                {openPast === r.generatedAt ? "▼" : "▶"} {md(r.week.from)}〜{md(r.week.to)}
              </button>
              {openPast === r.generatedAt && (
                <div className="mt-1.5 ml-3">
                  <ReportBody r={r} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-600">毎週月曜 7:00 に、直近7日（昨日まで）の数字から AI が書きます。管理画面にログインした端末のアクセスは含みません。</p>
    </section>
  );
}
