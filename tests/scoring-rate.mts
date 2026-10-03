// 個人ランクの詳細スタッツ（src/lib/scoringRate.ts）。実行: npx tsx tests/scoring-rate.mts
import { multiDivisionTotal, playerProfile, teamRecord } from "../src/lib/scoringRate";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;

const pl = (name: string, team: string, divisionLabel: string, gp: number, goals: number, assists: number, pim = 0) =>
  ({ name, team, divisionLabel, gp, goals, assists, points: goals + assists, pim });

const players = [
  pl("八藤信幸", "サイコ", "Brass", 10, 15, 10, 0),
  pl("森悠", "サイコ", "Brass", 10, 5, 17, 4),
  pl("控え", "サイコ", "Brass", 5, 0, 1, 2),
  pl("出場なし", "NASDAQ", "Brass", 0, 0, 0),
  pl("八藤 信幸", "Change-zero", "Copper", 10, 13, 5, 2), // 表記ゆれ・別ディビジョン
];
const standings = [
  { team: "サイコ", divisionLabel: "Brass", rank: 2, totalTeams: 10, gp: 10, wins: 8, losses: 2, ties: 0 },
  { team: "Early Bird", divisionLabel: "Brass", rank: 4, gp: 10, wins: 5, losses: 3, ties: 2 },
];
const games = [
  { awayTeam: "サイコ", homeTeam: "NASDAQ", awayScore: 30, homeScore: 2, divisionLabel: "Brass" },
  { awayTeam: "Team Apples", homeTeam: "ｻｲｺ", awayScore: 1, homeScore: 20, divisionLabel: "Brass" }, // 表記ゆれ
  { awayTeam: "サイコ", homeTeam: "NASDAQ", awayScore: null, homeScore: null, divisionLabel: "Brass" }, // 未消化
];

const p = playerProfile({ players, standings, games }, "八藤信幸", "Brass")!;
assert(near(p.goals.value, 1.5) && near(p.points.value, 2.5) && near(p.assists.value, 1.0), "1試合あたり G1.50 / P2.50 / A1.00");
assert(p.goals.rank === 1 && p.goals.of === 3, `ゴール率は出場3人中1位 (=${p.goals.rank}/${p.goals.of})`);
assert(near(p.goals.avg, 20 / 25) && near(p.points.avg, 48 / 25), "平均 = 合計 ÷ 出場試合の合計（出場0試合は除く）");
assert(p.pim.rank === 1, "反則は少ないほど上位（0分で1位）");
assert(near(p.pointsVsAvg, 2.5 / (48 / 25)), "ポイント率は平均の何倍か");
assert(p.topPercent === 34 && p.deviation > 50, `上位%・偏差値 (=${p.topPercent}%, ${p.deviation.toFixed(1)})`);
assert(p.teamGoals?.total === 50 && p.teamGoals.from === "scores", "チーム総得点はスコア表から（表記ゆれ込み・未消化除く）");
assert(near(p.involvement, 25 / 50) && near(p.goalShare, 15 / 50), "関与率 50%・ゴールシェア 30%");
assert(p.teamGames === 10 && near(p.attendance, 1), "出場率 = GP ÷ チームの試合数（順位表）");
assert(p.style === "ゴール型", "G15:A10 はゴール型");
assert(near(p.teamRecord?.winRate, 0.8), "チーム勝率 80%");

const noScores = playerProfile({ players }, "森悠", "Brass")!;
assert(noScores.teamGoals?.total === 20 && noScores.teamGoals.from === "players", "スコア表が無ければ所属選手のゴール合計");
assert(noScores.teamGames === 10 && noScores.style === "アシスト型" && noScores.teamRecord === undefined, "順位表が無くても試合数は選手の最大GP");
assert(playerProfile({ players }, "出場なし", "Brass") === undefined, "出場0試合はなし");
assert(playerProfile({ players }, "八藤信幸", "Gold") === undefined, "そのディビジョンにいなければなし");

const total = multiDivisionTotal(players, "八藤信幸")!;
assert(total.divisions.length === 2 && total.points === 43 && total.gp === 20, "掛け持ちは全ディビジョン合計（表記ゆれ込み）");
assert(multiDivisionTotal(players, "森悠") === undefined, "1ディビジョンだけなら合計は出さない");

assert(near(teamRecord(standings, "EarlyBird", "Brass")?.winRate, 0.6), "引き分けは0.5勝・表記ゆれも同じチーム");
assert(teamRecord(standings, "Early Bird", "Brass")?.totalTeams === 2, "totalTeams が無ければディビジョンの行数");
