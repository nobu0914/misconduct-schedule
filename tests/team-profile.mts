// チーム総評（src/lib/teamProfile.ts）。実行: npx tsx tests/team-profile.mts
import { profileInput, teamHistory, teamProfile } from "../src/lib/teamProfile";
import type { SeasonData } from "../src/lib/seasonData";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

const g = (date: string, a: string, as: number, h: string, hs: number, div = "Brass", season = "54th") =>
  ({ date, awayTeam: a, awayScore: as, homeTeam: h, homeScore: hs, divisionLabel: div, season });
const data: Record<number, SeasonData> = {
  54: {
    standings: [
      { team: "サイコ", divisionLabel: "Brass", rank: 1, totalTeams: 3, gp: 3, wins: 3, losses: 0, ties: 0, points: 6 },
      { team: "Early Bird", divisionLabel: "Brass", rank: 2, totalTeams: 3, gp: 3, wins: 1, losses: 1, ties: 1, points: 3 },
      { team: "NASDAQ", divisionLabel: "Brass", rank: 3, totalTeams: 3, gp: 2, wins: 0, losses: 2, ties: 0, points: 0 },
    ],
    scores: [
      g("2026/10/3", "サイコ", 5, "NASDAQ", 1),
      g("2026/10/4", "Early Bird", 2, "サイコ", 3),
      g("2026/10/17", "サイコ (A)", 4, "Early Bird", 0),
      g("2026/10/18", "Early Bird", 2, "NASDAQ", 2),
      g("2026/10/18", "未消化", null as unknown as number, "サイコ", null as unknown as number),
    ],
    players: [
      { name: "山田", team: "サイコ", divisionLabel: "Brass", goals: 5, points: 7, pim: 0 },
      { name: "佐藤", team: "サイコ", divisionLabel: "Brass", goals: 2, points: 6, pim: 2 },
      { name: "鈴木", team: "Early Bird", divisionLabel: "Brass", goals: 3, points: 3, pim: 0 },
    ],
  },
  53: {
    standings: [{ team: "サイコ", divisionLabel: "Brass", rank: 2, totalTeams: 10, gp: 10, wins: 8, losses: 2, ties: 0, points: 16 }],
    scores: [],
    players: [],
  },
};

const p = teamProfile(data, 54, "Brass", "サイコ")!;
assert(p.stats.goalsFor === 12 && p.stats.goalsAgainst === 3 && p.stats.games === 3, "得失点はスコアから（ベンチ表記込み・未消化は除く）");
const m = Object.fromEntries(p.metrics.map((x) => [x.key, x]));
assert(m.gf.value === "4.0" && m.gf.rank === 1 && m.gf.of === 3, "平均得点 4.0 はディビジョン1位");
assert(m.ga.value === "1.0" && m.ga.rank === 1, "平均失点は少ない方が上位");
assert(m.diff.value === "+9" && m.win.value === "100%", "得失点差・勝率");
assert(p.recent.map((x) => x.result).join("") === "WWW" && p.recent[0].date === "2026/10/17", "直近の試合は新しい順");
assert(p.streak?.result === "W" && p.streak.count === 3, "3連勝中");
assert(p.topPlayers[0].name === "山田" && p.topPlayers[1].assists === 4, "得点源（アシスト = ポイント − ゴール）");
assert(p.playoff === undefined, "今シーズンはプレイオフ結果なし");
const h = teamHistory(data, "サイコ");
assert(h.map((x) => x.season).join() === "54,53" && h[1].rank === 2 && h[1].playoff === "champion", "これまでのシーズン（53rd Brass 優勝）");
const eb = teamProfile(data, 54, "Brass", "Early Bird")!;
assert(eb.metrics.find((x) => x.key === "win")!.rank === 2 && eb.streak === undefined, "同じ結果が続いていなければ連続なし");
assert(teamProfile(data, 54, "Brass", "いないチーム") === undefined && teamProfile(data, 52, "Brass", "サイコ") === undefined, "成績が無ければ undefined");
const input = profileInput(p);
assert(input.includes("1試合の平均得点: 4.0（ディビジョン1位 / 3チーム）") && input.includes("53rd Brass 2位 8勝2敗0分 優勝"), "AI の材料");

// くわしいデータ
assert(p.axes.length === 7 && p.axes.find((a) => a.key === "attack")!.value === 100 && p.axes.find((a) => a.key === "attack")!.rank === 1, "レーダー: 平均得点はディビジョン最高=100・1位");
assert(p.close.w === 1 && p.blowout.w === 2, "接戦（1点差）1勝・大差（3点差以上）2勝");
assert(p.vsUpper.w === 2 && p.vsLower.w === 1, "上位（上半分=1〜2位）の Early Bird に2勝・下位の NASDAQ に1勝");
assert(p.shutoutWins === 1 && p.scoreless === 0, "完封勝ち1");
assert(p.biggestWin!.for - p.biggestWin!.against === 4 && p.mostGoals?.for === 5, "最大得点差の勝利は4点差・最多得点 5");
const vsEb = p.opponents.find((o) => o.opponent === "Early Bird")!;
assert(vsEb.w === 2 && vsEb.gf === 7 && vsEb.ga === 2 && vsEb.rank === 2, "対戦相手別（ベンチ表記は外して1行に）");
assert(p.players.length === 2 && Math.abs(p.topScorerShare! - 5 / 7) < 1e-9 && p.assistsPerGoal === 6 / 7, "選手のポイント・得点王の割合・アシスト率");
assert(p.pim?.total === 2 && p.pim.rank === 2, "反則（少ない順）");
assert(profileInput(p).includes("勝てなかった試合") === false && profileInput(eb).includes("勝てなかった試合: vs サイコ 2-3"), "AI の材料に勝てなかった試合");
