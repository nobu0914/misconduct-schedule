"use client";

// スコア表の「チームの通算」。コンテニューコードで開いた試合の中に、その試合の両チームの通算を出す
// （端末ではなくコンテニューコードが軸。全ディビジョンを選ぶ必要は無いので、その試合のチームだけ。ユーザー指示 10/6）。
// 見られるのは、スコア表をアップロードした人・コンテニューコード（共有リンク含む）で見に来た人だけ（ユーザー指示 10/6）。
// 公式データのチーム総評（データ → チーム、誰でも見る）とは分けて、スコア表の数字はここだけに出す（アップロードしないチームが得をしないように）。
import { useEffect, useState } from "react";
import SheetTeamStats from "@/components/SheetTeamStats";
import { DIVISIONS, type ScoreSheet } from "@/lib/scoreSheet";
import { seasonOfDate } from "@/lib/sheetStats";
import { seasonOrdinal } from "@/lib/season";
import type { SheetGameRow } from "@/lib/sheetStats";

/** スコア表の集まり具合（今シーズン、ディビジョンごと）。アップロードするほど育つことが見えるように */
export function SheetGrowth() {
  const [games, setGames] = useState<Record<string, number> | null>(null);
  const [played, setPlayed] = useState<Record<string, number>>({});
  const [season, setSeason] = useState<number>();
  useEffect(() => {
    fetch("/api/sheet-stats?summary=1")
      .then((r) => r.json())
      .then((d) => setGames(d.games ?? {}))
      .catch(() => setGames({}));
    // 今シーズンの消化済みの試合数（日程表で今日より前の試合、延期・プレイオフを除く）
    fetch("/api/schedule")
      .then((r) => r.json())
      .then((d) => {
        const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
        const key = (date: string) => date.split("/").map((x, i) => (i ? x.padStart(2, "0") : x)).join("-");
        const cur = 54 + (Number(today.slice(5, 7)) >= 10 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1) - 2026;
        const label = seasonOrdinal(cur);
        const out: Record<string, number> = {};
        for (const m of d.matches ?? []) {
          if (m.season !== label || m.status === "postponed" || m.round || key(m.date) >= today) continue;
          out[m.division] = (out[m.division] ?? 0) + 1;
        }
        setSeason(cur);
        setPlayed(out);
      })
      .catch(() => {});
  }, []);
  if (!games || season === undefined) return null;
  const total = Object.entries(games).filter(([k]) => k.startsWith(`${season}|`)).reduce((n, [, v]) => n + v, 0);
  const totalPlayed = Object.values(played).reduce((n, v) => n + v, 0);
  return (
    <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 px-3 py-3 space-y-2">
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-semibold text-emerald-200">🌱 スコア表の集まり具合（{seasonOrdinal(season)}）</p>
        <span className="ml-auto text-xs text-gray-300">
          <span className="text-lg font-bold text-white">{total}</span> / {totalPlayed} 試合
        </span>
      </div>
      <p className="text-[11px] text-gray-400">アップロードされるほど、チームの通算（後半失点率・時間帯ごとの得失点など）が正確になり、AI の総評にも使われます。</p>
      <div className="space-y-1">
        {DIVISIONS.filter((d) => played[d] || games[`${season}|${d}`]).map((d) => {
          const n = games[`${season}|${d}`] ?? 0;
          const of = played[d] ?? 0;
          return (
            <div key={d} className="w-full grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-xs text-gray-300">
              <span className="truncate">{d}</span>
              <span className="h-2 rounded bg-gray-800 overflow-hidden">
                <span className="block h-full bg-emerald-500" style={{ width: `${of ? Math.min(100, (n / of) * 100) : n ? 100 : 0}%` }} />
              </span>
              <span className="text-right tabular-nums text-gray-400">
                {n}/{of}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 試合の分析の中: この試合の両チームの、スコア表の通算。コンテニューコードで開いた試合なので見られる */
export function GameTeamTotals({ sheet }: { sheet: ScoreSheet }) {
  const [side, setSide] = useState<"visitor" | "home" | null>(null);
  const [rows, setRows] = useState<SheetGameRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const season = seasonOfDate(sheet.date);
  const code = sheet.continueCode;

  // 開いたときに1回だけ取る（ディビジョンの全チームの行。順位の比較にも使う）
  useEffect(() => {
    if (!side || rows || !code) return;
    let cancelled = false;
    fetch(`/api/sheet-stats?div=${encodeURIComponent(sheet.division)}`, { headers: { "x-continue-codes": code } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setRows(d.rows ?? []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [side, rows, code, sheet.division]);

  if (!sheet.division || season === undefined) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(["visitor", "home"] as const).map((k) =>
          sheet[k].name ? (
            <div key={k} className={`rounded-lg border px-2.5 py-2 text-xs ${k === "visitor" ? "border-blue-800/70" : "border-orange-800/70"}`}>
              <span className={`block truncate font-medium ${k === "visitor" ? "text-blue-300" : "text-orange-300"}`}>{sheet[k].name}</span>
              {/* 2つのリンクは押し間違えないよう、ボタンの形にして離す */}
              {code && (
                <button
                  onClick={() => setSide(side === k ? null : k)}
                  data-feature={`分析 > チームの通算 > ${sheet.division} > ${sheet[k].name}`}
                  className={`mt-2 w-full py-2 rounded-md text-[11px] font-medium whitespace-nowrap ${
                    side === k ? "bg-sky-700 text-white" : "bg-sky-900/40 text-sky-200 border border-sky-800/70"
                  }`}
                >
                  スコア表の通算 {side === k ? "▲" : "▼"}
                </button>
              )}
              <a
                href={`/player-ranking?${new URLSearchParams({ mode: "team", div: sheet.division, season: String(season), t: sheet[k].name })}`}
                data-feature={`分析 > チーム総評へ > ${sheet.division} > ${sheet[k].name}`}
                className="mt-3 block w-full py-2 rounded-md text-center text-[11px] whitespace-nowrap text-gray-300 bg-gray-800/70 border border-gray-700"
              >
                公式のチーム総評 →
              </a>
            </div>
          ) : null
        )}
      </div>
      {side &&
        (failed ? (
          <p className="text-xs text-gray-500 text-center py-3">通算を読み込めませんでした。</p>
        ) : !rows ? (
          <p className="text-xs text-gray-500 text-center py-3">読み込み中…</p>
        ) : (
          <SheetTeamStats rows={rows} division={sheet.division} team={sheet[side].name} season={season} />
        ))}
    </div>
  );
}
