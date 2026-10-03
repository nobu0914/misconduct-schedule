// 個人ランクの得点率・ディビジョン平均・チーム勝率（src/lib/scoringRate.ts）。実行: npx tsx tests/scoring-rate.mts
import { divisionRates, playerRates, rateRank, teamRecord } from "../src/lib/scoringRate";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;

const players = [
  { team: "サイコ", divisionLabel: "Brass", gp: 10, goals: 15, points: 25 },
  { team: "サイコ", divisionLabel: "Brass", gp: 5, goals: 0, points: 1 },
  { team: "NASDAQ", divisionLabel: "Brass", gp: 0, goals: 0, points: 0 }, // 出場0試合は分母に入れない
  { team: "Change-zero", divisionLabel: "Copper", gp: 10, goals: 13, points: 18 },
];

const me = playerRates(players[0]);
assert(near(me?.goals, 1.5) && near(me?.points, 2.5), "本人: 15G ÷ 10試合 = 1.50、25P ÷ 10試合 = 2.50");
assert(playerRates(players[2]) === undefined, "出場0試合は率なし");

const brass = divisionRates(players, "Brass");
assert(near(brass?.goals, 15 / 15) && near(brass?.points, 26 / 15), "平均 = 全ゴール ÷ 出場試合の合計（15G / 15試合）");
assert(brass?.players === 2, "出場した選手だけ数える");
assert(divisionRates(players, "Gold") === undefined, "データの無いディビジョンは undefined");

const standings = [
  { team: "サイコ", divisionLabel: "Brass", rank: 2, totalTeams: 10, gp: 10, wins: 8, losses: 2, ties: 0 },
  { team: "Early Bird", divisionLabel: "Brass", rank: 4, gp: 10, wins: 5, losses: 3, ties: 2 },
  { team: "サイコ", divisionLabel: "Silver", rank: 1, gp: 10, wins: 10, losses: 0, ties: 0 },
  { team: "古いシーズン", divisionLabel: "Brass", rank: 9 }, // 勝敗なし
];
const psycho = teamRecord(standings, "サイコ", "Brass");
assert(near(psycho?.winRate, 0.8) && psycho?.rank === 2 && psycho.totalTeams === 10, "サイコ（Brass）80%・10チーム中2位");
assert(near(teamRecord(standings, "EarlyBird", "Brass")?.winRate, 0.6), "引き分けは0.5勝・表記ゆれも同じチーム");
assert(teamRecord(standings, "Early Bird", "Brass")?.totalTeams === 3, "totalTeams が無ければディビジョンの行数");
assert(teamRecord(standings, "古いシーズン", "Brass") === undefined, "勝敗が無ければ undefined");

// 得点率のディビジョン内順位（出場した選手の中で）
const r1 = rateRank(players, "Brass", "goals", 1.5);
assert(r1.rank === 1 && r1.of === 2, `1.50 は Brass 2人中1位 (=${r1.rank}/${r1.of})`);
assert(rateRank(players, "Brass", "points", 0.2).rank === 2, "0.20pt は2位");
const tie = [...players, { team: "X", divisionLabel: "Brass", gp: 2, goals: 3, points: 3 }];
assert(rateRank(tie, "Brass", "goals", 1.5).rank === 1 && rateRank(tie, "Brass", "goals", 0).rank === 3, "同じ値は同順位");
