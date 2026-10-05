"use client";

// チーム総評のグラフ（ライブラリなし・SVG と CSS だけ）
import type { ProfileAxis, ProfileGame, Record3 } from "@/lib/teamProfile";
import { playerLabel } from "@/lib/matchup";

/** 7指標のレーダー。青がこのチーム、点線がディビジョン平均（外側ほど良い） */
export function TeamRadar({ axes }: { axes: ProfileAxis[] }) {
  // ラベルが左右に長いので横長にする
  const w = 330;
  const h = 270;
  const cx = w / 2;
  const cy = h / 2 + 4;
  const r = 82;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + Math.cos(a) * r * (v / 100), cy + Math.sin(a) * r * (v / 100)] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[340px] mx-auto block" role="img" aria-label="ディビジョン内での位置のレーダー">
        {[25, 50, 75, 100].map((g) => (
          <polygon key={g} points={poly(axes.map(() => g))} fill="none" stroke="#374151" strokeWidth={g === 100 ? 1 : 0.6} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#374151" strokeWidth={0.6} />;
        })}
        <polygon points={poly(axes.map((a) => a.average))} fill="none" stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1.2} />
        <polygon points={poly(axes.map((a) => a.value))} fill="rgba(59,130,246,0.35)" stroke="#60a5fa" strokeWidth={2} />
        {axes.map((a, i) => {
          const [x, y] = pt(i, 128);
          return (
            <g key={a.key}>
              <text x={x} y={y - 4} textAnchor="middle" className="fill-gray-300" fontSize="10.5" fontWeight={600}>
                {a.label}
              </text>
              <text x={x} y={y + 9} textAnchor="middle" className={a.rank === 1 ? "fill-yellow-300" : "fill-gray-500"} fontSize="9.5">
                {a.raw}
                {a.rank ? `・${a.rank}位` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-gray-500 text-center">
        <span className="text-blue-400">■</span> このチーム　<span className="text-gray-400">┅</span> ディビジョン平均　外側ほど良い（ディビジョン最高が外周）
      </p>
    </div>
  );
}

/** 試合ごとの得点（上）と失点（下）。下の印は勝敗 */
export function SeasonFlow({ games }: { games: ProfileGame[] }) {
  const max = Math.max(1, ...games.map((g) => Math.max(g.for, g.against)));
  const h = 56;
  return (
    <div>
      <div className="flex items-stretch gap-1">
        {games.map((g, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center">
            <span className="text-[9px] text-blue-300 tabular-nums">{g.for}</span>
            <div className="w-full flex flex-col justify-end" style={{ height: h }}>
              <div className="w-full rounded-t bg-blue-500" style={{ height: `${(g.for / max) * h}px` }} />
            </div>
            <div className="w-full h-px bg-gray-500" />
            <div className="w-full flex flex-col" style={{ height: h }}>
              <div className="w-full rounded-b bg-orange-500/80" style={{ height: `${(g.against / max) * h}px` }} />
            </div>
            <span className="text-[9px] text-orange-300 tabular-nums">{g.against}</span>
            <span
              className={`mt-0.5 w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold ${
                g.result === "W" ? "bg-green-600 text-white" : g.result === "L" ? "bg-red-700/80 text-white" : "bg-gray-600 text-white"
              }`}
            >
              {g.result === "W" ? "勝" : g.result === "L" ? "負" : "分"}
            </span>
            <span className="text-[8px] text-gray-500 mt-0.5">{g.date.replace(/^\d{4}\//, "")}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 mt-1">
        <span className="text-blue-400">■</span> 得点　<span className="text-orange-400">■</span> 失点（左から古い順）
      </p>
    </div>
  );
}

/** 勝・分・負の割合のバー */
export function RecordBar({ label, rec, note }: { label: string; rec: Record3; note?: string }) {
  const total = rec.w + rec.l + rec.t;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-gray-300">
          {label}
          {note && <span className="text-[10px] text-gray-500 ml-1">{note}</span>}
        </span>
        <span className="text-gray-200 tabular-nums">
          {rec.w}勝 {rec.l}敗 {rec.t}分
        </span>
      </div>
      <div className="flex h-2 rounded overflow-hidden bg-gray-800">
        <div className="bg-green-500" style={{ width: pct(rec.w) }} />
        <div className="bg-gray-500" style={{ width: pct(rec.t) }} />
        <div className="bg-red-600/80" style={{ width: pct(rec.l) }} />
      </div>
    </div>
  );
}

/** 選手のポイント（濃い=ゴール、薄い=アシスト） */
export function PlayerPoints({ players }: { players: { name: string; jersey?: number; goals: number; assists: number; points: number }[] }) {
  const max = Math.max(1, ...players.map((p) => p.points));
  return (
    <div className="space-y-1">
      {players.map((p) => (
        <div key={p.name} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-xs">
          <span className="text-gray-200 truncate">{playerLabel(p)}</span>
          <div className="flex h-2.5 rounded overflow-hidden bg-gray-800">
            <div className="bg-blue-500" style={{ width: `${(p.goals / max) * 100}%` }} />
            <div className="bg-blue-500/40" style={{ width: `${(p.assists / max) * 100}%` }} />
          </div>
          <span className="text-gray-300 text-right tabular-nums">
            {p.goals}G {p.assists}A
          </span>
        </div>
      ))}
      <p className="text-[10px] text-gray-500">濃い部分がゴール、薄い部分がアシスト</p>
    </div>
  );
}

/** これまでのシーズンの順位（上ほど上位） */
export function HistoryRanks({ history }: { history: { season: number; label: string; rank?: number; totalTeams?: number; champion?: boolean }[] }) {
  const rows = history.filter((h) => h.rank && h.totalTeams).reverse();
  if (rows.length < 2) return null;
  return (
    <div className="flex items-end gap-3 h-24">
      {rows.map((h) => {
        const ratio = 1 - (h.rank! - 1) / Math.max(1, h.totalTeams! - 1);
        return (
          <div key={h.season} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className={`text-[10px] ${h.rank === 1 ? "text-yellow-300" : "text-gray-300"}`}>
              {h.rank}位{h.champion ? "🏆" : ""}
            </span>
            <div className={`w-full max-w-10 rounded-t ${h.rank === 1 ? "bg-yellow-500" : "bg-blue-500"}`} style={{ height: `${10 + ratio * 55}px` }} />
            <span className="text-[10px] text-gray-500 mt-0.5">{h.label}</span>
          </div>
        );
      })}
    </div>
  );
}
