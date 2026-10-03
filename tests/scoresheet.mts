// スコア表の入力チェックと集計（src/lib/scoreSheet.ts）。実行: npx tsx tests/scoresheet.mts
// フィクスチャは 2026/9/6 Bronze #257 WSJ 6-10 サイコペッカーズ の実物のスコア表から起こしたもの。
import { readFileSync } from "node:fs";
import { aggregate, analyzeGame, checkSheet, parseClock, sheetId, type ScoreSheet } from "../src/lib/scoreSheet";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}
const near = (a: number | null | undefined, b: number) => a !== null && a !== undefined && Math.abs(a - b) < 1e-9;

const sheet: ScoreSheet = JSON.parse(readFileSync(new URL("./fixtures/scoresheet-257.json", import.meta.url), "utf8"));

assert(parseClock("1:29") === 89 && parseClock("19：58") === 1198 && parseClock("12:75") === null && parseClock("x") === null, "時間の読み取り");
assert(sheetId(sheet) === "2026-9-6_257", `保存キー (=${sheetId(sheet)})`);

const check = checkSheet(sheet);
assert(check.errors.length === 0 && check.warnings.length === 0, `実物のスコア表は食い違いなし (${[...check.errors, ...check.warnings].join(" / ")})`);

const broken: ScoreSheet = structuredClone(sheet);
broken.home.total = 11;
broken.goals[0].time = "129";
broken.visitor.sogTotal = 16;
const bad = checkSheet(broken);
assert(bad.errors.some((e) => e.includes("Total 11")), "ハーフ合計と Total の食い違いはエラー");
assert(bad.errors.some((e) => e.includes("12:34 の形")), "時間の形式はエラー");
assert(bad.warnings.some((w) => w.includes("SOG")), "SOG 合計の食い違いは警告");

const a = analyzeGame(sheet);
assert(a.home.result === "W" && a.visitor.result === "L", "サイコペッカーズの勝ち");
assert(a.home.goalie.name === "クワヤマ" && a.home.goalie.shotsFaced === 15 && a.home.goalie.saves === 9 && near(a.home.goalie.savePct, 0.6), "クワヤマ 15本中9セーブ（60%）");
assert(a.visitor.goalie.shotsFaced === 23 && a.visitor.goalie.saves === 13, "フルカワ 23本中13セーブ");
assert(near(a.home.shootingPct, 10 / 23) && near(a.visitor.shootingPct, 6 / 15), "決定率 10/23・6/15");
assert(a.home.powerPlayGoals === 1, "後半19:04 の得点は WSJ の反則中（17:40〜19:40）→ パワープレー");
assert(a.visitor.powerPlayGoals === 1, "後半9:09 の得点はサイコペッカーズの反則中（7:35〜9:35）→ パワープレー");
assert(a.home.shortHandedGoals === 1, "後半8:20 は自チームの反則中（7:35〜）→ ショートハンド得点（前半16:55 は反則がちょうど明けた時刻なので数えない）");

// 2分の反則は、相手がパワープレーで得点したらそこで明ける
const early: ScoreSheet = structuredClone(sheet);
early.goals.push({ side: "home", half: 2, time: "9:20", scorer: "80" }); // WSJ の 9:09 PPG の後
early.home.goals[1] += 1;
early.home.total += 1;
assert(analyzeGame(early).home.shortHandedGoals === 1, "相手の PPG（9:09）で反則が明けた後の 9:20 はショートハンドに数えない");
assert(a.visitor.scoredFirst && !a.home.scoredFirst, "WSJ が先制");
assert(a.home.comeback, "前半2-5 から逆転勝ち");
assert(a.home.penaltyMinutes === 4 && a.visitor.penaltyMinutes === 2, "反則時間");

