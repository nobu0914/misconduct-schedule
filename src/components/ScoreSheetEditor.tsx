"use client";

import {
  checkSheet,
  DIVISIONS,
  playerName,
  type Half,
  type ScoreSheet,
  type SheetTeam,
  type Side,
} from "@/lib/scoreSheet";

interface Props {
  sheet: ScoreSheet;
  onChange: (sheet: ScoreSheet) => void;
}

const input = "bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 min-w-0";
const num = (v: string) => {
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: string) => (v.trim() === "" ? null : num(v));
const HALVES: { v: Half; label: string }[] = [
  { v: 1, label: "前半" },
  { v: 2, label: "後半" },
  { v: 3, label: "OT" },
];

/** スコア表の入力・確認フォーム。AI の読み取り結果もここで直す */
export default function ScoreSheetEditor({ sheet, onChange }: Props) {
  const update = (fn: (s: ScoreSheet) => void) => {
    const next = structuredClone(sheet);
    fn(next);
    onChange(next);
  };
  const { errors, warnings } = checkSheet(sheet);

  return (
    <div className="space-y-4">
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
        <h3 className="text-sm font-semibold text-gray-300">試合</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500 space-y-1">
            日付
            <input className={`${input} w-full`} value={sheet.date} placeholder="2026/9/6" onChange={(e) => update((s) => void (s.date = e.target.value))} />
          </label>
          <label className="text-xs text-gray-500 space-y-1">
            試合番号
            <input className={`${input} w-full`} inputMode="numeric" value={sheet.gameNo} placeholder="257" onChange={(e) => update((s) => void (s.gameNo = e.target.value))} />
          </label>
          <label className="text-xs text-gray-500 space-y-1">
            開始時刻
            <input className={`${input} w-full`} value={sheet.time ?? ""} placeholder="11:30" onChange={(e) => update((s) => void (s.time = e.target.value))} />
          </label>
          <label className="text-xs text-gray-500 space-y-1">
            ディビジョン
            <select className={`${input} w-full`} value={sheet.division} onChange={(e) => update((s) => void (s.division = e.target.value))}>
              <option value="">選択</option>
              {DIVISIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {(["visitor", "home"] as Side[]).map((side) => (
        <TeamEditor key={side} side={side} sheet={sheet} update={update} />
      ))}

      {(errors.length > 0 || warnings.length > 0) && (
        <section className="space-y-1.5">
          {errors.map((e) => (
            <p key={e} className="text-xs text-red-300 bg-red-900/30 border border-red-800/60 rounded px-2 py-1.5">要確認: {e}</p>
          ))}
          {warnings.map((w) => (
            <p key={w} className="text-xs text-amber-200 bg-amber-900/20 border border-amber-800/50 rounded px-2 py-1.5">確認: {w}</p>
          ))}
        </section>
      )}
    </div>
  );
}

function TeamEditor({ side, sheet, update }: { side: Side; sheet: ScoreSheet; update: (fn: (s: ScoreSheet) => void) => void }) {
  const t = sheet[side];
  const color = side === "visitor" ? "text-blue-400" : "text-orange-400";
  const setTeam = (fn: (t: SheetTeam) => void) => update((s) => fn(s[side]));
  const goals = sheet.goals.map((g, i) => ({ g, i })).filter(({ g }) => g.side === side);
  const penalties = sheet.penalties.map((p, i) => ({ p, i })).filter(({ p }) => p.side === side);
  const hint = (no?: string) => playerName(t, no);

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${color}`}>{side === "visitor" ? "Visitor" : "Home"}</span>
        <input className={`${input} flex-1`} value={t.name} placeholder="チーム名" onChange={(e) => setTeam((x) => void (x.name = e.target.value))} />
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-medium" />
            <th className="font-medium">前半</th>
            <th className="font-medium">後半</th>
            <th className="font-medium">OT</th>
            <th className="font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-gray-400 pr-1">得点</td>
            {[0, 1, 2].map((h) => (
              <td key={h} className="px-0.5">
                <input className={`${input} w-full text-center`} inputMode="numeric" value={t.goals[h]} onChange={(e) => setTeam((x) => void (x.goals[h] = num(e.target.value)))} />
              </td>
            ))}
            <td className="px-0.5">
              <input className={`${input} w-full text-center font-bold`} inputMode="numeric" value={t.total} onChange={(e) => setTeam((x) => void (x.total = num(e.target.value)))} />
            </td>
          </tr>
          <tr>
            <td className="text-gray-400 pr-1 pt-1">SOG</td>
            {[0, 1, 2].map((h) => (
              <td key={h} className="px-0.5 pt-1">
                <input className={`${input} w-full text-center`} inputMode="numeric" value={t.sog[h] ?? ""} onChange={(e) => setTeam((x) => void (x.sog[h] = numOrNull(e.target.value)))} />
              </td>
            ))}
            <td className="px-0.5 pt-1">
              <input className={`${input} w-full text-center font-bold`} inputMode="numeric" value={t.sogTotal ?? ""} onChange={(e) => setTeam((x) => void (x.sogTotal = numOrNull(e.target.value)))} />
            </td>
          </tr>
        </tbody>
      </table>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-14 flex-shrink-0">ゴーリー</span>
        <input className={`${input} w-14`} inputMode="numeric" value={t.goalie.no} placeholder="#" onChange={(e) => setTeam((x) => void (x.goalie.no = e.target.value))} />
        <input className={`${input} flex-1`} value={t.goalie.name} placeholder="名前" onChange={(e) => setTeam((x) => void (x.goalie.name = e.target.value))} />
      </div>

      <details className="group">
        <summary className="text-xs text-gray-400 cursor-pointer select-none">選手 {t.players.length}人（背番号と名前）</summary>
        <div className="mt-2 space-y-1.5">
          {t.players.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className={`${input} w-14`} inputMode="numeric" value={p.no} placeholder="#" onChange={(e) => setTeam((x) => void (x.players[i].no = e.target.value))} />
              <input className={`${input} flex-1`} value={p.name} placeholder="名前" onChange={(e) => setTeam((x) => void (x.players[i].name = e.target.value))} />
              <select className={`${input} w-14`} value={p.role ?? ""} onChange={(e) => setTeam((x) => void (x.players[i].role = e.target.value))}>
                <option value="" />
                <option value="C">C</option>
                <option value="A">A</option>
              </select>
              <button className="text-gray-500 px-1" aria-label="削除" onClick={() => setTeam((x) => void x.players.splice(i, 1))}>✕</button>
            </div>
          ))}
          <button className="text-xs text-blue-400" onClick={() => setTeam((x) => void x.players.push({ no: "", name: "" }))}>＋ 選手を追加</button>
        </div>
      </details>

      <div className="space-y-1.5">
        <p className="text-xs text-gray-400">得点の記録（{goals.length}件）</p>
        {goals.map(({ g, i }) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-1">
              <select className={`${input} w-[4.2rem]`} value={g.half} onChange={(e) => update((s) => void (s.goals[i].half = Number(e.target.value) as Half))}>
                {HALVES.map((h) => (
                  <option key={h.v} value={h.v}>{h.label}</option>
                ))}
              </select>
              <input className={`${input} w-[4.2rem] text-center`} value={g.time} placeholder="12:34" inputMode="decimal" onChange={(e) => update((s) => void (s.goals[i].time = e.target.value))} />
              <input className={`${input} w-11 text-center`} value={g.scorer} placeholder="G#" inputMode="numeric" onChange={(e) => update((s) => void (s.goals[i].scorer = e.target.value))} />
              <input className={`${input} w-11 text-center`} value={g.assist1 ?? ""} placeholder="A#" inputMode="numeric" onChange={(e) => update((s) => void (s.goals[i].assist1 = e.target.value || undefined))} />
              <input className={`${input} w-11 text-center`} value={g.assist2 ?? ""} placeholder="A#" inputMode="numeric" onChange={(e) => update((s) => void (s.goals[i].assist2 = e.target.value || undefined))} />
              <button className="text-gray-500 px-1" aria-label="削除" onClick={() => update((s) => void s.goals.splice(i, 1))}>✕</button>
            </div>
            {(hint(g.scorer) || hint(g.assist1)) && (
              <p className="text-[10px] text-gray-500 pl-1">
                {hint(g.scorer)}
                {hint(g.assist1) && `（A ${hint(g.assist1)}${hint(g.assist2) ? `・${hint(g.assist2)}` : ""}）`}
              </p>
            )}
          </div>
        ))}
        <button className="text-xs text-blue-400" onClick={() => update((s) => void s.goals.push({ side, half: 1, time: "", scorer: "" }))}>＋ 得点を追加</button>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-gray-400">反則の記録（{penalties.length}件）</p>
        {penalties.map(({ p, i }) => (
          <div key={i} className="flex items-center gap-1">
            <select className={`${input} w-[4.2rem]`} value={p.half} onChange={(e) => update((s) => void (s.penalties[i].half = Number(e.target.value) as Half))}>
              {HALVES.map((h) => (
                <option key={h.v} value={h.v}>{h.label}</option>
              ))}
            </select>
            <input className={`${input} w-[4.2rem] text-center`} value={p.time} placeholder="12:34" inputMode="decimal" onChange={(e) => update((s) => void (s.penalties[i].time = e.target.value))} />
            <input className={`${input} w-11 text-center`} value={p.no} placeholder="#" inputMode="numeric" onChange={(e) => update((s) => void (s.penalties[i].no = e.target.value))} />
            <input className={`${input} w-10 text-center`} value={p.minutes} inputMode="numeric" onChange={(e) => update((s) => void (s.penalties[i].minutes = num(e.target.value)))} />
            <input className={`${input} flex-1`} value={p.reason} placeholder="内容" onChange={(e) => update((s) => void (s.penalties[i].reason = e.target.value))} />
            <button className="text-gray-500 px-1" aria-label="削除" onClick={() => update((s) => void s.penalties.splice(i, 1))}>✕</button>
          </div>
        ))}
        <button className="text-xs text-blue-400" onClick={() => update((s) => void s.penalties.push({ side, half: 1, no: "", time: "", minutes: 2, reason: "" }))}>＋ 反則を追加</button>
      </div>
    </section>
  );
}
