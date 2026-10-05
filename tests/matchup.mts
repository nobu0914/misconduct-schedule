// チーム相性（src/lib/matchup.ts）の集計。実行: npx tsx tests/matchup.mts
import { buildDivisionStats, countAdvantages, headToHead, radarAxes, type ScoreRow } from "../src/lib/matchup";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

const game = (date: string, away: string, as: number | null, home: string, hs: number | null, div = "Brass", season = "53rd"): ScoreRow =>
  ({ date, awayTeam: away, awayScore: as, homeTeam: home, homeScore: hs, divisionLabel: div, season });

const standings = [
  { team: "Team Apples", divisionLabel: "Brass", rank: 1, totalTeams: 3, gp: 2, wins: 2, losses: 0, ties: 0, points: 4 },
  { team: "サイコ", divisionLabel: "Brass", rank: 2, totalTeams: 3, gp: 2, wins: 1, losses: 1, ties: 0, points: 2 },
  { team: "NASDAQ", divisionLabel: "Brass", rank: 3, totalTeams: 3, gp: 2, wins: 0, losses: 2, ties: 0, points: 0 },
  { team: "別ディビジョン", divisionLabel: "Gold", rank: 1, gp: 1, wins: 1, losses: 0, ties: 0, points: 2 },
];
const scores = [
  game("2026/4/5", "Team Apples", 3, "サイコ", 1),
  game("2026/4/12", "ＮＡＳＤＡＱ", 0, "Team Apples", 5), // 全角表記でも同じチーム
  game("2026/4/19", "サイコ", 4, "NASDAQ", 2),
  game("2026/5/3", "サイコ", null, "Team Apples", null), // 未消化は数えない
  game("2025/11/2", "サイコ", 2, "Team Apples", 2, "Silver", "52nd"), // 別シーズン・別ディビジョン
];
const players = [
  { name: "A1", team: "Team Apples", divisionLabel: "Brass", goals: 5, points: 7, pim: 2 },
  { name: "A2", team: "Team Apples", divisionLabel: "Brass", goals: 3, points: 3, pim: 0 },
  { name: "S1", team: "サイコ", divisionLabel: "Brass", goals: 5, points: 6, pim: 6 },
  { name: "S2", team: "サイコ", divisionLabel: "Brass", goals: 0, points: 1, pim: 0 },
];

const stats = buildDivisionStats("Brass", standings, scores, players);
assert(stats.map((t) => t.team).join(",") === "Team Apples,サイコ,NASDAQ", `順位順・他ディビジョンを含まない (=${stats.map((t) => t.team)})`);
const apples = stats[0];
const psycho = stats[1];
const nasdaq = stats[2];
assert(apples.games === 2 && apples.goalsFor === 8 && apples.goalsAgainst === 1, `Team Apples 得点8・失点1・2試合（表記ゆれ込み）`);
assert(psycho.goalsFor === 5 && psycho.goalsAgainst === 5, "サイコ 得点5・失点5（未消化・別ディビジョンは除く）");
assert(apples.scorers === 2 && psycho.scorers === 1, "得点者数（0ゴールの選手は数えない）");
assert(apples.ace?.name === "A1" && apples.ace.points === 7, "エース = チーム最多ポイント");
assert(apples.pim === 2 && psycho.pim === 6, "PIM はチーム合計");

// 順位表に勝敗が無いシーズン（52nd の一部）はスコアから数える
const noRecord = buildDivisionStats("Brass", standings.map(({ team, divisionLabel, rank }) => ({ team, divisionLabel, rank })), scores, []);
assert(noRecord[0].wins === 2 && noRecord[0].points === 4 && noRecord[0].gp === 2, "勝敗が無ければスコアから集計");

const h2h = headToHead(scores, "サイコ", "Team Apples");
assert(h2h.games.length === 2, `直接対決はシーズン・ディビジョンをまたいで数える (=${h2h.games.length})`);
assert(h2h.aWins === 0 && h2h.bWins === 1 && h2h.ties === 1, "サイコ視点で 0勝1敗1分");
assert(h2h.games[0].date === "2026/4/5", "新しい順");