const agg = aggregate([sheet, { ...sheet, gameNo: "258" }]);
const psy = agg.teams.find((t) => t.team === "サイコペッカーズ")!;
assert(psy.games === 2 && psy.wins === 2 && psy.goalsFor[1] === 16 && psy.comebacks === 2, "チーム集計（2試合・後半16点・逆転2回）");
const gk = agg.goalies.find((g) => g.name === "クワヤマ")!;
assert(gk.games === 2 && gk.shotsFaced === 30 && gk.saves === 18, "ゴーリー集計");
const combo = agg.combos.find((c) => c.team === "WSJ" && c.from.startsWith("#14") && c.to.startsWith("#9"))!;
assert(combo.count === 4 && combo.from === "#14 マツオカ" && combo.to === "#9 テシガワラ", `アシストの組み合わせ（#14→#9 が1試合2回×2）`);

// AI の出力（チームごとに scoring / penalties を持つ形）を ScoreSheet に整える
import { normalizeAiSheet } from "../src/lib/scoreSheetAi";
import { sanitizeSheet } from "../src/lib/scoreSheet";
const aiRaw = {
  date: "2026.9.6", time: "11:30", gameNo: "#257", division: "Bronze",
  ...Object.fromEntries((["visitor", "home"] as const).map((side) => [side, {
    ...sheet[side],
    total: String(sheet[side].total) as unknown as number, // 文字列で返ってきても数にする
    scoring: sheet.goals.filter((g) => g.side === side).map(({ side: _s, ...g }) => g),
    penalties: sheet.penalties.filter((p) => p.side === side).map(({ side: _s, ...p }) => p),
  }])),
};
const fromAi = normalizeAiSheet(aiRaw as Record<string, unknown>);
assert(fromAi.date === "2026/9/6" && fromAi.gameNo === "257", `日付・試合番号を整える (=${fromAi.date} #${fromAi.gameNo})`);
assert(fromAi.goals.length === 16 && fromAi.penalties.length === 3 && fromAi.goals[0].side === "visitor", "得点16件・反則3件をチーム別から1本に");
assert(fromAi.visitor.total === 0, "数でない Total は0（人が確認して直す）");

// 誰でも送れる保存APIの整形: 余計な値・長すぎる文字列・不正なディビジョンを落とす
const dirty = sanitizeSheet({ ...sheet, division: "Hacker", visitor: { ...sheet.visitor, name: "x".repeat(500) }, goals: [...sheet.goals, { side: "evil", half: 9, time: "1:00", scorer: "1" }], extra: "<script>" });
assert(dirty.division === "" && dirty.visitor.name.length === 40 && dirty.goals.length === 16 && !("extra" in dirty), "保存前の整形");

// 要確認のまま登録できるように: 日付・番号が無ければキーは null（API 側で一意なキーを作る）、集計は止まらない
assert(sheetId({ date: "", gameNo: "", division: "Bronze" }) === null, "日付が無ければ保存キーは null");
const partial: ScoreSheet = structuredClone(sheet);
partial.goals[4].time = ""; // 実物の読み取りで空欄だった前半 19:58
const pa = analyzeGame(partial);
assert(checkSheet(partial).errors.length === 1 && pa.visitor.goalsFor === 6 && pa.home.goalie.savePct !== null, "時間が空でも集計は出る");
import { emptySheet, isBlankSheet } from "../src/lib/scoreSheet";
assert(isBlankSheet(emptySheet()) && !isBlankSheet(partial), "空のスコア表だけは登録しない");

// コンテニューコード
import { CONTINUE_ALPHABET, normalizeContinueCode } from "../src/lib/scoreSheet";
assert(normalizeContinueCode("k7qm-3xra") === "K7QM-3XRA" && normalizeContinueCode(" K7QM 3XRA ") === "K7QM-3XRA", "小文字・空白でも同じコード");
assert(normalizeContinueCode("Ｋ７ＱＭ３ＸＲＡ") === "K7QM-3XRA", "全角でも同じコード");
assert(normalizeContinueCode("ABCD-EFG") === null && normalizeContinueCode("ABCD-EFG!") === null, "8文字でなければ null");
assert(!/[01OIL]/.test(CONTINUE_ALPHABET) && CONTINUE_ALPHABET.length === 31, `読み間違えやすい文字は使わない (${CONTINUE_ALPHABET.length}文字)`);
assert(normalizeContinueCode("ABCD-EFGO") === null, "O は 0 とみなすが、0 自体を使わないので無効");
