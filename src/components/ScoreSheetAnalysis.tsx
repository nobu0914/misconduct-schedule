"use client";

import { useEffect, useState } from "react";
import { getVisitorId } from "@/lib/analyticsClient";
import { trackFeature } from "@/lib/trackEvent";
import { GameTeamTotals } from "@/components/SheetTeams";
import { GoalieDonuts, PlayerBars, ScoreFlow, TimeBandChart, VersusBars } from "@/components/ScoreSheetCharts";
import {
  aggregate,
  analyzeGame,
  goalOrder,
  goalSituations,
  parseClock,
  playerName,
  type GameAnalysis,
  type ScoreSheet,
} from "@/lib/scoreSheet";

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const pctOf = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const halfLabel = (h: number) => (h === 1 ? "前半" : h === 2 ? "後半" : "OT");

/**
 * 1試合の分析（スコア表1枚から）。compact は一覧のカードの中に開くとき
 * （日付・チーム名・スコアはカードに出ているので繰り返さない）
 */
export function GameDetail({
  sheet,
  compact = false,
  onUpdate,
}: {
  sheet: ScoreSheet;
  compact?: boolean;
  onUpdate?: (s: ScoreSheet) => void;
}) {
  const [showBasis, setShowBasis] = useState(false);
  const a = analyzeGame(sheet);
  const situations = goalSituations(sheet);
  const timeline = sheet.goals.map((g, i) => ({ g, tag: situations[i] })).sort((x, y) => goalOrder(x.g, y.g));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        {!compact && sheet.continueCode && (
          <p className="text-[11px] text-gray-500 mb-1">
            コンテニューコード <span className="text-gray-200 font-semibold tracking-wider select-all">{sheet.groupCode ?? sheet.continueCode}</span>
          </p>
        )}
        {!compact && (
          <p className="text-xs text-gray-500">
            {sheet.date} {sheet.division} {sheet.gameNo && `#${sheet.gameNo}`}
            {sheet.issues?.length ? <span className="ml-2 text-[10px] px-1.5 rounded bg-amber-700/60 text-amber-100">要確認</span> : null}
          </p>
        )}
        {sheet.issues?.length ? (
          <ul className="mt-1 text-[11px] text-amber-200/80 list-disc pl-4">
            {sheet.issues.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : null}
        {!compact && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-1">
            <span className="text-sm font-bold text-blue-400 truncate">{sheet.visitor.name}</span>
            <span className="text-xl font-bold text-white">
              {sheet.visitor.total} − {sheet.home.total}
            </span>
            <span className="text-sm font-bold text-orange-400 truncate text-right">{sheet.home.name}</span>
          </div>
        )}
        <p className="text-[11px] text-gray-500 mt-1">
          {[
            a.visitor.scoredFirst ? `${a.visitor.team}が先制` : a.home.scoredFirst ? `${a.home.team}が先制` : "",
            a.visitor.comeback ? `${a.visitor.team}の逆転勝ち` : a.home.comeback ? `${a.home.team}の逆転勝ち` : "",
          ]
            .filter(Boolean)
            .join("・")}
        </p>
      </div>
      {/* 並び: まとめ（AI総評・チーム比較・ゴーリー）→ 試合の流れ（時間の話）→ 選手（人の話） */}
      <div className="px-4 py-3 space-y-5 border-b border-gray-800">
        <AiReviewCard sheet={sheet} onUpdate={onUpdate} />
        <VersusBars a={a} />
        <GoalieDonuts a={a} />
      </div>

      <section className="px-4 py-3 space-y-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-200">試合の流れ</h3>
        <ScoreFlow sheet={sheet} />
        <TimeBandChart sheet={sheet} />
        <div className="space-y-1">
          <p className="text-xs text-gray-400 mb-1">得点経過</p>
          {timeline.map(({ g, tag }, i) => {
            const team = sheet[g.side];
            const who = (no?: string) => (no ? `#${no}${playerName(team, no) ? ` ${playerName(team, no)}` : ""}` : "");
            return (
              <div key={i} className="flex items-baseline gap-2 text-xs">
                <span className="text-gray-500 w-16 flex-shrink-0">
                  {halfLabel(g.half)} {g.time}
                </span>
                <span className={`flex-1 ${g.side === "visitor" ? "text-blue-300" : "text-orange-300"}`}>
                  {who(g.scorer)}
                  {g.assist1 && <span className="text-gray-500">（A {[who(g.assist1), who(g.assist2)].filter(Boolean).join("・")}）</span>}
                </span>
                {tag && <span className="text-[10px] px-1.5 rounded bg-gray-700 text-gray-200 flex-shrink-0">{tag}</span>}
              </div>
            );
          })}
        </div>
        <PenaltyList sheet={sheet} />
      </section>

      <section className="px-4 py-3 space-y-4">
        <h3 className="text-sm font-semibold text-gray-200">選手</h3>
        <PlayerBars sheet={sheet} />
        <Combos sheet={sheet} />
        {/* 両チームへ: スコア表の通算（このコンテニューコードで見られる）と、公式データのチーム総評 */}
        <GameTeamTotals sheet={sheet} />
        <p className="text-[11px] text-gray-600">
          ※ このスコア表1枚から出した数字です。
          <button onClick={() => setShowBasis(true)} data-feature="分析 > 数値の根拠" className="ml-1 text-blue-400 underline underline-offset-2">
            数値の根拠
          </button>
        </p>
      </section>
      {showBasis && <BasisSheet onClose={() => setShowBasis(false)} />}
    </div>
  );
}

