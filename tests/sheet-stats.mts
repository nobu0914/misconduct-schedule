// アップロードされたスコア表のチーム別集計（src/lib/sheetStats.ts）。実行: npx tsx tests/sheet-stats.mts
import { readFileSync } from "node:fs";
import { rowsByTeam, rowsOfSheets, seasonOfDate, summarize } from "../src/lib/sheetStats";
import type { ScoreSheet } from "../src/lib/scoreSheet";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

const base: ScoreSheet = JSON.parse(readFileSync(new URL("./fixtures/scoresheet-257.json", import.meta.url), "utf8"));
assert(seasonOfDate("2026/9/6") === 53 && seasonOfDate("2026/10/4") === 54 && seasonOfDate("2027/3/1") === 54, "シーズンは10月開幕");

// 同じ試合が2枚（あとで修正した方を使う）＋別の試合
const old = { ...base, savedAt: "2026-09-07T00:00:00Z", visitor: { ...base.visitor, name: "古い読み" } };
const fixed = { ...base, savedAt: "2026-09-07T00:00:00Z", editedAt: "2026-09-08T00:00:00Z" };
const other = { ...base, gameNo: "300", date: "2026/10/4", savedAt: "2026-10-04T00:00:00Z" };
const rows = rowsOfSheets([old, fixed, other]);
assert(rows.length === 4 && !rows.some((r) => r.team === "古い読み"), "同じ試合は最新の1枚だけ（2試合×2チーム）");

const v = base.visitor.name;
const mine = rowsByTeam(rows, base.division).get(rows.find((r) => r.team === v)!.team.toLowerCase().replace(/\s/g, "")) ?? [...rowsByTeam(rows, base.division).values()][0];
const s = summarize(mine)!;
assert(s.games === 2 && mine[0].date === "2026/10/4", "チームの行は新しい順");
const r0 = mine[0];
assert(r0.forByHalf[0] + r0.forByHalf[1] + r0.forByHalf[2] === r0.goalsFor, "前半＋後半＋OT＝得点");
assert(s.secondHalfAgainstShare === (s.goalsAgainst ? s.againstByHalf[1] / s.goalsAgainst : null), "後半失点率＝後半失点÷失点");
assert(s.bandsFor.reduce((a, b) => a + b, 0) <= s.goalsFor, "5分ごとの得点の合計は得点以下（OT・時刻なしは数えない）");
assert(s.scoredFirst.games + s.concededFirst.games === s.games, "先制・先に取られた で全試合");
assert(rowsByTeam(rows, base.division, 53).size === 2 && [...rowsByTeam(rows, base.division, 53).values()][0].length === 1, "シーズンで絞れる");
assert(rowsOfSheets([{ ...base, date: "" }]).length === 0, "日付の無いスコア表は数えない");
