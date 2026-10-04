// アクセス解析の入力検証・区分（src/lib/analyticsConstants.ts）。実行: npx tsx tests/analytics.mts
import {
  isBrowser,
  isDevice,
  isEventType,
  isVisitorId,
  jstHour,
  normalizeReferrer,
  normalizeTrackedPath,
  visitBucket,
} from "../src/lib/analyticsConstants";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

// 訪問者ID は KV のキーになるので形式を限定する
assert(isVisitorId("3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b"), "UUID は通す");
assert(isVisitorId("lq3k2m-a1b2c3d4e5"), "フォールバックのID（時刻+乱数）も通す");
assert(!isVisitorId("short") && !isVisitorId("a:b:c:d:e:f:g") && !isVisitorId(123), "短い・記号入り・数値は通さない");

// 流入元はハッシュのフィールドになるのでホスト名だけ
assert(normalizeReferrer("www.google.com") === "google.com", "www. を外す");
assert(normalizeReferrer("LINE.ME") === "line.me", "小文字にする");
assert(normalizeReferrer("direct") === "direct", "direct はそのまま");
assert(normalizeReferrer("evil.com/../x") === null && normalizeReferrer({}) === null, "ホスト名以外は捨てる");

// 端末・ブラウザ・イベントは決まった値だけ
assert(isDevice("iPhone") && isDevice("Androidタブレット") && !isDevice("Nintendo"), "端末の値");
assert(isBrowser("LINE") && !isBrowser("Netscape"), "ブラウザの値");
assert(isEventType("click") && isEventType("card") && !isEventType("purchase"), "イベントに click を追加");

// 来訪日数の区分（区分が変わるときだけ人数を移す）
assert(visitBucket(1) === "1日" && visitBucket(2) === "2〜3日" && visitBucket(3) === "2〜3日", "1日 / 2〜3日");
assert(visitBucket(4) === "4〜9日" && visitBucket(9) === "4〜9日" && visitBucket(10) === "10日以上", "4〜9日 / 10日以上");
const moves = [1, 2, 3, 4, 5, 10, 11].filter((d) => d === 1 || visitBucket(d) !== visitBucket(d - 1));
assert(moves.join(",") === "1,2,4,10", `区分が変わる日 (=${moves})`);

// 時間帯は日本時間
assert(jstHour(new Date(Date.UTC(2026, 9, 2, 15, 30))) === 0, "UTC 15:30 は JST 0時台");
assert(jstHour(new Date(Date.UTC(2026, 9, 2, 3, 0))) === 12, "UTC 3:00 は JST 12時台");

// 既存: ページのパス検証
assert(normalizeTrackedPath("/rental?practice=1") === "/rental", "クエリを外す");
assert(normalizeTrackedPath("/../../etc") === null, "不正なパスは捨てる");

// 機能の利用ログ（feature）: 値は「ページ > 機能 > 詳細」。ページ名はパスから
import { pageLabelOf } from "../src/lib/analyticsConstants";
assert(isEventType("feature"), "イベントに feature を追加");
assert(pageLabelOf("/") === "ゲーム情報" && pageLabelOf("/player-ranking") === "データ" && pageLabelOf("/rental") === "リンク予定", "ページ名");
assert(pageLabelOf("/events") === "イベント" && pageLabelOf("/foo") === "/foo", "知らないページはパスのまま");

// 行動ログ: クエリは共有リンクの中身として残す（長さは制限）
import { normalizeQuery } from "../src/lib/analyticsConstants";
import { groupVisits } from "../src/components/ActivityLog";
assert(normalizeQuery("?mode=matchup&a=X") === "?mode=matchup&a=X", "クエリはそのまま残す");
assert(normalizeQuery("") === "" && normalizeQuery("?") === "" && normalizeQuery("mode=x") === "" && normalizeQuery(1) === "", "空・? 無し・文字列以外は捨てる");
assert(normalizeQuery("?" + "a".repeat(500)).length === 200, "200文字で切る");

// 新しい順のログを端末・訪問ごとにまとめる（30分以上空いたら別の訪問）
const e = (at: string, vid: string, v: string) => ({ at: `2026-10-04T${at}:00.000Z`, vid, t: "f" as const, v });
const visits = groupVisits([
  e("12:00", "visitorB1", "b2"),
  e("11:10", "visitorA1", "a3"),
  e("10:20", "visitorA1", "a2"),
  e("10:00", "visitorA1", "a1"),
]);
assert(visits.length === 3, `訪問は3回（A は 10:20→11:10 で50分空いたので2回）(=${visits.length})`);
assert(visits[0].vid === "visitorB1" && visits[1].items.map((x) => x.v).join() === "a3", "新しい訪問から並ぶ");
assert(visits[2].items.map((x) => x.v).join() === "a1,a2", "訪問の中は古い順");