/** AI 総評（初めて開いたときに作って保存。2回目からは保存分） */
function AiReviewCard({ sheet, onUpdate }: { sheet: ScoreSheet; onUpdate?: (s: ScoreSheet) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const review = sheet.review;

  async function generate() {
    if (!sheet.continueCode) return;
    setState("loading");
    setError("");
    try {
      const res = await fetch(`/api/scoresheets/review?code=${encodeURIComponent(sheet.continueCode)}`, {
        method: "POST",
        headers: { "x-visitor-id": getVisitorId() ?? "" },
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.review) {
        trackFeature("分析 > AI総評を作成");
        onUpdate?.({ ...sheet, review: d.review });
        setState("idle");
      } else {
        setError(d.message ?? "総評を作れませんでした。");
        setState("error");
      }
    } catch {
      setError("通信できませんでした。");
      setState("error");
    }
  }

  useEffect(() => {
    if (!review && sheet.continueCode && sheet.goals.length > 0) generate();
    // 試合を開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.continueCode]);

  if (!sheet.continueCode || sheet.goals.length === 0) return null;
  return (
    <section className="rounded-xl border border-violet-700/50 bg-violet-950/30 p-3 space-y-2">
      <p className="text-xs font-semibold text-violet-200">✨ AI総評</p>
      {review ? (
        <>
          <p className="text-sm text-gray-100 leading-relaxed">{review.summary}</p>
          {review.teams.map((t) => {
            const color = t.team === sheet.home.name ? "text-orange-300" : "text-blue-300";
            return (
              <div key={t.team} className="space-y-1">
                <p className={`text-xs font-bold ${color}`}>{t.team}</p>
                {t.good.map((x) => (
                  <p key={x} className="text-xs text-gray-200 pl-2">
                    <span className="text-green-400">◎</span> {x}
                  </p>
                ))}
                {t.improve.map((x) => (
                  <p key={x} className="text-xs text-gray-300 pl-2">
                    <span className="text-amber-300">△</span> {x}
                  </p>
                ))}
              </div>
            );
          })}
          {review.players.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-300">注目選手</p>
              {review.players.map((x) => (
                <p key={x} className="text-xs text-gray-200 pl-2">
                  ★ {x}
                </p>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-500">AIがこの試合のスコア表の数字だけから書いたコメントです。</p>
        </>
      ) : state === "error" ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">{error}</p>
          <button onClick={generate} className="text-xs text-violet-300 underline">
            もう一度作る
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-violet-400" />
          AIが総評を書いています…（10秒ほど）
        </div>
      )}
    </section>
  );
}

const sideColor = (side: "visitor" | "home") => (side === "visitor" ? "text-blue-300" : "text-orange-300");

/** この試合のアシスト → ゴール */
function Combos({ sheet }: { sheet: ScoreSheet }) {
  const combos = aggregate([sheet]).combos;
  if (combos.length === 0) return null;
  return (
    <section>
      <p className="text-xs text-gray-400 mb-1">アシスト → ゴール</p>
      <div className="space-y-1">
        {combos.map((c, i) => (
          <div key={i} className="flex items-baseline gap-2 text-xs">
            <span className={`flex-1 ${c.team === sheet.visitor.name ? "text-blue-300" : "text-orange-300"}`}>
              {c.from} → {c.to}
            </span>
            <b className="text-white">{c.count}回</b>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 反則の記録 */
function PenaltyList({ sheet }: { sheet: ScoreSheet }) {
  if (sheet.penalties.length === 0) return null;
  const list = [...sheet.penalties].sort((a, b) => a.half - b.half || (parseClock(a.time) ?? 0) - (parseClock(b.time) ?? 0));
  return (
    <section>
      <p className="text-xs text-gray-400 mb-1">反則</p>
      <div className="space-y-1">
        {list.map((p, i) => (
          <div key={i} className="flex items-baseline gap-2 text-xs">
            <span className="text-gray-500 w-16 flex-shrink-0">
              {halfLabel(p.half)} {p.time}
            </span>
            <span className={`flex-1 ${sideColor(p.side)}`}>
              #{p.no} {playerName(sheet[p.side], p.no)}
            </span>
            <span className="text-gray-400">
              {p.reason} {p.minutes}分
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 保存・呼び出した試合の一覧（新しく保存・呼び出した順）。行をタップするとその下に試合の分析が開く（アコーディオン） */
export function SheetList({
  sheets,
  onToggle,
  onDelete,
  openCode,
  renderDetail,
  highlight,
}: {
  sheets: ScoreSheet[];
  onToggle: (s: ScoreSheet) => void;
  onDelete: (s: ScoreSheet) => void;
  openCode: string | null;
  renderDetail: (s: ScoreSheet) => React.ReactNode;
  highlight?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  if (sheets.length === 0) return null;
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
      <h3 className="text-sm font-semibold text-gray-300">保存・呼び出した試合（{sheets.length}）</h3>
      <div className="space-y-3">
        {sheets.map((s) => {
          const open = !!s.continueCode && s.continueCode === openCode;
          const vWin = s.visitor.total > s.home.total;
          const hWin = s.home.total > s.visitor.total;
          const team = (name: string, score: number, win: boolean, color: string) => (
            <div className="flex items-center gap-2">
              <span className={`w-1 self-stretch rounded ${color}`} />
              <span className={`flex-1 truncate ${win ? "text-white font-bold" : "text-gray-300"}`}>{name || "?"}</span>
              <span className={`text-lg tabular-nums ${win ? "text-white font-bold" : "text-gray-400"}`}>{score}</span>
            </div>
          );
          return (
            <div
              key={s.continueCode ?? s.id ?? `${s.date}${s.gameNo}`}
              id={`row-${s.continueCode}`}
              className={`scroll-mt-4 rounded-xl border overflow-hidden ${
                open ? "border-blue-600/70" : s.continueCode && s.continueCode === highlight ? "border-blue-500/60" : "border-gray-700"
              } bg-gray-800/40`}
            >
              <div className="flex items-stretch">
                <button
                  onClick={() => onToggle(s)}
                  aria-expanded={open}
                  data-feature={open ? "分析 > 試合を閉じる" : `分析 > 試合の分析を開く > ${s.date ?? ""} ${s.division ?? ""} ${s.visitor?.name ?? "?"} vs ${s.home?.name ?? "?"}`}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/70 text-[11px] text-gray-400">
                    <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-200 font-medium">{s.division || "—"}</span>
                    <span>{s.date || "日付なし"}</span>
                    {s.gameNo && <span>#{s.gameNo}</span>}
                    {s.issues?.length ? <span className="px-1.5 rounded bg-amber-700/60 text-amber-100">要確認</span> : null}
                    <span className="ml-auto tracking-wider text-gray-300">{s.groupCode ?? s.continueCode}</span>
                  </div>
                  <div className="px-3 py-2 space-y-1 text-sm">
                    {team(s.visitor.name, s.visitor.total, vWin, "bg-blue-400")}
                    {team(s.home.name, s.home.total, hWin, "bg-orange-400")}
                  </div>
                  {!editing && (
                    <div className="flex items-center justify-center gap-1 py-1.5 border-t border-gray-700/70 text-xs text-blue-400">
                      <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      {open ? "分析を閉じる" : "分析を開く"}
                    </div>
                  )}
                </button>
                {editing && (
                  <button
                    onClick={() => onDelete(s)}
                    className="flex-shrink-0 px-4 bg-red-600/80 text-white text-xs font-medium"
                    aria-label={`${s.groupCode ?? s.continueCode ?? ""} の ${s.date} の試合を削除`}
                  >
                    削除
                  </button>
                )}
              </div>
              {open && !editing && <div className="border-t border-gray-700 bg-gray-950/40 p-2">{renderDetail(s)}</div>}
            </div>
          );
        })}
      </div>
      {editing && (
        <p className="text-[11px] text-gray-500">削除するにはコンテニューコードの入力が必要です。削除した人の情報（日時・IPアドレス・ブラウザ・端末ID）は記録されます。</p>
      )}
      {/* 削除は目立たせない（枠の右下・灰色） */}
      <div className="flex justify-end">
        <button
          onClick={() => setEditing((v) => !v)}
          data-feature={editing ? "分析 > 削除モード終了" : "分析 > 削除モード"}
          className={`text-xs ${editing ? "text-gray-200 font-medium" : "text-gray-500"}`}
        >
          {editing ? "完了" : "削除する"}
        </button>
      </div>
    </section>
  );
}

const BASIS: [string, string][] = [
  ["シュート・決定率", "シュートはスコア表の SOG（Shots on Goal）の合計。決定率＝得点 ÷ 自チームのシュート。"],
  ["ゴーリー・セーブ", "受けたシュート＝相手チームの SOG 合計、セーブ＝それ − 失点。セーブ率＝セーブ ÷ 受けたシュート。"],
  ["PP（パワープレー）得点", "相手が反則で退場している間（自チームは退場者なし）の得点。2分の反則は、その間に得点されたらそこで明けるものとして数えます。"],
  ["SH（ショートハンド）得点", "自チームが退場者を出している間（相手は退場者なし）の得点。"],
  ["先制・逆転勝ち", "先制＝最初の得点を取ったチーム。逆転勝ち＝前半を負けて終えたのに勝った。"],
  ["個人（この試合）", "得点の記録の G（得点者）と A（アシスト）を背番号ごとに数えたもの。P＝G＋A。名前はスコア表の選手欄から。"],
  ["時間帯ごとの得点", "各ハーフを5分ずつに分けて数えた得点。時間が読めなかった得点は入りません。"],
  ["アシスト → ゴール", "1人目のアシスト（A）から得点（G）につながった回数。"],
  ["要確認", "合計が合わない・時間が読めないなど、食い違いが残ったまま保存した試合。その部分は数字が正しく出ないことがあります。"],
  ["コンテニューコード", "保存するときに決める4〜8文字のコード（半角の大文字と数字）。入力すると、その試合のデータを別の端末でも呼び出せます。コードが分かれば誰でも呼び出せる（削除もできる）ので、簡単なコードやほかの人と重なりやすいコードは避けてください。写真は保存せず、データだけを2年間残します。"],
];

function BasisSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label="数値の根拠"
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
          <h3 className="text-base font-bold text-white">数値の根拠</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 text-gray-300" aria-label="閉じる">✕</button>
        </div>
        <dl className="px-4 py-3 space-y-3">
          {BASIS.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-bold text-white">{k}</dt>
              <dd className="text-xs text-gray-400 mt-0.5 leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
