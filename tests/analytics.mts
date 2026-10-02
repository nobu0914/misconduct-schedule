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
