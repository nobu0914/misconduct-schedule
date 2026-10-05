// リーグニュースの材料づくりと AI 出力の検証（src/lib/leagueNews.ts）。実行: npx tsx tests/league-news.mts
import { readFileSync } from "node:fs";
import { buildNewsDigest, jstDay, normalizeNews } from "../src/lib/leagueNews";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

// 2026/10/9（金）7:00 JST に作る想定
const now = new Date("2026-10-08T22:00:00Z");
assert(jstDay("2026/10/9") === Date.parse("2026-10-08T15:00:00Z"), "jstDay は JST の 0 時");

const g = (date: string, a: string, as: number, h: string, hs: number, season = "54th") =>
  ({ date, awayTeam: a, awayScore: as, homeTeam: h, homeScore: hs, divisionLabel: "Brass", played: true, season });
const sheet = JSON.parse(readFileSync(new URL("./fixtures/scoresheet-257.json", import.meta.url), "utf8"));
sheet.date = "2026/10/4";
const d = buildNewsDigest({
  now,
  season: "54th",
  scores: [
    g("2026/10/3", "サイコ", 5, "NASDAQ", 2),
    g("2026/10/4", "サイコ", 3, "Abouters", 1),
    g("2026/10/5", "Early Bird", 2, "サイコ", 4),
    g("2026/8/1", "古い試合", 9, "NASDAQ", 0, "53rd"),
  ],
  standings: [
    { rank: 1, team: "サイコ", divisionLabel: "Brass", points: 6, gp: 3, wins: 3, losses: 0, ties: 0, rankChange: 2 },
    { rank: 2, team: "Early Bird", divisionLabel: "Brass", points: 4, gp: 3, wins: 2, losses: 1, ties: 0 },
  ],
  players: [{ name: "山田太郎", team: "サイコ", divisionLabel: "Brass", goals: 5, assists: 2, points: 7 }],
  matches: [
    { date: "2026/10/11", timeStart: "12:00", awayTeam: "サイコ (A)", homeTeam: "Early Bird (B)", division: "Brass", season: "54th" },
    { date: "2026/10/11", awayTeam: "NASDAQ", homeTeam: "Abouters", division: "Brass", season: "54th" },
    { date: "2026/10/30", awayTeam: "遠い先", homeTeam: "NASDAQ", division: "Brass", season: "54th" },
  ],
  events: [{ date: "2026/10/2", title: "54th 開幕のお知らせ", url: "https://misconduct.co.jp/news/x/" }],
  sheets: [sheet],
});
const t = d.text;
assert(t.includes("10/5 Brass: Early Bird 2-4 サイコ") && !t.includes("古い試合"), "直近の公式結果だけ（8月の試合は入らない）");
assert(t.includes("サイコ: 3連勝中・開幕から3試合負けなし"), "連勝・負けなし");
assert(t.includes("1位 サイコ") && t.includes("2つ上げて1位"), "順位と順位を上げたチーム");
assert(t.includes("山田太郎（サイコ）5G 2A"), "個人ポイント上位");
assert(t.includes("10/4 Bronze") && t.includes("サイコペッカーズ"), "スコア表の試合");
assert(!t.includes(String(sheet.continueCode ?? "ZZZZZZZZ")), "コンテニューコードは材料に入れない");
assert(
  t.includes("サイコ vs Early Bird（前シーズン（53rd）プレイオフ決勝と同じ顔合わせ（優勝 サイコ・準優勝 Early Bird）・今シーズン1位と2位の対戦）"),
  "前シーズン決勝の再戦と上位対決（ベンチ表記は外す）"
);
assert(!t.includes("NASDAQ vs Abouters（"), "理由の無い試合は注目カードにしない");
assert(!t.includes("遠い先"), "9日より先の試合は入らない");
assert(t.includes("54th 開幕のお知らせ"), "公式のお知らせ");
const matchup = Object.values(d.links).find((l) => l.href.includes("mode=matchup"));
assert(!!matchup && matchup.href.includes("a=%E3%82%B5%E3%82%A4%E3%82%B3"), "注目カードのリンクは相性ページ");

// AI の出力の検証
const items = normalizeNews(
  {
    items: [
      { title: "サイコが開幕3連勝", body: "サイコが3連勝しました。", tag: "試合結果", link: "L1" },
      { title: "", body: "空の見出しは捨てる", tag: "選手" },
      { title: "タグ不明", body: "本文", tag: "ゴシップ", link: "L999" },
    ],
  },
  { L1: { label: "Brass のスコア", href: "/player-ranking?mode=score&div=Brass" } }
);
assert(items.length === 2, "見出し・本文の無いものは捨てる");
assert(items[0].link?.href === "/player-ranking?mode=score&div=Brass", "リンクは候補から引く");
assert(items[1].tag === "リーグ" && !items[1].link, "知らないタグは「リーグ」、候補に無いリンクは付けない");
assert(normalizeNews(null, {}).length === 0, "形式が違えば0件");

// 注目カード: 開幕直後（今シーズンの順位なし）は前シーズンの上位同士、王者の試合は重みが低い
const base = { now, season: "54th", scores: [], standings: [], players: [], events: [], sheets: [] };
const early = buildNewsDigest({
  ...base,
  prevStandings: [
    { rank: 1, team: "Team Apples", divisionLabel: "Brass" },
    { rank: 2, team: "サイコ", divisionLabel: "Brass" },
  ],
  matches: [
    { date: "2026/10/10", awayTeam: "NASDAQ", homeTeam: "サイコ (A)", division: "Brass", season: "54th" },
    { date: "2026/10/18", awayTeam: "TEAM APPLES", homeTeam: "サイコ", division: "Brass", season: "54th" },
  ],
}).text;
const order = [early.indexOf("TEAM APPLES vs サイコ"), early.indexOf("NASDAQ vs サイコ")];
assert(early.includes("前シーズンのレギュラーシーズン1位と2位"), "前シーズンの上位同士（表記ゆれも照合）");
assert(order[0] > 0 && order[1] > order[0], "重みの大きい注目カードが先（日付より優先）");
assert(early.includes("前シーズン王者 サイコ の試合"), "前シーズン王者の試合も候補（重みは低い）");
assert(early.includes("10/18"), "金曜に作ると次の週末（10日先）まで入る");
const none = buildNewsDigest({ ...base, matches: [{ date: "2026/10/10", awayTeam: "X", homeTeam: "Y", division: "Iron", season: "54th" }] }).text;
assert(none.includes("注目カード候補: なし"), "候補が無ければ「なし」（無理に書かせない）");
