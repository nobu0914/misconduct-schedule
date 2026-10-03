"use client";

import { useEffect, useMemo, useState } from "react";
import {
  aggregate,
  analyzeGame,
  goalOrder,
  goalSituations,
  playerName,
  type GameAnalysis,
  type ScoreSheet,
} from "@/lib/scoreSheet";

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const pctOf = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const halfLabel = (h: number) => (h === 1 ? "前半" : h === 2 ? "後半" : "OT");

/** 1試合の分析（スコア表1枚から） */
export function GameDetail({ sheet }: { sheet: ScoreSheet }) {
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
    </div>
  );
}

/** 登録済みのスコア表をまとめた分析 */
export function LeagueAnalysis({ sheets, onOpen }: { sheets: ScoreSheet[]; onOpen: (s: ScoreSheet) => void }) {
  const divisions = useMemo(() => [...new Set(sheets.map((s) => s.division))].sort(), [sheets]);
  const [division, setDivision] = useState("");
  const [showBasis, setShowBasis] = useState(false);
  const div = division && divisions.includes(division) ? division : divisions[0] ?? "";
  const inDiv = sheets.filter((s) => s.division === div);
  const agg = useMemo(() => aggregate(inDiv), [inDiv]);

  if (sheets.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-10">まだ登録されたスコア表がありません。</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {divisions.map((d) => (
          <button
            key={d}
            onClick={() => setDivision(d)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${d === div ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"}`}
          >
            {d}（{sheets.filter((s) => s.division === d).length}）
          </button>
        ))}
      </div>

      <Card title="ゴーリー（セーブ率順）">
        <Table
          head={["ゴーリー", "試合", "被シュート", "セーブ率"]}
          rows={agg.goalies.map((g) => [
            <span key="n">
              {g.name || `#${g.no}`}
              <span className="block text-[10px] text-gray-500">{g.team}</span>
            </span>,
            g.games,
            g.shotsFaced,
            <b key="p" className="text-white">{pct(g.saves, g.shotsFaced)}</b>,
          ])}
        />
      </Card>

      <Card title="チーム">
        <Table
          head={["チーム", "勝敗", "前半", "後半", "決定率", "PP"]}
          rows={agg.teams.map((t) => [
            t.team,
            `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
            `${t.goalsFor[0]}-${t.goalsAgainst[0]}`,
            `${t.goalsFor[1]}-${t.goalsAgainst[1]}`,
            pct(t.shotGoals, t.shots),
            t.powerPlayGoals,
          ])}
        />
        <Table
          head={["チーム", "先制時勝率", "逆転勝ち", "SH", "反則/試合"]}
          rows={agg.teams.map((t) => [
            t.team,
            t.scoredFirstGames ? `${pct(t.scoredFirstWins, t.scoredFirstGames)}（${t.scoredFirstWins}/${t.scoredFirstGames}）` : "—",
            t.comebacks,
            t.shortHandedGoals,
            `${(t.penaltyMinutes / t.games).toFixed(1)}分`,
          ])}
        />
      </Card>

      <Card title="アシスト → ゴールの組み合わせ">
        {agg.combos.length === 0 ? (
          <p className="text-xs text-gray-500">アシスト付きの得点がまだありません。</p>
        ) : (
          <div className="space-y-1">
            {agg.combos.slice(0, 10).map((c, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs">
                <span className="text-gray-300 flex-1">
                  {c.from} → {c.to}
                  <span className="text-gray-500">（{c.team}）</span>
                </span>
                <b className="text-white">{c.count}回</b>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`登録済みの試合（${inDiv.length}）`}>
        <div className="space-y-1">
          {inDiv.map((s) => (
            <button key={s.id ?? `${s.date}${s.gameNo}`} onClick={() => onOpen(s)} className="w-full flex items-center gap-2 text-xs text-left py-1">
              <span className="text-gray-500 w-20">{s.date}</span>
              <span className="text-gray-200 flex-1 truncate">
                {s.visitor.name} {s.visitor.total}−{s.home.total} {s.home.name}
              </span>
              {s.issues?.length ? <span className="text-[10px] px-1.5 rounded bg-amber-700/60 text-amber-100">要確認</span> : null}
              <span className="text-blue-400">詳細</span>
            </button>
          ))}
        </div>
      </Card>

      <p className="text-xs text-gray-600">
        ※ ユーザーが登録したスコア表だけの集計です（全試合ではありません）。
        <button onClick={() => setShowBasis(true)} className="ml-1 text-blue-400 underline underline-offset-2">
          数値の根拠
        </button>
      </p>
      {showBasis && <BasisSheet onClose={() => setShowBasis(false)} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
      <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-500 border-b border-gray-800">
          {head.map((h, i) => (
            <th key={h} className={`py-1 font-medium ${i === 0 ? "text-left" : "text-center"}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-gray-800/60 last:border-0">
            {r.map((c, j) => (
              <td key={j} className={`py-1.5 ${j === 0 ? "text-left text-gray-200" : "text-center text-gray-300"}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BASIS: [string, string][] = [
  ["セーブ率", "ゴーリーが止めたシュート ÷ 受けたシュート。受けたシュート＝相手チームの SOG（Shots on Goal）合計、止めた数＝それ − 失点。"],
  ["決定率", "得点 ÷ 自チームの SOG 合計。"],
  ["前半・後半", "そのハーフの 得点−失点 の合計。"],
  ["PP（パワープレー）得点", "相手が反則で退場している間（自チームは退場者なし）の得点。2分の反則は、その間に得点されたらそこで明けるものとして数えます。"],
  ["SH（ショートハンド）得点", "自チームが退場者を出している間（相手は退場者なし）の得点。"],
  ["先制時勝率", "先に点を取った試合のうち勝った割合。"],
  ["逆転勝ち", "前半を負けて終えたのに勝った試合の数。"],
  ["アシスト → ゴール", "1人目のアシスト（A）から得点（G）につながった回数。"],
  ["集計の範囲", "このページで登録されたスコア表だけが対象です。同じ試合（日付＋試合番号）は最初の登録だけを使います。"],
  ["要確認", "合計が合わない・時間が読めないなどの食い違いが残ったまま登録された試合です。その部分は集計が正しく出ないことがあります（時間が読めない得点はパワープレー判定に使いません）。"],
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
