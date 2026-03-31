"use client";

import { useEffect, useState, useCallback } from "react";
import { MENU_ITEMS } from "@/lib/voteConstants";
import type { Attendance } from "@/lib/voteConstants";

interface VoteResult {
  attend: { yes: number; maybe: number; no: number };
  menu: Record<string, number>;
  myVote: { attendance: Attendance; menu: string[] } | null;
}

interface Props {
  date: string;        // "2026/4/2"
  dateLabel: string;   // "2026年4月2日 (水)"
  onClose: () => void;
}

function getVoterId(): string {
  const key = "wednesday_voter_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

const ATTEND_OPTIONS: { value: Attendance; label: string; color: string; activeColor: string }[] = [
  { value: "yes",   label: "参加する",  color: "border-gray-600 text-gray-400", activeColor: "bg-green-600 border-green-600 text-white" },
  { value: "maybe", label: "未定",      color: "border-gray-600 text-gray-400", activeColor: "bg-yellow-500 border-yellow-500 text-white" },
  { value: "no",    label: "不参加",    color: "border-gray-600 text-gray-400", activeColor: "bg-gray-600 border-gray-600 text-white" },
];

export default function WednesdayVoteModal({ date, dateLabel, onClose }: Props) {
  const [result, setResult] = useState<VoteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [selectedAttend, setSelectedAttend] = useState<Attendance | null>(null);
  const [selectedMenu, setSelectedMenu] = useState<string[]>([]);

  const voterId = getVoterId();

  const fetchVotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/votes?date=${encodeURIComponent(date)}&voterId=${voterId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      if (data.myVote) {
        setSelectedAttend(data.myVote.attendance);
        setSelectedMenu(data.myVote.menu);
      }
    } catch (e) {
      console.error("fetchVotes error:", e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [date, voterId]);

  useEffect(() => {
    fetchVotes();
  }, [fetchVotes]);

  // モーダルが開いている間は背景のスクロールを無効化
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSubmit() {
    if (!selectedAttend) return;
    setSubmitting(true);
    const res = await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, voterId, attendance: selectedAttend, menu: selectedMenu }),
    });
    const data: VoteResult = await res.json();
    setResult(data);
    setEditMode(false);
    setSubmitting(false);
  }

  function toggleMenu(item: string) {
    setSelectedMenu((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  }

  const totalAttend = result ? result.attend.yes + result.attend.maybe + result.attend.no : 0;
  const hasVoted = !!result?.myVote && !editMode;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-md bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-700 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between rounded-t-2xl sm:rounded-t-2xl" style={{isolation: "isolate"}}>
          <div>
            <div className="text-xs text-green-400 font-medium mb-0.5">水曜練習会</div>
            <div className="text-white font-bold">{dateLabel}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
            </div>
          ) : fetchError ? (
            <div className="text-center py-10 text-red-400 text-sm">
              データの取得に失敗しました。<br />しばらくしてから再度お試しください。
            </div>
          ) : (
            <>
              {/* 参加状況 */}
              <section>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">参加状況（無記名）</h3>

                {/* 投票ボタン */}
                <div className="flex gap-2 mb-4">
                  {ATTEND_OPTIONS.map(({ value, label, color, activeColor }) => (
                    <button
                      key={value}
                      onClick={() => !hasVoted && setSelectedAttend(value)}
                      disabled={hasVoted}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        selectedAttend === value ? activeColor : color
                      } ${hasVoted ? "opacity-70 cursor-default" : "hover:border-gray-400"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* 集計バー */}
                {result && totalAttend > 0 && (
                  <div className="space-y-1.5">
                    {[
                      { key: "yes",   label: "参加する",  color: "bg-green-500" },
                      { key: "maybe", label: "未定",      color: "bg-yellow-500" },
                      { key: "no",    label: "不参加",    color: "bg-gray-500" },
                    ].map(({ key, label, color }) => {
                      const count = result.attend[key as keyof typeof result.attend];
                      const pct = totalAttend > 0 ? Math.round((count / totalAttend) * 100) : 0;
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="w-14 text-gray-400 flex-shrink-0">{label}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-2">
                            <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right text-gray-400">{count}人</span>
                        </div>
                      );
                    })}
                    <div className="text-right text-xs text-gray-600 mt-1">計 {totalAttend}人</div>
                  </div>
                )}
              </section>

              {/* 練習メニュー投票 */}
              <section>
                <h3 className="text-sm font-semibold text-gray-300 mb-1">やりたい練習メニュー</h3>
                <p className="text-xs text-gray-500 mb-3">複数選択OK（無記名）</p>

                <div className="space-y-2">
                  {MENU_ITEMS.map((item) => {
                    const count = result?.menu[item] ?? 0;
                    const isChecked = selectedMenu.includes(item);
                    return (
                      <button
                        key={item}
                        onClick={() => !hasVoted && toggleMenu(item)}
                        disabled={hasVoted}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm transition-all text-left ${
                          isChecked
                            ? "bg-green-900/40 border-green-600 text-white"
                            : "border-gray-700 text-gray-300 hover:border-gray-500"
                        } ${hasVoted ? "cursor-default" : ""}`}
                      >
                        <span className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                          isChecked ? "bg-green-600 border-green-600" : "border-gray-500"
                        }`}>
                          {isChecked && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1">{item}</span>
                        {count > 0 && (
                          <span className="text-xs text-gray-400 flex-shrink-0">{count}票</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 送信 / 変更 */}
              {!hasVoted ? (
                <button
                  onClick={handleSubmit}
                  disabled={!selectedAttend || submitting}
                  className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold transition-colors"
                >
                  {submitting ? "送信中..." : "送信する"}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-center text-sm text-green-400 font-medium">✓ 投票済み</div>
                  <button
                    onClick={() => setEditMode(true)}
                    className="w-full py-2.5 rounded-xl border border-gray-600 text-gray-400 text-sm hover:border-gray-400 hover:text-white transition-colors"
                  >
                    回答を変更する
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
