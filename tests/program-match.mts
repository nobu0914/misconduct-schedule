// リンク予定とイベント・プログラムの突き合わせ（src/lib/programMatch.ts）。実行: npx tsx tests/program-match.mts
import { findMatchingProgram, programsFromEvents } from "../src/lib/programMatch";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}
const p = (dateTime: string, name: string) => ({ dateTime, name, description: "", sourceUrl: "https://example.com/" });
const programs = programsFromEvents([
  { programs: [p("10月1日(木) 9:00-11:00", "A"), p("10月11日(日) 9:00-11:00", "B"), p("10月17日(土) 09:00-11:00", "C")] },
  {},
]);
assert(programs.length === 3, "お知らせからプログラムを集める");
assert(findMatchingProgram({ date: "2026/10/11", timeStart: "9:00" }, programs)?.name === "B", "日付と開始時刻で一致");
assert(findMatchingProgram({ date: "2026/10/1", timeStart: "9:00" }, programs)?.name === "A", "10月1日 が 10月11日 に誤一致しない");
assert(findMatchingProgram({ date: "2026/10/17", timeStart: "09:00" }, programs)?.name === "C", "先頭の0は無視");
assert(findMatchingProgram({ date: "2026/10/11", timeStart: "10:00" }, programs) === undefined, "時刻が違えば一致しない");
