"use client";

import { useEffect, useState } from "react";
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

/** 1試合の分析（スコア表1枚から） */
export function GameDetail({ sheet }: { sheet: ScoreSheet }) {
  const [showBasis, setShowBasis] = useState(false);
  const a = analyzeGame(sheet);
  const situations = goalSituations(sheet);
  const timeline = sheet.goals.map((g, i) => ({ g, tag: situations[i] })).sort((x, y) => goalOrder(x.g, y.g));
  const rows: { label: string; v: (x: GameAnalysis) => string }[] = [
    { label: "前半", v: (x) => String(x.byHalf.for[0]) },
    { label: "後半", v: (x) => String(x.byHalf.for[1]) },
    ...(a.visitor.byHalf.for[2] + a.home.byHalf.for[2] > 0 ? [{ label: "OT", v: (x: GameAnalysis) => String(x.byHalf.for[2]) }] : []),
    { label: "シュート", v: (x) => (x.shots === null ? "—" : String(x.shots)) },
    { label: "決定率", v: (x) => pctOf(x.shootingPct) },
    {
      label: "ゴーリー",
      v: (x) => (x.goalie.savePct === null ? x.goalie.name || "—" : `${x.goalie.name || `#${x.goalie.no}`} ${pctOf(x.goalie.savePct)}`),
    },
    { label: "セーブ", v: (x) => (x.goalie.shotsFaced === null ? "—" : `${x.goalie.saves}/${x.goalie.shotsFaced}`) },
    { label: "PP得点", v: (x) => String(x.powerPlayGoals) },
    { label: "SH得点", v: (x) => String(x.shortHandedGoals) },
    { label: "反則", v: (x) => `${x.penaltyMinutes}分` },
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        {sheet.continueCode && (
          <p className="text-[11px] text-gray-500 mb-1">
            コンテニューコード <span className="text-gray-200 font-semibold tracking-wider select-all">{sheet.continueCode}</span>
          </p>
        )}
        <p className="text-xs text-gray-500">
          {sheet.date} {sheet.division} {sheet.gameNo && `#${sheet.gameNo}`}
          {sheet.issues?.length ? <span className="ml-2 text-[10px] px-1.5 rounded bg-amber-700/60 text-amber-100">要確認</span> : null}
        </p>
        {sheet.issues?.length ? (
          <ul className="mt-1 text-[11px] text-amber-200/80 list-disc pl-4">
            {sheet.issues.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : null}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-1">
          <span className="text-sm font-bold text-blue-400 truncate">{sheet.visitor.name}</span>
          <span className="text-xl font-bold text-white">
            {sheet.visitor.total} − {sheet.home.total}
          </span>
          <span className="text-sm font-bold text-orange-400 truncate text-right">{sheet.home.name}</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          {[
            a.visitor.scoredFirst ? `${a.visitor.team}が先制` : a.home.scoredFirst ? `${a.home.team}が先制` : "",
            a.visitor.comeback ? `${a.visitor.team}の逆転勝ち` : a.home.comeback ? `${a.home.team}の逆転勝ち` : "",
          ]
            .filter(Boolean)
            .join("・")}
        </p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-gray-800/70">
              <td className="py-1.5 px-4 text-blue-300 w-[38%]">{r.v(a.visitor)}</td>
              <td className="py-1.5 text-center text-xs text-gray-500">{r.label}</td>
              <td className="py-1.5 px-4 text-orange-300 text-right w-[38%]">{r.v(a.home)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 space-y-1">
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

      <div className="px-4 pb-3 space-y-4">
        <PlayerTable sheet={sheet} />
        <TimeBands sheet={sheet} />
        <Combos sheet={sheet} />
        <PenaltyList sheet={sheet} />
        <p className="text-[11px] text-gray-600">
          ※ このスコア表1枚から出した数字です。
          <button onClick={() => setShowBasis(true)} className="ml-1 text-blue-400 underline underline-offset-2">
            数値の根拠
          </button>
        </p>
      </div>
      {showBasis && <BasisSheet onClose={() => setShowBasis(false)} />}
    </div>
  );
}

const sideColor = (side: "visitor" | "home") => (side === "visitor" ? "text-blue-300" : "text-orange-300");

/** この試合の個人成績（得点の記録から数える） */
function PlayerTable({ sheet }: { sheet: ScoreSheet }) {
  const rows = (["visitor", "home"] as const).flatMap((side) => {
    const team = sheet[side];
    const m = new Map<string, { g: number; a: number }>();
    const add = (no: string | undefined, k: "g" | "a") => {
      if (!no) return;
      const r = m.get(no) ?? { g: 0, a: 0 };
      r[k] += 1;
      m.set(no, r);
    };
    for (const g of sheet.goals.filter((x) => x.side === side)) {
      add(g.scorer, "g");
      add(g.assist1, "a");
      add(g.assist2, "a");
    }
    return [...m.entries()]
      .map(([no, r]) => ({ side, team: team.name, no, name: playerName(team, no), ...r, p: r.g + r.a }))
      .sort((x, y) => y.p - x.p || y.g - x.g);
  });
  if (rows.length === 0) return null;
  return (
    <section>
      <p className="text-xs text-gray-400 mb-1">個人（この試合）</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="py-1 text-left font-medium">選手</th>
            <th className="py-1 font-medium">G</th>
            <th className="py-1 font-medium">A</th>
            <th className="py-1 font-medium">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.side}${r.no}`} className="border-b border-gray-800/60 last:border-0">
              <td className={`py-1 ${sideColor(r.side)}`}>
                #{r.no} {r.name}
              </td>
              <td className="py-1 text-center text-gray-300">{r.g || ""}</td>
              <td className="py-1 text-center text-gray-300">{r.a || ""}</td>
              <td className="py-1 text-center text-white font-semibold">{r.p}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 時間帯ごとの得点（各ハーフを5分ずつ） */
function TimeBands({ sheet }: { sheet: ScoreSheet }) {
  const bands = [
    [0, 5],
    [5, 10],
    [10, 15],
    [15, 20],
  ];
  const count = (side: "visitor" | "home", half: number, from: number, to: number) =>
    sheet.goals.filter((g) => {
      const sec = parseClock(g.time);
      return g.side === side && g.half === half && sec !== null && sec >= from * 60 && (to === 20 ? sec <= 20 * 60 : sec < to * 60);
    }).length;
  if (sheet.goals.length === 0) return null;
  return (
    <section>
      <p className="text-xs text-gray-400 mb-1">時間帯ごとの得点</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="py-1 text-left font-medium">分</th>
            <th className="py-1 font-medium text-blue-300">{sheet.visitor.name || "Visitor"}</th>
            <th className="py-1 font-medium text-orange-300">{sheet.home.name || "Home"}</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2].flatMap((half) =>
            bands.map(([from, to]) => (
              <tr key={`${half}-${from}`} className="border-b border-gray-800/60 last:border-0">
                <td className="py-1 text-gray-500">
                  {halfLabel(half)} {from}〜{to}
                </td>
                <td className="py-1 text-center text-gray-200">{count("visitor", half, from, to) || ""}</td>
                <td className="py-1 text-center text-gray-200">{count("home", half, from, to) || ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

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

/** 保存・呼び出した試合の一覧（全ディビジョン、新しく保存・呼び出した順）。タップでその試合の分析、「削除する」で各行に削除ボタン */
export function SheetList({
  sheets,
  onOpen,
  onDelete,
  highlight,
}: {
  sheets: ScoreSheet[];
  onOpen: (s: ScoreSheet) => void;
  onDelete: (s: ScoreSheet) => void;
  highlight?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  if (sheets.length === 0) return null;
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
      <div className="flex items-center">
        <h3 className="text-sm font-semibold text-gray-300">保存・呼び出した試合（{sheets.length}）</h3>
        <button onClick={() => setEditing((v) => !v)} className={`ml-auto text-xs ${editing ? "text-gray-300" : "text-red-400"}`}>
          {editing ? "完了" : "削除する"}
        </button>
      </div>
      <div className="divide-y divide-gray-800">
        {sheets.map((s) => (
          <div
            key={s.continueCode ?? s.id ?? `${s.date}${s.gameNo}`}
            className={`flex items-center gap-2 rounded ${s.continueCode && s.continueCode === highlight ? "bg-blue-900/30" : ""}`}
          >
            <button onClick={() => onOpen(s)} className="flex-1 min-w-0 text-left py-2 px-1">
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span>{s.date || "日付なし"}</span>
                <span>{s.division}</span>
                {s.gameNo && <span>#{s.gameNo}</span>}
                {s.issues?.length ? <span className="text-[10px] px-1.5 rounded bg-amber-700/60 text-amber-100">要確認</span> : null}
                <span className="ml-auto tracking-wider text-gray-400">{s.continueCode}</span>
              </div>
              <div className="flex items-center gap-2 text-sm mt-0.5">
                <span className="text-blue-300 flex-1 truncate">{s.visitor.name || "?"}</span>
                <span className="text-white font-bold">
                  {s.visitor.total} − {s.home.total}
                </span>
                <span className="text-orange-300 flex-1 truncate text-right">{s.home.name || "?"}</span>
                {!editing && <span className="text-blue-400 text-xs">分析</span>}
              </div>
            </button>
            {editing && (
              <button
                onClick={() => onDelete(s)}
                className="flex-shrink-0 px-3 py-1.5 rounded bg-red-600/80 text-white text-xs font-medium"
                aria-label={`${s.continueCode ?? ""} を削除`}
              >
                削除
              </button>
            )}
          </div>
        ))}
      </div>
      {editing && <p className="text-[11px] text-gray-500">削除したデータは元に戻せず、コンテニューコードでも呼び出せなくなります。</p>}
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
  ["コンテニューコード", "保存するときに決める4〜8文字のコード（半角の大文字と数字）。入力すると、その試合のデータを別の端末でも呼び出せます。写真は保存せず、データだけを2年間残します。"],
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
