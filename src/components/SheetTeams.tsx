"use client";

// 分析 → チーム別。アップロードされたスコア表を、ディビジョン・チームごとに集計して見る。
// 見られるのは、スコア表をアップロードした人・コンテニューコード（共有リンク含む）で見に来た人だけ（ユーザー指示 10/6）。
// 公式データのチーム総評（データ → チーム、誰でも見る）とは分けて、スコア表の数字はここだけに出す（アップロードしないチームが得をしないように）。
import { useEffect, useMemo, useState } from "react";
import SheetTeamStats from "@/components/SheetTeamStats";
import { deviceContinueCodes } from "@/lib/editTokens";
import { DIVISIONS } from "@/lib/scoreSheet";
import { seasonOrdinal } from "@/lib/season";
import { closestTeam, teamKey } from "@/lib/teamName";
import type { SheetGameRow } from "@/lib/sheetStats";

/** スコア表の集まり具合（今シーズン、ディビジョンごと）。アップロードするほど育つことが見えるように */
function Growth({ onPick, picked }: { onPick?: (division: string) => void; picked?: string }) {
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
      <p className="text-[11px] text-gray-400">アップロードされるほど、チーム別の集計（後半失点率・時間帯ごとの得失点など）が正確になり、AI の総評にも使われます。</p>
      <div className="space-y-1">
        {DIVISIONS.filter((d) => played[d] || games[`${season}|${d}`]).map((d) => {
          const n = games[`${season}|${d}`] ?? 0;
          const of = played[d] ?? 0;
          return (
            <button
              key={d}
              onClick={() => onPick?.(d)}
              disabled={!onPick}
              className={`w-full grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-xs text-left ${picked === d ? "text-white" : "text-gray-300"}`}
            >
              <span className="truncate">{d}</span>
              <span className="h-2 rounded bg-gray-800 overflow-hidden">
                <span className="block h-full bg-emerald-500" style={{ width: `${of ? Math.min(100, (n / of) * 100) : n ? 100 : 0}%` }} />
              </span>
              <span className="text-right tabular-nums text-gray-400">
                {n}/{of}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SheetTeams({ initial }: { initial?: { division: string; team: string } | null }) {
  // 端末で使っているコンテニューコード（保存・呼び出し・共有リンク）。開くたびに読み直す（呼び出した直後でも見られるように）
  const [codes] = useState(() => (typeof window === "undefined" ? [] : deviceContinueCodes()));
  const proof = codes.length ? codes.join(",") : null;
  const [division, setDivision] = useState(initial?.division ?? "");
  const [team, setTeam] = useState(initial?.team ?? "");
  const [rows, setRows] = useState<SheetGameRow[] | null>(null);

  useEffect(() => {
    if (initial) {
      setDivision(initial.division);
      setTeam(initial.team);
    }
  }, [initial]);

  useEffect(() => {
    if (!proof || !division) return;
    let cancelled = false;
    setRows(null);
    fetch(`/api/sheet-stats?div=${encodeURIComponent(division)}`, { headers: { "x-continue-codes": proof } })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => !cancelled && setRows(d.rows ?? []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [proof, division]);

  // スコア表があるチーム（試合数の多い順）
  const teams = useMemo(() => {
    const count = new Map<string, { team: string; games: number }>();
    for (const r of rows ?? []) {
      const k = teamKey(r.team);
      const c = count.get(k) ?? { team: r.team, games: 0 };
      c.games += 1;
      count.set(k, c);
    }
    return [...count.values()].sort((a, b) => b.games - a.games || a.team.localeCompare(b.team, "ja"));
  }, [rows]);
  const current = (team && closestTeam(teams, team)) || teams[0];
  const season = useMemo(() => {
    const mine = (rows ?? []).filter((r) => current && teamKey(r.team) === teamKey(current.team));
    return mine.reduce((m, r) => Math.max(m, r.season), 0);
  }, [rows, current]);

  if (!proof) {
    return (
      <div className="space-y-3">
      <Growth />
      <div className="rounded-xl border border-sky-900/60 bg-sky-950/20 px-4 py-4 text-sm text-gray-300 space-y-1">
        <p className="font-semibold text-sky-200">📋 チーム別の集計は、スコア表を使っている人が見られます</p>
        <p className="text-xs text-gray-400">
          アップロードされた試合から、チームごとの後半失点率・時間帯ごとの得失点・先制したときの勝率などをまとめて見られます。
          「アップロード」でスコア表を保存するか、コンテニューコードで試合を呼び出すと開きます。
        </p>
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Growth
        picked={division}
        onPick={(d) => {
          setDivision(d);
          setTeam("");
        }}
      />
      <p className="text-xs text-gray-500">アップロードされたスコア表を、チームごとに集計します（同じ試合は最新の1枚だけ）。</p>
      <div className="flex flex-wrap gap-1.5">
        {DIVISIONS.map((d) => (
          <button
            key={d}
            onClick={() => {
              setDivision(d);
              setTeam("");
            }}
            data-feature={`分析 > チーム別 > ディビジョン > ${d}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${division === d ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"}`}
          >
            {d}
          </button>
        ))}
      </div>
      {!division && <p className="text-sm text-gray-500 text-center py-6">ディビジョンを選んでください。</p>}
      {division && rows === null && <p className="text-sm text-gray-500 text-center py-6">読み込み中…</p>}
      {division && rows && teams.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-6">{division} のスコア表はまだありません。</p>
      )}
      {division && rows && current && (
        <>
          <select
            value={teamKey(current.team)}
            onChange={(e) => setTeam(teams.find((t) => teamKey(t.team) === e.target.value)?.team ?? "")}
            className="w-full bg-gray-900 border-2 border-sky-600 rounded-lg px-3 py-2.5 text-sm text-white"
          >
            {teams.map((t) => (
              <option key={teamKey(t.team)} value={teamKey(t.team)}>
                {t.team}（{t.games}試合）
              </option>
            ))}
          </select>
          {season > 0 && <SheetTeamStats rows={rows} division={division} team={current.team} season={season} />}
          <p className="text-[11px] text-gray-500">
            {season > 0 ? `最新のシーズン（${seasonOrdinal(season)}）を表示中。` : ""}公式の成績・AI総評は「データ → チーム」で見られます。
          </p>
        </>
      )}
    </div>
  );
}
