"use client";

// スコア表1枚の分析を図で見せる部品（SVG と CSS だけ。ライブラリは使わない）。
// 色は Visitor = 青、Home = オレンジ（画面のほかの部分と同じ）。

import { goalOrder, parseClock, playerName, type GameAnalysis, type ScoreSheet, type Side } from "@/lib/scoreSheet";

const BLUE = "#60a5fa";
const ORANGE = "#fb923c";
const colorOf = (side: Side) => (side === "visitor" ? BLUE : ORANGE);

function Title({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 mb-2">{children}</p>;
}

/** 両チームの比較（中央から左右に伸びる棒） */
export function VersusBars({ a }: { a: Record<Side, GameAnalysis> }) {
  const v = a.visitor;
  const h = a.home;
  const pct = (x: number | null) => (x === null ? null : Math.round(x * 100));
  const rows: { label: string; l: number | null; r: number | null; unit?: string; lowerIsBetter?: boolean }[] = [
    { label: "得点", l: v.goalsFor, r: h.goalsFor },
    { label: "前半", l: v.byHalf.for[0], r: h.byHalf.for[0] },
    { label: "後半", l: v.byHalf.for[1], r: h.byHalf.for[1] },
    ...(v.byHalf.for[2] + h.byHalf.for[2] > 0 ? [{ label: "OT", l: v.byHalf.for[2], r: h.byHalf.for[2] }] : []),
    { label: "シュート", l: v.shots, r: h.shots },
    { label: "決定率", l: pct(v.shootingPct), r: pct(h.shootingPct), unit: "%" },
    { label: "PP得点", l: v.powerPlayGoals, r: h.powerPlayGoals },
    { label: "SH得点", l: v.shortHandedGoals, r: h.shortHandedGoals },
    { label: "反則", l: v.penaltyMinutes, r: h.penaltyMinutes, unit: "分", lowerIsBetter: true },
  ];
  return (
    <section>
      <Title>チーム比較</Title>
      <div className="space-y-1.5">
        {rows.filter((row) => row.l !== null || row.r !== null).map((row) => {
          const max = Math.max(row.l ?? 0, row.r ?? 0, 1);
          const lw = ((row.l ?? 0) / max) * 100;
          const rw = ((row.r ?? 0) / max) * 100;
          const lWin = row.l !== null && row.r !== null && (row.lowerIsBetter ? row.l < row.r : row.l > row.r);
          const rWin = row.l !== null && row.r !== null && (row.lowerIsBetter ? row.r < row.l : row.r > row.l);
          const fmt = (x: number | null) => (x === null ? "—" : `${x}${row.unit ?? ""}`);
          return (
            <div key={row.label} className="grid grid-cols-[2.6rem_1fr_3.6rem_1fr_2.6rem] items-center gap-1 text-xs">
              <span className={`text-right ${lWin ? "text-blue-300 font-bold" : "text-gray-400"}`}>{fmt(row.l)}</span>
              <div className="h-2.5 bg-gray-800 rounded-l flex justify-end overflow-hidden">
                <div className="h-full rounded-l" style={{ width: `${lw}%`, background: BLUE, opacity: lWin ? 1 : 0.55 }} />
              </div>
              <span className="text-center text-[11px] text-gray-500">{row.label}</span>
              <div className="h-2.5 bg-gray-800 rounded-r overflow-hidden">
                <div className="h-full rounded-r" style={{ width: `${rw}%`, background: ORANGE, opacity: rWin ? 1 : 0.55 }} />
              </div>
              <span className={`${rWin ? "text-orange-300 font-bold" : "text-gray-400"}`}>{fmt(row.r)}</span>
            </div>
          );
        })}
      </div>
      {v.shots === null && h.shots === null && (
        <p className="text-[11px] text-amber-200/80 mt-2">この試合はシュート数（SOG）が記録されていないため、シュート・決定率・セーブ率は出せません。</p>
      )}
    </section>
  );
}

/** ゴーリーのセーブ率（ドーナツ） */
export function GoalieDonuts({ a }: { a: Record<Side, GameAnalysis> }) {
  const sides: Side[] = ["visitor", "home"];
  if (sides.every((s) => a[s].goalie.savePct === null)) return null;
  return (
    <section>
      <Title>ゴーリーのセーブ率</Title>
      <div className="grid grid-cols-2 gap-3">
        {sides.map((side) => {
          const g = a[side].goalie;
          const p = g.savePct;
          const r = 30;
          const c = 2 * Math.PI * r;
          return (
            <div key={side} className="flex flex-col items-center gap-1">
              <svg viewBox="0 0 80 80" className="w-24 h-24">
                <circle cx="40" cy="40" r={r} fill="none" stroke="#1f2937" strokeWidth="10" />
                {p !== null && (
                  <circle
                    cx="40"
                    cy="40"
                    r={r}
                    fill="none"
                    stroke={colorOf(side)}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${c * p} ${c}`}
                    transform="rotate(-90 40 40)"
                  />
                )}
                <text x="40" y="44" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
                  {p === null ? "—" : `${Math.round(p * 100)}%`}
                </text>
              </svg>
              <span className="text-xs text-gray-200 truncate max-w-full">{g.name || (g.no ? `#${g.no}` : "—")}</span>
              <span className="text-[11px] text-gray-500">
                {g.shotsFaced === null ? "シュート数なし" : `${g.saves}セーブ / ${g.shotsFaced}本`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 経過時間（分）。前半0〜20、後半20〜40、OT 40〜 */
function minuteOf(half: number, time: string): number | null {
  const sec = parseClock(time);
  return sec === null ? null : (half - 1) * 20 + sec / 60;
}

/** 得点の推移（2チームの積み上げ線と、得点の印） */
export function ScoreFlow({ sheet }: { sheet: ScoreSheet }) {
  const goals = [...sheet.goals]
    .sort(goalOrder)
    .map((g) => ({ g, m: minuteOf(g.half, g.time) }))
    .filter((x): x is { g: (typeof sheet.goals)[number]; m: number } => x.m !== null);
  if (goals.length === 0) return null;
  const end = Math.max(40, ...goals.map((x) => Math.ceil(x.m)));
  const top = Math.max(sheet.visitor.total, sheet.home.total, ...["visitor", "home"].map((s) => goals.filter((x) => x.g.side === s).length), 1);
  const W = 320;
  const H = 150;
  const L = 22;
  const B = 18;
  const x = (m: number) => L + (m / end) * (W - L - 6);
  const y = (n: number) => H - B - (n / top) * (H - B - 8);
  const line = (side: Side) => {
    let n = 0;
    let d = `M${x(0)},${y(0)}`;
    for (const { g, m } of goals) {
      if (g.side !== side) continue;
      d += ` H${x(m)} V${y(++n)}`;
    }
    return `${d} H${x(end)}`;
  };
  const counts: Record<Side, number> = { visitor: 0, home: 0 };
  const ticks = Array.from({ length: Math.floor(top) + 1 }, (_, i) => i).filter((i) => top <= 6 || i % Math.ceil(top / 5) === 0);
  return (
    <section>
      <Title>得点の推移</Title>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} stroke="#1f2937" />
            <text x={L - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="#6b7280">
              {t}
            </text>
          </g>
        ))}
        <line x1={x(20)} x2={x(20)} y1={6} y2={H - B} stroke="#4b5563" strokeDasharray="3 3" />
        {end > 40 && <line x1={x(40)} x2={x(40)} y1={6} y2={H - B} stroke="#4b5563" strokeDasharray="3 3" />}
        {[0, 10, 20, 30, 40].map((m) => (
          <text key={m} x={x(m)} y={H - 5} textAnchor="middle" fontSize="8" fill="#6b7280">
            {m === 20 ? "後半" : m === 0 ? "0" : `${m}分`}
          </text>
        ))}
        <path d={line("visitor")} fill="none" stroke={BLUE} strokeWidth="2" />
        <path d={line("home")} fill="none" stroke={ORANGE} strokeWidth="2" />
        {goals.map(({ g, m }, i) => {
          const n = ++counts[g.side];
          return <circle key={i} cx={x(m)} cy={y(n)} r="3" fill={colorOf(g.side)} stroke="#0b1220" strokeWidth="1" />;
        })}
      </svg>
      <div className="flex justify-center gap-4 text-[11px] mt-1">
        <span className="text-blue-300">● {sheet.visitor.name || "Visitor"}</span>
        <span className="text-orange-300">● {sheet.home.name || "Home"}</span>
      </div>
    </section>
  );
}

/** 時間帯ごとの得点（5分ごとの棒） */
export function TimeBandChart({ sheet }: { sheet: ScoreSheet }) {
  const bands = Array.from({ length: 8 }, (_, i) => ({ half: i < 4 ? 1 : 2, from: (i % 4) * 5 }));
  const count = (side: Side, half: number, from: number) =>
    sheet.goals.filter((g) => {
      const sec = parseClock(g.time);
      const to = from + 5;
      return g.side === side && g.half === half && sec !== null && sec >= from * 60 && (to === 20 ? sec <= 1200 : sec < to * 60);
    }).length;
  const data = bands.map((b) => ({ ...b, v: count("visitor", b.half, b.from), h: count("home", b.half, b.from) }));
  const max = Math.max(1, ...data.flatMap((d) => [d.v, d.h]));
  if (sheet.goals.length === 0) return null;
  return (
    <section>
      <Title>時間帯ごとの得点（5分ごと）</Title>
      <div className="flex items-end gap-1 h-28">
        {data.map((d, i) => (
          <div key={i} className={`flex-1 flex flex-col items-center gap-1 ${i === 4 ? "border-l border-dashed border-gray-600 pl-1" : ""}`}>
            <div className="w-full flex items-end justify-center gap-0.5 h-20">
              {(["v", "h"] as const).map((k) => (
                <div key={k} className="w-1/2 flex flex-col items-center justify-end h-full">
                  {d[k] > 0 && <span className="text-[9px] text-gray-300">{d[k]}</span>}
                  <div className="w-full rounded-t" style={{ height: `${(d[k] / max) * 100}%`, background: k === "v" ? BLUE : ORANGE, minHeight: d[k] ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <span className="text-[9px] text-gray-500 whitespace-nowrap">{d.from}〜</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-1">
        <span>前半</span>
        <span>後半</span>
      </div>
    </section>
  );
}

/** この試合の個人のポイント（ゴールとアシストの横棒） */
export function PlayerBars({ sheet }: { sheet: ScoreSheet }) {
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
    return [...m.entries()].map(([no, r]) => ({ side, no, name: playerName(team, no), ...r, p: r.g + r.a }));
  });
  if (rows.length === 0) return null;
  rows.sort((x, y) => y.p - x.p || y.g - x.g);
  const max = Math.max(...rows.map((r) => r.p));
  return (
    <section>
      <Title>個人のポイント（この試合）</Title>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={`${r.side}${r.no}`} className="grid grid-cols-[7.5rem_1fr_3.2rem] items-center gap-2 text-xs">
            <span className={`truncate ${r.side === "visitor" ? "text-blue-300" : "text-orange-300"}`}>
              #{r.no} {r.name}
            </span>
            <div className="h-3 flex rounded overflow-hidden bg-gray-800">
              <div style={{ width: `${(r.g / max) * 100}%`, background: colorOf(r.side) }} />
              <div style={{ width: `${(r.a / max) * 100}%`, background: colorOf(r.side), opacity: 0.4 }} />
            </div>
            <span className="text-gray-300 text-right whitespace-nowrap">
              {r.g}G {r.a}A
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 mt-1">濃い部分がゴール、薄い部分がアシスト</p>
    </section>
  );
}
