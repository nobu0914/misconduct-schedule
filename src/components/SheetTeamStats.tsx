"use client";

// チーム総評の「スコア表から分かること」。アップロードされたスコア表を、このチームについて試合ごと・通算で集計する
import { useEffect, useMemo, useState } from "react";
import { seasonOrdinal } from "@/lib/season";
import { rowsByTeam, summarize, type SheetGameRow } from "@/lib/sheetStats";
import { teamKey } from "@/lib/teamName";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const md = (date: string) => date.replace(/^\d{4}\//, "");

function Tile({ label, value, sub, rank }: { label: string; value: string; sub?: string; rank?: string }) {
  return (
    <div className="rounded-lg bg-gray-800/60 px-2.5 py-2">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-lg font-bold text-white leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
      {rank && <p className="text-[10px] text-sky-300">{rank}</p>}
    </div>
  );
}

/** 前半・後半・OT の得点（上）と失点（下） */
function HalfBars({ f, a }: { f: [number, number, number]; a: [number, number, number] }) {
  const max = Math.max(1, ...f, ...a);
  const labels = ["前半", "後半", "OT"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {labels.map((l, i) =>
        i === 2 && f[2] === 0 && a[2] === 0 ? null : (
          <div key={l} className="space-y-1">
            <p className="text-[10px] text-gray-500 text-center">{l}</p>
            <div className="flex items-center gap-1">
              <div className="h-2 rounded bg-blue-500" style={{ width: `${(f[i] / max) * 100}%`, minWidth: f[i] ? 4 : 0 }} />
              <span className="text-[10px] text-blue-300">{f[i]}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 rounded bg-orange-500/80" style={{ width: `${(a[i] / max) * 100}%`, minWidth: a[i] ? 4 : 0 }} />
              <span className="text-[10px] text-orange-300">{a[i]}</span>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/** 5分ごとの得点・失点 */
function Bands({ f, a }: { f: number[]; a: number[] }) {
  const max = Math.max(1, ...f, ...a);
  return (
    <div className="flex items-end gap-1 h-20">
      {f.map((_, i) => (
        <div key={i} className={`flex-1 flex flex-col items-center ${i === 4 ? "border-l border-dashed border-gray-600 pl-1" : ""}`}>
          <div className="w-full flex items-end justify-center gap-0.5 h-14">
            {[
              [f[i], "bg-blue-500"],
              [a[i], "bg-orange-500/80"],
            ].map(([v, c], k) => (
              <div key={k} className="w-1/2 flex flex-col items-center justify-end h-full">
                {Number(v) > 0 && <span className="text-[8px] text-gray-400">{v}</span>}
                <div className={`w-full rounded-t ${c}`} style={{ height: `${(Number(v) / max) * 100}%`, minHeight: Number(v) ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <span className="text-[8px] text-gray-500">{(i % 4) * 5}〜</span>
        </div>
      ))}
    </div>
  );
}

export default function SheetTeamStats({ division, team, season }: { division: string; team: string; season: number }) {
  const [rows, setRows] = useState<SheetGameRow[] | null>(null);
  const [scope, setScope] = useState<"season" | "all">("season");
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    fetch(`/api/sheet-stats?div=${encodeURIComponent(division)}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setRows(d.rows ?? []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [division]);

  const key = teamKey(team);
  const seasonHas = useMemo(() => (rows ?? []).some((r) => r.season === season && teamKey(r.team) === key), [rows, season, key]);
  const s = scope === "season" && seasonHas ? season : undefined;
  const byTeam = useMemo(() => rowsByTeam(rows ?? [], division, s), [rows, division, s]);
  const mine = byTeam.get(key) ?? [];
  const sum = summarize(mine);

  // ディビジョン内の比較（スコア表がある2チーム以上のとき）: 後半失点率は低い方が上
  const compare = useMemo(() => {
    const list = [...byTeam.entries()]
      .map(([k, r]) => ({ k, s: summarize(r)! }))
      .filter((x) => x.s.secondHalfAgainstShare !== null);
    return list.length >= 2 ? list.sort((x, y) => x.s.secondHalfAgainstShare! - y.s.secondHalfAgainstShare!) : [];
  }, [byTeam]);
  const myRank = compare.findIndex((x) => x.k === key);

  if (rows === null) return null;
  if (!sum) {
    return (
      <div className="rounded-lg border border-dashed border-gray-700 px-3 py-2.5 text-xs text-gray-400">
        📋 このチームのスコア表はまだアップロードされていません。
        <a href="/player-ranking?mode=analysis" className="ml-1 text-blue-400 underline">
          分析からアップロード
        </a>
        すると、後半失点率・時間帯ごとの得失点などがここに出ます。
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-sky-900/60 bg-sky-950/20 px-3 py-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-sky-200">📋 スコア表から分かること</p>
        <span className="text-[11px] text-gray-400">アップロードされた {sum.games} 試合</span>
        <div className="ml-auto flex rounded-lg border border-gray-700 overflow-hidden text-[11px]">
          {(
            [
              ["season", `${seasonOrdinal(season)}`],
              ["all", "全シーズン"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              disabled={k === "season" && !seasonHas}
              data-feature={`チーム > スコア表 > ${label}`}
              className={`px-2 py-1 disabled:opacity-40 ${(k === "season" ? s !== undefined : s === undefined) ? "bg-sky-700 text-white" : "text-gray-400"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="後半失点率（失点のうち後半）"
          value={pct(sum.secondHalfAgainstShare)}
          sub={`後半失点 1試合 ${sum.secondHalfAgainstPerGame.toFixed(1)}点`}
          rank={myRank >= 0 ? `少ない順 ${myRank + 1}位 / ${compare.length}チーム` : undefined}
        />
        <Tile label="後半得点率（得点のうち後半）" value={pct(sum.secondHalfForShare)} sub={`得点 ${sum.goalsFor} / 失点 ${sum.goalsAgainst}`} />
        <Tile
          label="先制した試合"
          value={sum.scoredFirst.games ? `${sum.scoredFirst.wins}勝 / ${sum.scoredFirst.games}試合` : "—"}
          sub={sum.concededFirst.games ? `先に取られた試合 ${sum.concededFirst.wins}勝 / ${sum.concededFirst.games}試合` : undefined}
        />
        <Tile label="決定率 / セーブ率" value={`${pct(sum.shootingPct)} / ${pct(sum.savePct)}`} sub="シュート数が書かれた試合だけ" />
        <Tile label="PP得点 / SH得点" value={`${sum.ppGoals} / ${sum.shGoals}`} sub={`相手のPPで取られた点 ${sum.ppAgainst}`} />
        <Tile label="反則（1試合あたり）" value={`${sum.pimPerGame.toFixed(1)}分`} sub={sum.comebacks ? `逆転勝ち ${sum.comebacks}回` : undefined} />
      </div>

      <div>
        <p className="text-[11px] text-gray-400 mb-1">前半・後半の得点と失点</p>
        <HalfBars f={sum.forByHalf} a={sum.againstByHalf} />
      </div>
      <div>
        <p className="text-[11px] text-gray-400 mb-1">時間帯ごとの得点と失点（5分ごと・左が前半）</p>
        <Bands f={sum.bandsFor} a={sum.bandsAgainst} />
        <p className="text-[10px] text-gray-500">
          <span className="text-blue-400">■</span> 得点　<span className="text-orange-400">■</span> 失点
        </p>
      </div>

      {compare.length >= 2 && (
        <div>
          <p className="text-[11px] text-gray-400 mb-1">ディビジョン内の後半失点率（スコア表があるチーム・少ない順）</p>
          <div className="space-y-0.5">
            {compare.map((x, i) => (
              <div key={x.k} className={`flex items-center gap-2 text-xs ${x.k === key ? "text-white font-semibold" : "text-gray-400"}`}>
                <span className="w-4 text-gray-500">{i + 1}</span>
                <span className="flex-1 truncate">{x.s.team}</span>
                <span className="tabular-nums">{pct(x.s.secondHalfAgainstShare)}</span>
                <span className="text-[10px] text-gray-500 w-20 text-right">1試合 {x.s.secondHalfAgainstPerGame.toFixed(1)}点</span>
                <span className="text-[10px] text-gray-500 w-10 text-right">{x.s.games}試合</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] text-gray-400 mb-1">試合ごと</p>
        <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-900/60">
          {mine.map((r) => (
            <div key={`${r.date}-${r.gameNo}`} className="px-2.5 py-1.5 text-xs space-y-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${
                    r.result === "W" ? "bg-green-600 text-white" : r.result === "L" ? "bg-red-700/80 text-white" : "bg-gray-600 text-white"
                  }`}
                >
                  {r.result === "W" ? "勝" : r.result === "L" ? "負" : "分"}
                </span>
                <span className="text-gray-500 w-12">{s === undefined ? `${seasonOrdinal(r.season)} ` : ""}{md(r.date)}</span>
                <span className="text-gray-200 flex-1 truncate">vs {r.opponent}</span>
                <span className="text-white font-semibold tabular-nums">
                  {r.goalsFor}-{r.goalsAgainst}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 pl-7">
                前半 {r.forByHalf[0]}-{r.againstByHalf[0]} ／ 後半 {r.forByHalf[1]}-{r.againstByHalf[1]}
                {r.forByHalf[2] || r.againstByHalf[2] ? ` ／ OT ${r.forByHalf[2]}-${r.againstByHalf[2]}` : ""}
                {r.shots !== null ? ` ／ シュート ${r.shots}` : ""}
                {r.shotsAgainst !== null && r.saves !== null && r.shotsAgainst > 0 ? ` ／ セーブ率 ${pct(r.saves / r.shotsAgainst)}` : ""}
                {r.scoredFirst ? " ／ 先制" : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-gray-500">
        利用者がアップロードしたスコア表から集計しています（同じ試合は最新の1枚だけ）。アップロードされた試合だけなので、公式の成績とは試合数が違います。
      </p>
    </section>
  );
}
