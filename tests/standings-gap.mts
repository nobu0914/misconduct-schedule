// 順位表の「上を抜くには」（src/lib/standingsGap.ts）。実行: npx tsx tests/standings-gap.mts
import { headToHeadRemaining, scheduledGames, standingsGaps } from "../src/lib/standingsGap";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

const S = "54th";
const m = (away: string, home: string, extra: Record<string, string> = {}) =>
  ({ awayTeam: away, homeTeam: home, division: "Copper", status: "scheduled", season: S, ...extra });
const played = (away: string, home: string) =>
  ({ awayTeam: away, homeTeam: home, divisionLabel: "Copper", played: true, season: S });

// A,B,C の総当たり2回（各4試合）。A-B 1試合・A-C 1試合・B-C 1試合を消化済み
const matches = [
  m("A (A)", "B (B)"), m("B", "A"),
  m("A", "C"), m("C", "A"),
  m("B", "C"), m("C (D)", "B"),
  m("A", "B", { status: "postponed" }), // 延期は数えない
  m("A", "B", { round: "Final" }), // プレイオフは数えない
  m("A", "B", { season: "53rd" }), // 別シーズン
  m("A", "B", { division: "Brass" }), // 別ディビジョン
];
const scores = [played("A", "B"), played("A", "C"), played("B", "C")];

const total = scheduledGames(matches, S, "Copper");
assert(total.get("a") === 4 && total.get("b") === 4 && total.get("c") === 4, "日程の試合数（ベンチ表記・延期・プレイオフ・別シーズンを除く）");
assert(headToHeadRemaining(matches, scores, S, "Copper", "B", "A") === 1, "直接対決の残り = 日程2 − 消化1");

const standings = [
  { team: "A", divisionLabel: "Copper", rank: 1, points: 4, gp: 2 },
  { team: "B", divisionLabel: "Copper", rank: 2, points: 1, gp: 2 },
  { team: "C", divisionLabel: "Copper", rank: 3, points: 1, gp: 2 },
];
const gaps = standingsGaps(standings, { season: S, matches, scores });
const [a, b, c] = gaps;
assert(a.lead?.over === "B" && a.lead.gap === 3 && !a.lead.clinched, "1位: 2位と3差・まだ確定しない");
assert(b.remaining === 2 && b.maxPoints === 5, "B: 残り2試合・最大5");
const bUp = b.above[0];
assert(bUp.target === "A" && bUp.gap === 3 && bUp.toPass === 4 && bUp.winsToPass === 2, "B→A: 3差・抜くには勝点4＝2勝");
// B 全勝で5。A は残り2のうち直接対決1 → B が勝てば A の最大は 4+2=6 → 自力では届かない
assert(bUp.verdict === "help" && bUp.helpPoints === 2, `B→A: 他力・A が勝点2落とせば (=${bUp.verdict},${bUp.helpPoints})`);
const cUp = c.above[0];
assert(cUp.target === "B" && cUp.gap === 0 && cUp.toPass === 1 && cUp.winsToPass === 1, "C→B: 勝点で並んでいる・1点で抜く");
// C 全勝で5、B は残り2のうち直接対決1 → B の最大 1+2=3 → 自力
assert(cUp.verdict === "self", "C→B: 自力で抜ける");
assert(c.above.map((x) => x.target).join() === "B,A", "上のチームは近い順");

// 1位確定: 2位以下が全勝しても届かない
const done = standingsGaps(
  [
    { team: "A", divisionLabel: "Copper", rank: 1, points: 10, gp: 4 },
    { team: "B", divisionLabel: "Copper", rank: 2, points: 4, gp: 2 },
    { team: "C", divisionLabel: "Copper", rank: 3, points: 2, gp: 2 },
  ],
  { season: S, matches, scores }
);
assert(done[0].lead?.clinched === true, "1位確定（2位の最大8 < 10）");
assert(done[2].above[1].verdict === "impossible", "C→A: 全勝しても届かない");
const tie = standingsGaps(
  [
    { team: "A", divisionLabel: "Copper", rank: 1, points: 8, gp: 4 },
    { team: "B", divisionLabel: "Copper", rank: 2, points: 4, gp: 2 },
  ],
  { season: S, matches, scores }
);
assert(tie[1].above[0].verdict === "tieOnly" && tie[0].lead?.clinched === false, "全勝でやっと並ぶ・並べる間は1位確定にしない");

// 過去シーズン（最終）
const fin = standingsGaps(standings, { final: true });
assert(fin[1].above[0].verdict === "final" && fin[1].remaining === 0, "最終順位は final");
// 日程が無い → 残り試合不明（判定なし）
const unknown = standingsGaps(standings, { season: S, matches: [], scores: [] });
assert(unknown[1].remaining === undefined && unknown[1].above[0].verdict === undefined, "日程が無いと判定しない");
// 勝点が無い（52nd）は出さない
assert(standingsGaps([{ team: "A", divisionLabel: "Copper", rank: 1 }]).length === 0, "勝点の無い順位表は対象外");