const axes = radarAxes(stats, apples, psycho, headToHead(scores, "Team Apples", "サイコ"));
assert(axes.length === 8, "八角形 = 8軸");
const ax = Object.fromEntries(axes.map((x) => [x.key, x]));
assert(ax.winRate.a === 100 && ax.winRate.rawA === "100%", "勝率トップは100");
assert(ax.defense.a === 100 && ax.defense.b < ax.defense.a, "DF力は失点が少ないほど高い");
assert(ax.discipline.a > ax.discipline.b, "規律は PIM が少ないほど高い");
assert(ax.h2h.a > ax.h2h.b && ax.h2h.rawA === "1勝0敗1分", `直接対決 (=${ax.h2h.rawA})`);
assert(axes.every((x) => x.a >= 0 && x.a <= 100 && x.b >= 0 && x.b <= 100), "全軸 0〜100");

// データが無い軸は 0・表示は「—」（NASDAQ は個人成績なし）
const vsNasdaq = radarAxes(stats, apples, nasdaq, headToHead(scores, "Team Apples", "NASDAQ"));
const depth = vsNasdaq.find((x) => x.key === "depth")!;
assert(depth.b === 0 && depth.rawB === "—", "データなしは 0 / —");

// 対戦がなければ直接対決は互角
const none = radarAxes(stats, psycho, nasdaq, headToHead([], "サイコ", "NASDAQ"));
const h = none.find((x) => x.key === "h2h")!;
assert(h.a === h.b && h.rawA === "対戦なし", "対戦なしは互角");

const adv = countAdvantages(axes);
assert(adv.a + adv.b + adv.even === 8 && adv.a > adv.b, `優勢な軸の数 (Apples ${adv.a} / サイコ ${adv.b} / 互角 ${adv.even})`);

// 「数値の根拠」シート: 実際の数字を入れた計算式・ディビジョン内の順位・元データ
const d = Object.fromEntries(axes.map((x) => [x.key, x.detail]));
assert(d.attack.calcA === "8得点 ÷ 2試合 ＝ 4.0", `FW力の計算 (=${d.attack.calcA})`);
assert(d.attack.rankA === 1 && d.attack.ranked === 3, "FW力はディビジョン3チーム中1位");
assert(d.defense.rankA === 1 && d.defense.best?.team === "Team Apples", "DF力は失点が少ないほど上位");
assert(d.winRate.calcB === "（1勝 ＋ 0分×0.5）÷ 2試合 ＝ 50%", `勝率の計算 (=${d.winRate.calcB})`);
assert(d.ace.calcA === "A1：5ゴール ＋ 2アシスト ＝ 7pt", `エース力の内訳 (=${d.ace.calcA})`);
assert(d.depth.calcA === "1ゴール以上の選手 2人（個人成績に載っている 2人中）", "得点の層の内訳");
assert(d.discipline.calcB === "PIM合計 6分 ÷ 2試合 ＝ 3.0分", `規律の計算 (=${d.discipline.calcB})`);
assert(d.h2h.calcA.startsWith("1勝0敗1分 → 勝点 3（75%）"), `直接対決の勝点 (=${d.h2h.calcA})`);
assert(d.winRate.source.includes("公式順位表"), "勝敗の元データは順位表");
const dNo = Object.fromEntries(radarAxes(noRecord, noRecord[0], noRecord[1], headToHead([], "a", "b")).map((x) => [x.key, x.detail]));
assert(dNo.winRate.source.includes("スコア表から数えた"), "順位表に勝敗が無ければスコア表と明記");
assert(vsNasdaq.find((x) => x.key === "depth")!.detail.calcB === "個人成績のデータがありません", "データなしは理由を出す");

// 近い名前のチーム（リンクを開くときだけ使う）
import { closestTeam } from "../src/lib/teamName";
const opts = [{ team: "名無しBoyzⅡ" }, { team: "名無しBoyz Starz" }, { team: "サイコペッカーズ" }, { team: "日体大DREAMS WB" }, { team: "日体大DREAMS WG" }];
assert(closestTeam(opts, "名無レBoyz II")?.team === "名無しBoyzⅡ", "読み間違い1文字（名無レ→名無し）は近い名前で開く");
assert(closestTeam(opts, "名無しBoyz Ⅱ")?.team === "名無しBoyzⅡ", "表記ゆれは完全一致");
assert(closestTeam(opts, "サイコ") === undefined, "大きく違う名前は選ばない");
assert(closestTeam(opts, "日体大DREAMS WG")?.team === "日体大DREAMS WG", "完全一致を優先（1文字違いの別チームと取り違えない）");
