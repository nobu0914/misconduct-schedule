"use client";

// チームランキングの「上を抜くには」。行の下の一言（GapLine）と、行をタップで開く内訳（GapDetail）。
import type { Chase, TeamGap } from "@/lib/standingsGap";

const VERDICT: Record<NonNullable<Chase["verdict"]>, { label: string; cls: string }> = {
  self: { label: "自力で逆転可", cls: "text-green-400" },
  help: { label: "他力", cls: "text-amber-400" },
  tieOnly: { label: "全勝で並ぶのみ", cls: "text-gray-500" },
  impossible: { label: "逆転不可", cls: "text-gray-500" },
  final: { label: "", cls: "" },
};

function gapText(gap: number) {
  return gap > 0 ? `勝点${gap}差` : "同じ勝点";
}

/** チーム名の下に出す一言 */
export function GapLine({ gap, final }: { gap: TeamGap; final?: boolean }) {
  if (gap.lead) {
    if (!final && gap.lead.clinched) return <span className="text-green-400">1位確定</span>;
    return (
      <span className="text-gray-500">
        {gap.lead.gap > 0 ? `2位と${gap.lead.gap}差` : "2位と同じ勝点"}
      </span>
    );
  }
  const up = gap.above[0];
  if (!up) return null;
  const v = up.verdict && !final ? VERDICT[up.verdict] : undefined;
  return (
    <span className="text-gray-500">
      ↑{up.target}{up.gap > 0 ? `まで${up.gap}差` : "と同じ勝点"}
      {v?.label && <span className={`ml-1.5 ${v.cls}`}>{v.label}</span>}
    </span>
  );
}

function verdictDetail(c: Chase): string {
  switch (c.verdict) {
    case "self":
      return `残り${c.remaining}試合を全勝すれば、相手の結果に関係なく抜けます。`;
    case "help": {
      const p = c.helpPoints ?? 0;
      return `全勝しても、相手も勝ち続けると届きません。相手が勝点を${p}落とす（${Math.ceil(p / 2)}敗、または引き分け${p}つ）必要があります。`;
    }
    case "tieOnly":
      return "残りを全勝しても勝点で並ぶのが最大です（並んだときの順位の決め方は公式に記載なし）。";
    case "impossible":
      return "残りを全勝しても届きません。";
    case "final":
      return "最終順位での差です。";
    default:
      return "残り試合の日程がわからないため、判定は出していません。";
  }
}

/** 行をタップしたときの内訳 */
export function GapDetail({ gap, gaps, final }: { gap: TeamGap; gaps: TeamGap[]; final?: boolean }) {
  return (
    <div className="space-y-2 text-xs">
      {!final && gap.remaining !== undefined && gap.remaining > 0 && (
        <p className="text-gray-400">
          残り <span className="text-white font-semibold">{gap.remaining}</span> 試合 · 全勝で勝点{" "}
          <span className="text-white font-semibold">{gap.maxPoints}</span>
        </p>
      )}

      {gap.lead && (() => {
        const rivals = gaps.slice(1).filter((g) => g.maxPoints !== undefined);
        const best = rivals.reduce<TeamGap | undefined>((b, g) => (!b || g.maxPoints! > b.maxPoints! ? g : b), undefined);
        return (
          <div className="rounded-lg bg-gray-800/60 px-2.5 py-2 space-y-1">
            <p className="text-gray-300">
              2位 {gap.lead.over} と勝点 <span className="text-white font-semibold">{gap.lead.gap}</span> 差
            </p>
            {!final && best && (
              <p className="text-gray-400">
                {gap.lead.clinched
                  ? "2位以下が残りを全勝しても届かないので、レギュラーシーズン1位が確定しています。"
                  : `2位以下で最大の勝点は ${best.team} の ${best.maxPoints}（全勝した場合）。これを上回る勝点になると1位確定です。`}
              </p>
            )}
          </div>
        );
      })()}

      {/* 下位のチームは上が多いので、近い3チームと1位だけ */}
      {gap.above.filter((c, i) => i < 3 || c.targetRank === 1).map((c) => (
        <div key={c.target} className="rounded-lg bg-gray-800/60 px-2.5 py-2 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-gray-500">{c.targetRank}位</span>
            <span className="text-white font-medium truncate">{c.target}</span>
            <span className="ml-auto text-gray-300 flex-shrink-0">{gapText(c.gap)}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="rounded bg-gray-900/70 py-1">
              <div className="text-[10px] text-gray-500">抜くのに必要</div>
              <div className="text-white font-semibold">
                勝点+{c.toPass}
                <span className="text-gray-400 font-normal">（{c.winsToPass}勝）</span>
              </div>
            </div>
            <div className="rounded bg-gray-900/70 py-1">
              <div className="text-[10px] text-gray-500">並ぶのに必要</div>
              <div className="text-white font-semibold">
                {c.gap > 0 ? (
                  <>
                    勝点+{c.gap}
                    <span className="text-gray-400 font-normal">（{Math.ceil(c.gap / 2)}勝）</span>
                  </>
                ) : (
                  "並んでいる"
                )}
              </div>
            </div>
            <div className="rounded bg-gray-900/70 py-1">
              <div className="text-[10px] text-gray-500">直接対決の残り</div>
              <div className="text-white font-semibold">{final ? "—" : `${c.headToHead}試合`}</div>
            </div>
          </div>
          {!final && c.targetRemaining !== undefined && (
            <p className="text-gray-500">相手の残り {c.targetRemaining} 試合</p>
          )}
          <p className={c.verdict && !final ? VERDICT[c.verdict].cls || "text-gray-400" : "text-gray-400"}>
            {final ? "最終順位での差です。" : verdictDetail(c)}
          </p>
        </div>
      ))}
      {gap.above.length > 0 && (
        <p className="text-[10px] text-gray-600">必要な勝点・勝ち数は、相手がこの先勝点を取らなかった場合です。</p>
      )}
    </div>
  );
}

export function GapNote({ final }: { final?: boolean }) {
  return (
    <p className="px-3 py-2 text-[10px] text-gray-600 border-t border-gray-800 leading-relaxed">
      行をタップすると上のチームを抜くのに必要な勝点を表示。勝点は勝ち2・引き分け1。
      勝点が同じときの順位の決め方は公式に記載が無いため、「抜く」は勝点で上回ることとして計算しています。
      {!final && "残り試合は公開済みの日程から数えています（延期・プレイオフは除く）。"}
    </p>
  );
}
