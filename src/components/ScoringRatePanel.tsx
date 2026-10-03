"use client";

import { seasonOrdinal } from "@/lib/season";
import { normalizeName } from "@/lib/teamName";
import {
  divisionRates,
  playerRates,
  rateRank,
  teamRecord,
  type RatePlayer,
  type RateStanding,
} from "@/lib/scoringRate";

interface SeasonInput {
  season: number;
  /** そのシーズンの全選手（未取得・データなしなら undefined） */
  players?: (RatePlayer & { name: string })[];
  standings?: RateStanding[];
}

interface Props {
  name: string;
  division: string;
  /** 表示中のシーズンと、その前のシーズン（昨シーズン基準） */
  seasons: SeasonInput[];
}

const fmt = (v: number | undefined) => (v === undefined ? "—" : v.toFixed(2));

/** 個人ランクのカードに出す「得点率（1試合あたり）」。シーズンごとに本人・ディビジョン内順位・ディビジョン平均・チーム勝率 */
export default function ScoringRatePanel({ name, division, seasons }: Props) {
  const key = normalizeName(name);
  const rows = seasons
    .filter((s) => s.players && s.players.length > 0)
    .map((s) => {
      const players = s.players!;
      const me = players.find((p) => p.divisionLabel === division && normalizeName(p.name) === key);
      const mine = me ? playerRates(me) : undefined;
      return {
        season: s.season,
        me,
        mine,
        goalRank: mine && rateRank(players, division, "goals", mine.goals),
        pointRank: mine && rateRank(players, division, "points", mine.points),
        avg: divisionRates(players, division),
        team: me && s.standings ? teamRecord(s.standings, me.team, division) : undefined,
      };
    })
    .filter((r) => r.avg);

  if (rows.length === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-2">
      <p className="text-gray-400 text-xs">得点率（1試合あたり）・{division}</p>
      <div className="w-full border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-800 text-gray-400">
              <th className="py-1 pl-2 text-left font-medium" />
              <th className="py-1 text-center font-medium">ゴール</th>
              <th className="py-1 text-center font-medium">ポイント</th>
              <th className="py-1 pr-2 text-center font-medium">チーム勝率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <RateRows key={r.season} row={r} latest={i === 0} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500">
        ÷ 出場試合数。順位は出場選手中、平均はディビジョン全体。勝率は所属チーム（個人の勝敗は公式に無いため）。
      </p>
    </div>
  );
}

function RateRows({
  row,
  latest,
}: {
  row: {
    season: number;
    me?: { team: string };
    mine?: { goals: number; points: number };
    goalRank?: { rank: number; of: number };
    pointRank?: { rank: number; of: number };
    avg?: { goals: number; points: number };
    team?: { winRate: number; wins: number; losses: number; ties: number; rank?: number; totalTeams?: number };
  };
  latest: boolean;
}) {
  const strong = latest ? "text-white" : "text-gray-300";
  const rank = (r?: { rank: number; of: number }) => (r ? `${r.rank}位/${r.of}人` : "");
  const above = (v?: number, avg?: number) =>
    v === undefined || avg === undefined ? strong : v > avg ? "text-green-400" : v < avg ? "text-orange-300" : strong;
  return (
    <>
      <tr className="border-t border-gray-700">
        <td className="py-1.5 pl-2 text-gray-400 whitespace-nowrap">
          {seasonOrdinal(row.season)}
          <span className="block text-[10px] text-gray-500">本人</span>
        </td>
        <td className="py-1.5 text-center">
          <span className={`font-semibold ${above(row.mine?.goals, row.avg?.goals)}`}>{fmt(row.mine?.goals)}</span>
          <span className="block text-[10px] text-gray-500">{rank(row.goalRank)}</span>
        </td>
        <td className="py-1.5 text-center">
          <span className={`font-semibold ${above(row.mine?.points, row.avg?.points)}`}>{fmt(row.mine?.points)}</span>
          <span className="block text-[10px] text-gray-500">{rank(row.pointRank)}</span>
        </td>
        <td className="py-1.5 pr-2 text-center">
          <span className={`font-semibold ${strong}`}>{row.team ? `${Math.round(row.team.winRate * 100)}%` : "—"}</span>
          <span className="block text-[10px] text-gray-500">
            {row.team ? `${row.team.wins}勝${row.team.losses}敗${row.team.ties}分` : row.me ? "" : "出場なし"}
          </span>
        </td>
      </tr>
      <tr>
        <td className="pb-1.5 pl-2 text-[10px] text-gray-500 whitespace-nowrap">平均</td>
        <td className="pb-1.5 text-center text-gray-400">{fmt(row.avg?.goals)}</td>
        <td className="pb-1.5 text-center text-gray-400">{fmt(row.avg?.points)}</td>
        <td className="pb-1.5 pr-2" />
      </tr>
    </>
  );
}
