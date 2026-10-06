// events.rinnavi.com のイベントのきまり（src/lib/siteEvents.ts）。実行: npx tsx tests/site-events.mts
import { closed, dateLabel, googleCalendarUrl, safeUrl, sanitizeEvent, splitEvents, timeLabel, type SiteEvent } from "../src/lib/siteEvents";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

const ok = sanitizeEvent({ title: " 練習会 ", date: "2026-10-21", place: "会場", start: "19:30", end: "21:30", formUrl: "https://forms.gle/x", published: true });
assert(!!ok.event && ok.event.title === "練習会" && ok.event.sport === "inline" && ok.event.kind === "イベント", "最低限の項目で登録できる（競技はインライン・種類はイベントが初期値）");
assert(ok.event?.published === true, "公開フラグ");
assert(sanitizeEvent({ date: "2026-10-21", place: "x" }).error === "タイトルを入れてください。", "タイトル必須");
assert(!!sanitizeEvent({ title: "a", date: "2026-13-40", place: "x" }).error, "日付が正しくなければエラー");
assert(!!sanitizeEvent({ title: "a", date: "2026-10-21", place: "x", start: "25:00" }).error, "時刻が正しくなければエラー");
assert(!!sanitizeEvent({ title: "a", date: "2026-10-21", place: "x", formUrl: "javascript:alert(1)" }).error, "フォームは http(s) だけ");
assert(safeUrl("ftp://x") === undefined && safeUrl("https://a.b/c") === "https://a.b/c", "safeUrl");
assert(sanitizeEvent({ title: "a", date: "2026-10-21", place: "x", sport: "ice" }).event?.sport === "ice", "アイスホッケーも登録できる");
const base = ok.event!;
const edited = sanitizeEvent({ title: "b", date: "2026-10-21", place: "x" }, base).event!;
assert(edited.id === base.id && edited.createdAt === base.createdAt, "修正では id と作成日時を引き継ぐ");

const ev = (id: string, date: string, start?: string) => ({ ...base, id, date, start }) as SiteEvent;
const { upcoming, past } = splitEvents([ev("a", "2026-10-21", "19:00"), ev("b", "2026-10-07"), ev("c", "2026-10-21", "10:00"), ev("d", "2026-10-06")], "2026-10-07");
assert(upcoming.map((e) => e.id).join() === "b,c,a", "これからは近い順（今日を含む・同じ日は時刻順）");
assert(past.map((e) => e.id).join() === "d", "前日までは終わったイベント");
assert(dateLabel("2026-10-21") === "10/21（水）", "日付の表示");
assert(timeLabel({ start: "19:30", end: "21:30" }) === "19:30〜21:30" && timeLabel({}) === "", "時間の表示");
assert(closed({ ...base, deadline: "2026-10-06" }, "2026-10-07") && !closed({ ...base, deadline: "2026-10-07" }, "2026-10-07"), "締切日の終わりまでは受付中");
const cal = new URL(googleCalendarUrl(ev("a", "2026-10-21", "19:30"), "https://events.rinnavi.com/e/a"));
assert(cal.searchParams.get("dates") === "20261021T193000/20261021T213000", "カレンダーの日時（終了あり）");
assert(new URL(googleCalendarUrl({ ...base, start: undefined, end: undefined, date: "2026-10-31" }, "u")).searchParams.get("dates") === "20261031/20261101", "時間が無ければ終日（翌日まで）");
