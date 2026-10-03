"use client";

import { useEffect, useState } from "react";
import { seasonOrdinal } from "@/lib/season";
import {
  multiDivisionTotal,
  playerProfile,
  type PlayerProfile,
  type RatePlayer,
  type SeasonContext,
} from "@/lib/scoringRate";

export interface SeasonInput {
  season: number;
  /** 未取得・データなしなら undefined */
  ctx?: SeasonContext;
}

interface Props {
  name: string;
  division: string;
  /** 表示中のシーズン → 前シーズン（昨シーズン基準） */
  seasons: SeasonInput[];
}

type Cell = { main: string; sub?: string; tone?: "good" | "bad" };

const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const vsAvg = (v: number, avg: number): Cell["tone"] => (v > avg + 1e-9 ? "good" : v < avg - 1e-9 ? "bad" : undefined);

/** 表の行（項目）。ROWS の順に上から並ぶ */
const ROWS: { label: string; cell: (p: PlayerProfile) => Cell | undefined }[] = [
  {
    label: "ゴール/試合",
    cell: (p) => ({ main: f2(p.goals.value), sub: `${p.goals.rank}位/${p.goals.of}人\n平均${f2(p.goals.avg)}`, tone: vsAvg(p.goals.value, p.goals.avg) }),
  },
  {
    label: "アシスト/試合",
    cell: (p) => ({ main: f2(p.assists.value), sub: `${p.assists.rank}位/${p.assists.of}人\n平均${f2(p.assists.avg)}`, tone: vsAvg(p.assists.value, p.assists.avg) }),
  },
  {
    label: "ポイント/試合",
    cell: (p) => ({ main: f2(p.points.value), sub: `${p.points.rank}位/${p.points.of}人\n平均${f2(p.points.avg)}`, tone: vsAvg(p.points.value, p.points.avg) }),
  },
  {
    label: "平均比",
    cell: (p) =>
      p.pointsVsAvg === undefined
        ? undefined
        : { main: `${p.pointsVsAvg.toFixed(1)}倍`, sub: p.goalsVsAvg !== undefined ? `ゴールは${p.goalsVsAvg.toFixed(1)}倍` : undefined, tone: vsAvg(p.pointsVsAvg, 1) },
  },
  { label: "位置", cell: (p) => ({ main: `上位${p.topPercent}%`, sub: `偏差値 ${Math.round(p.deviation)}` }) },
  {
    label: "得点関与",
    cell: (p) =>
      p.involvement === undefined || !p.teamGoals
        ? undefined
        : { main: pct(p.involvement), sub: `${Math.round(p.points.value * p.gp)}/${p.teamGoals.total}点` },
  },
  {
    label: "ゴールシェア",
    cell: (p) =>
      p.goalShare === undefined || !p.teamGoals
        ? undefined
        : { main: pct(p.goalShare), sub: `${Math.round(p.goals.value * p.gp)}/${p.teamGoals.total}点` },
  },
  {
    label: "出場率",
    cell: (p) => (p.attendance === undefined ? undefined : { main: pct(p.attendance), sub: `${p.gp}/${p.teamGames}試合` }),
  },
  {
    label: "反則",
    cell: (p) => ({ main: `${p.pim.value.toFixed(1)}分`, sub: `/試合・少ない順\n${p.pim.rank}位/${p.pim.of}人`, tone: vsAvg(p.pim.avg, p.pim.value) }),
  },
  {
    label: "タイプ",
    cell: (p) =>
      p.style ? { main: p.style, sub: `G${Math.round(p.goals.value * p.gp)}:A${Math.round(p.assists.value * p.gp)}` } : undefined,
  },
  {
    label: "チーム勝率",
    cell: (p) =>
      p.teamRecord
        ? { main: pct(p.teamRecord.winRate), sub: `${p.teamRecord.wins}勝${p.teamRecord.losses}敗${p.teamRecord.ties}分` }
        : undefined,
  },
];

