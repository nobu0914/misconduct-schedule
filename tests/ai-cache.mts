// AI 総評の使い回し判定・対戦カードの総評・スコア表の修正用の鍵。実行: npx tsx tests/ai-cache.mts
import { isFresh } from "../src/lib/aiCache";
import { matchupKey, normalizeMatchupReview } from "../src/lib/matchupReviewAi";
import { hashToken, newEditToken, publicSheet, tokenMatches } from "../src/lib/scoreSheetOwner";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

// 2026/10/20（54th 開催中）
const now = new Date("2026-10-20T03:00:00Z");
assert(isFresh({ createdAt: "2026-10-05T03:00:00Z", format: 2 }, 54, 2, now), "今シーズン: 同じ月に作ったものは使い回す");
assert(!isFresh({ createdAt: "2026-09-30T14:00:00Z", format: 2 }, 54, 2, now), "今シーズン: JST 9/30 23:00 に作ったものは10月には作り直す");
assert(isFresh({ createdAt: "2026-09-30T16:00:00Z", format: 2 }, 54, 2, new Date("2026-10-31T14:00:00Z")), "JST で月を判定（UTC 9/30 16:00 = JST 10/1）");
assert(!isFresh({ createdAt: "2026-10-05T03:00:00Z", format: 2 }, 54, 2, new Date("2026-11-01T00:00:00Z")), "今シーズン: 月が変わったら作り直す");
assert(isFresh({ createdAt: "2026-10-05T03:00:00Z", format: 2 }, 53, 2, now), "終わったシーズン: 終わってから作ったものはずっと使う");
assert(!isFresh({ createdAt: "2026-09-20T03:00:00Z", format: 2 }, 53, 2, now), "終わったシーズン: シーズン中に作ったものは1回作り直す");
assert(!isFresh({ createdAt: "2026-10-05T03:00:00Z" }, 53, 2, now), "古い書き方（format なし）は作り直す");
assert(!isFresh(undefined, 54, 1, now), "保存なし");

assert(matchupKey(53, "Brass", "サイコ", "Team Apples") === matchupKey(53, "Brass", "TEAM APPLES", "サイコ (A)"), "対戦カードは順番・表記ゆれに関係なく同じ保存先");
const r = normalizeMatchupReview({ summary: "総評", points: ["見どころ"], aToB: ["Aが勝つには"], bToA: ["Bが勝つには", 3] }, "サイコ", "Team Apples")!;
assert(r.beat["サイコ"][0] === "Aが勝つには" && r.beat["teamapples"].length === 1, "勝つには は teamKey ごと（文字列以外は捨てる）");
assert(normalizeMatchupReview({ points: [] }, "a", "b") === undefined, "総評が無ければ捨てる");

const { token, hash } = newEditToken();
const sheet = { ownerHash: hash } as never;
assert(tokenMatches(sheet, token) && !tokenMatches(sheet, "x") && !tokenMatches(sheet, null), "修正用の鍵が合うときだけ");
assert(!tokenMatches({} as never, token), "鍵を入れる前の試合は鍵では修正できない（保存した端末が受け取る）");
assert(hashToken(token) === hash && !("ownerHash" in publicSheet({ ownerHash: hash, date: "x" } as never)), "画面には鍵のハッシュを返さない");
