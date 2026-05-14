"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const PAGE_LABELS: Record<string, string> = {
  "/": "ゲーム情報",
  "/player-ranking": "ランク検索",
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
};

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
function AnalyticsDashboard({ passcode }: { passcode: string }) {
  const [data, setData] = useState<DayData[] | null>(null);
  const [events, setEvents] = useState<Record<string, Record<string, number>>>({});
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
          <h2 className="text-sm font-semibold text-gray-300 mb-3">過去7日のページ別PV</h2>
          <div className="space-y-2">
            {(() => {
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
                  <span className="text-white font-semibold">{count}</span>
                </div>
              ));
            })()}
          </div>
        </section>

        {/* イベント履歴（過去7日） */}
        {Object.keys(events).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-300">ユーザー行動（過去7日）</h2>
            {Object.entries(events).map(([ev, items]) => {
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