/** 個人ランクのカードに出す詳細スタッツ（表示中のシーズンと前シーズンを並べる） */
export default function ScoringRatePanel({ name, division, seasons }: Props) {
  const [showBasis, setShowBasis] = useState(false);
  // データが無いシーズン（51st 以前など）は列を出さない
  const cols = seasons
    .filter((s) => s.ctx && s.ctx.players.length > 0)
    .map((s) => ({ season: s.season, profile: playerProfile(s.ctx!, name, division) }));
  if (cols.length === 0 || !cols[0].profile) return null;

  return (
    <div className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-2">
      <p className="text-gray-400 text-xs">詳細スタッツ・{division}</p>
      <div className="w-full border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-xs table-fixed">
          <thead>
            <tr className="bg-gray-800 text-gray-400">
              <th className="py-1 pl-2 text-left font-medium w-[30%]" />
              {cols.map((c, i) => (
                <th key={c.season} className="py-1 text-center font-medium">
                  {seasonOrdinal(c.season)}
                  {i > 0 && <span className="text-gray-500 font-normal">（前季）</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-gray-700/70">
                <td className="py-1.5 pl-2 text-gray-400 align-top">{row.label}</td>
                {cols.map((c, i) => {
                  const cell = c.profile ? row.cell(c.profile) : undefined;
                  const color =
                    cell?.tone === "good" ? "text-green-400" : cell?.tone === "bad" ? "text-orange-300" : i === 0 ? "text-white" : "text-gray-300";
                  return (
                    <td key={c.season} className="py-1.5 px-1 text-center align-top">
                      <span className={`font-semibold ${color}`}>{cell?.main ?? "—"}</span>
                      {cell?.sub && <span className="block text-[10px] text-gray-500 leading-tight whitespace-pre-line">{cell.sub}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500">
        {cols.some((c) => !c.profile) && "前季「—」はこのディビジョンに出場なし。"}
        緑＝ディビジョン平均より上。
        <button onClick={() => setShowBasis(true)} data-track="個人 数値の根拠" className="ml-1 text-blue-400 underline underline-offset-2">
          数値の根拠
        </button>
      </p>
      {showBasis && <BasisSheet onClose={() => setShowBasis(false)} />}
    </div>
  );
}

const BASIS: { label: string; text: string }[] = [
  { label: "ゴール・アシスト・ポイント/試合", text: "本人の G・A・P ÷ 本人の出場試合数（GP）。順位はそのディビジョンで1試合以上出場した選手の中での順位。平均はディビジョン全体の合計 ÷ 全選手の出場試合数の合計（＝選手1人が1試合で挙げる平均）。" },
  { label: "平均比", text: "本人のポイント/試合 ÷ ディビジョン平均。ディビジョンのレベルが違っても比べやすい指標です。" },
  { label: "位置（上位%・偏差値）", text: "ポイント/試合でディビジョン内の何%に入るか（順位 ÷ 出場選手数）と、その偏差値（平均50・標準偏差10）。" },
  { label: "得点関与", text: "本人のポイント ÷ チームの総得点。チームの得点の何%にゴールかアシストで絡んだか。チームの総得点は公式スコア表の合計（スコア表が無いシーズンは所属選手のゴール合計）。" },
  { label: "ゴールシェア", text: "本人のゴール ÷ チームの総得点。チームの得点の何%を自分で決めたか。" },
  { label: "出場率", text: "本人の出場試合数 ÷ チームの試合数（公式順位表）。" },
  { label: "反則", text: "本人のペナルティ時間（PIM）÷ 出場試合数。少ないほど上位です。" },
  { label: "タイプ", text: "ポイントのうちゴールが6割以上なら「ゴール型」、4割以下なら「アシスト型」、その間は「バランス型」。" },
  { label: "チーム勝率", text: "所属チームの（勝ち＋引き分け×0.5）÷ 試合数（公式順位表）。公式には個人が出場した試合ごとの勝敗が無いため、個人の勝率は出していません。" },
  { label: "前季", text: "1つ前のシーズンの同じディビジョンの成績。そのディビジョンに出ていなければ「—」です。" },
];

function BasisSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
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
          <div>
            <h3 className="text-base font-bold text-white">数値の根拠</h3>
            <p className="text-xs text-gray-500">データはすべて公式サイトの個人成績・順位表・スコア表</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 text-gray-300" aria-label="閉じる">
            ✕
          </button>
        </div>
        <dl className="px-4 py-3 space-y-3 text-sm">
          {BASIS.map((b) => (
            <div key={b.label}>
              <dt className="font-bold text-white">{b.label}</dt>
              <dd className="text-xs text-gray-400 mt-0.5 leading-relaxed">{b.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** 同じ選手が複数ディビジョンに出ているときの、そのシーズンの全ディビジョン合計 */
export function MultiDivisionCard({ name, season, players }: { name: string; season: number; players: RatePlayer[] }) {
  const t = multiDivisionTotal(players, name);
  if (!t) return null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold whitespace-nowrap">{name}</span>
        <span className="text-gray-400 text-xs whitespace-nowrap">全ディビジョン合計</span>
        <span className="ml-auto text-gray-500 text-xs">{seasonOrdinal(season)}</span>
      </div>
      <div className="w-full border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800">
              {["GP", "G", "A", "P", "PIM", "P/試合"].map((h) => (
                <th key={h} className="py-1 text-center text-xs text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1.5 text-center text-white font-semibold">{t.gp}</td>
              <td className="py-1.5 text-center text-green-400 font-semibold">{t.goals}</td>
              <td className="py-1.5 text-center text-blue-400 font-semibold">{t.assists}</td>
              <td className="py-1.5 text-center text-white font-bold">{t.points}</td>
              <td className="py-1.5 text-center text-gray-400 font-semibold">{t.pim}</td>
              <td className="py-1.5 text-center text-white font-semibold">{t.gp > 0 ? f2(t.points / t.gp) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500">
        {t.divisions.length}ディビジョン: {t.divisions.map((d) => `${d.division}（${d.team}）`).join("・")}
      </p>
    </div>
  );
}
