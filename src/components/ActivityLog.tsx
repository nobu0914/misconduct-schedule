"use client";

// 管理画面: 行動ログ。端末ごと・訪問（30分以上空いたら別の訪問）ごとに、開いたページと使った機能を時系列で並べる。
import { useMemo, useState } from "react";
import { pageLabelOf, type ActivityEntry } from "@/lib/analyticsConstants";

const SESSION_GAP_MS = 30 * 60 * 1000;
const PAGE_SIZE = 30;

interface Visit {
  vid: string;
  dev?: string;
  br?: string;
  ref?: string;
  start: string;
  end: string;
  items: ActivityEntry[];
}

/** 新しい順のログを、端末ごとの訪問にまとめる（訪問の中は古い順） */
export function groupVisits(entries: ActivityEntry[]): Visit[] {
  const byVid = new Map<string, ActivityEntry[]>();
  for (const e of [...entries].reverse()) {
    const list = byVid.get(e.vid) ?? [];
    list.push(e);
    byVid.set(e.vid, list);
  }
  const visits: Visit[] = [];
  for (const [vid, list] of byVid) {
    let cur: Visit | null = null;
    for (const e of list) {
      if (!cur || Date.parse(e.at) - Date.parse(cur.end) > SESSION_GAP_MS) {
        cur = { vid, start: e.at, end: e.at, items: [] };
        visits.push(cur);
      }
      cur.items.push(e);
      cur.end = e.at;
      cur.dev ??= e.dev;
      cur.br ??= e.br;
      cur.ref ??= e.ref;
    }
  }
  return visits.sort((a, b) => b.end.localeCompare(a.end));
}

/** ページ表示を読める形に（クエリは「キー=値」を並べる） */
function describe(e: ActivityEntry): string {
  if (e.t === "f") return e.v;
  const [path, query = ""] = e.v.split("?");
  const params = [...new URLSearchParams(query)].map(([k, v]) => `${k}=${v}`).join(" ");
  return `${pageLabelOf(path)} を開く${params ? `（${params}）` : ""}`;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ActivityLog({ passcode }: { passcode: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [vid, setVid] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  async function load() {
    setError("");
    const res = await fetch("/api/admin/activity", { headers: { "x-admin-passcode": passcode } }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !d) return setError("読み込めませんでした");
    setEntries(d.entries ?? []);
  }

  const visits = useMemo(() => groupVisits(entries ?? []), [entries]);
  const shown = useMemo(() => {
    const word = q.trim().toLowerCase();
    return visits.filter(
      (v) => (!vid || v.vid === vid) && (!word || v.items.some((e) => describe(e).toLowerCase().includes(word)))
    );
  }, [visits, q, vid]);

  return (
    <section className="space-y-2">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!entries) void load();
        }}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-sm font-semibold text-gray-300">
          行動ログ（端末ごと・時系列{entries ? `・直近${entries.length}件` : ""}）
        </h2>
        <span className="text-xs text-blue-400">{open ? "閉じる ▲" : "開く ▼"}</span>
      </button>
      {open && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="試合・チーム・キーワードで絞り込み"
              className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500"
            />
            <button onClick={() => void load()} className="px-3 rounded-lg text-xs bg-gray-800 text-gray-300 border border-gray-700">
              更新
            </button>
          </div>
          {vid && (
            <button onClick={() => setVid(null)} className="text-xs text-blue-400">
              端末 {vid.slice(0, 8)} だけ表示中 · 解除
            </button>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {entries && (
            <p className="text-[11px] text-gray-500">
              {shown.length} 回の訪問（30分以上空いたら別の訪問）。管理画面にログインした端末は記録されません。
            </p>
          )}
          <div className="space-y-2">
            {shown.slice(0, limit).map((v) => (
              <div key={`${v.vid}-${v.start}`} className="rounded-lg bg-gray-800/50 px-2.5 py-2 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="text-gray-300">
                    {dateTime(v.start)}〜{time(v.end).slice(0, 5)}
                  </span>
                  <span className="text-gray-400">
                    {v.dev ?? "?"} / {v.br ?? "?"}
                  </span>
                  {v.ref && v.ref !== "direct" && <span className="text-sky-300">{v.ref} から</span>}
                  <button onClick={() => setVid(v.vid)} className="ml-auto text-gray-500 underline underline-offset-2">
                    端末 {v.vid.slice(0, 8)}
                  </button>
                </div>
                <ol className="space-y-0.5">
                  {v.items.map((e, i) => (
                    <li key={i} className="flex gap-2 text-[11px] leading-snug">
                      <span className="text-gray-600 tabular-nums flex-shrink-0">{time(e.at)}</span>
                      <span className={e.t === "pv" ? "text-gray-400" : "text-gray-100"}>{describe(e)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {shown.length > limit && (
            <button onClick={() => setLimit((n) => n + PAGE_SIZE)} className="w-full py-1.5 text-xs text-blue-400">
              もっと見る（残り {shown.length - limit} 回）
            </button>
          )}
        </div>
      )}
    </section>
  );
}
