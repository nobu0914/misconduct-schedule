import iconv from "iconv-lite";
import {
  buildScheduleSources, currentSeasonNumber, seasonOrdinal, monthLabel, fetchAllMatches,
  withArchivedSeasons, type Match,
} from "../src/lib/schedule";
import { withArchivedScoreSeasons } from "../src/lib/scores";
import { buildRentalSources, fetchAllRentalEntries } from "../src/lib/rental";

const NOW = new Date(2026, 8, 11); // 2026/9/11

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

// --- URL生成 ---
assert(seasonOrdinal(53) === "53rd" && seasonOrdinal(54) === "54th" && seasonOrdinal(61) === "61st",
  `序数: ${seasonOrdinal(53)}/${seasonOrdinal(54)}/${seasonOrdinal(61)}`);
assert(currentSeasonNumber(NOW) === 53, `2026/9 は 53rd (=${currentSeasonNumber(NOW)})`);
assert(currentSeasonNumber(new Date(Date.UTC(2026, 9, 3))) === 54, "2026/10/3（54th開幕日）は 54th");
assert(currentSeasonNumber(new Date(Date.UTC(2027, 0, 15))) === 54, "2027/1 は 54th（10月開幕シーズンの途中）");
assert(currentSeasonNumber(new Date(Date.UTC(2027, 4, 1))) === 54, "2027/5 はまだ 54th（次は10月開幕）");
assert(currentSeasonNumber(new Date(Date.UTC(2027, 9, 1))) === 55, "2027/10 は 55th");
// JST境界: UTCだと前月になる時刻でも JST の月で判定する
assert(currentSeasonNumber(new Date(Date.UTC(2026, 8, 30, 16, 0))) === 54,
  "9/30 16:00 UTC = 10/1 JST なので 54th");

const sched = buildScheduleSources(NOW).map((s) => s.url);
assert(sched.some((u) => u.endsWith("53rd_schedule_september.htm")), "9月(既存)を含む");
assert(sched.some((u) => u.endsWith("53rd_schedule_october.htm")), "10月(新規)を含む ← 旧実装で欠けていた分");
assert(sched.some((u) => u.endsWith("53rd_schedule_december.htm")), "12月を含む");
assert(sched.some((u) => u.endsWith("54th_schedule_october.htm")), "54th の10月（10/3開幕）を含む");
assert(sched.some((u) => u.endsWith("54th_schedule_march.htm")), "54th の3月（シーズン末）も含む");
assert(sched.some((u) => u.endsWith("53rd_schedule_playoff.htm")), "プレイオフ表を含む");
assert(sched.some((u) => u.endsWith("54th_schedule_playoff.htm")), "次シーズンのプレイオフ表も候補に含む");
console.log(`     → 候補URL ${sched.length}件`);

const rent = buildRentalSources(NOW).map((s) => s.url);
assert(rent.some((u) => u.endsWith("rent_202609.htm")), "rent 2026/09(既存)を含む");
assert(rent.some((u) => u.endsWith("rent_202610.htm")), "rent 2026/10(新規)を含む ← 旧実装で欠けていた分");
assert(rent.some((u) => u.endsWith("rent_202703.htm")), "rent 2027/03 まで先読み");
assert(rent.some((u) => u.endsWith("rent_202601.htm")), "rent 2026/01 まで遡る（現行と同等の履歴）");
console.log(`     → 候補URL ${rent.length}件`);

// 月ラベル（年またぎ）
assert(monthLabel("2026/10/3", NOW) === "10月", "当年は 10月");
assert(monthLabel("2027/1/9", NOW) === "2027年1月", "翌年は 2027年1月（重複回避）");

// --- パース（Shift-JISのダミーページ + モックfetch） ---
const SCHED_HTML = `<html><body><table>
<tr><td>2026/10/3</td><td>Sat</td></tr>
<tr><td>1</td><td>17:30</td><td>〜</td><td>18:30</td><td>スケーターズ</td><td>A</td><td>vs</td><td>B</td><td>バイソンズ</td><td>Platinum</td></tr>
<tr><td>2</td><td>18:45</td><td>〜</td><td>19:45</td><td>ペンギンズ</td><td>延期</td><td>vs</td><td></td><td>ホークス</td><td>Gold</td></tr>
</table></body></html>`;

const RENT_HTML = `<html><head><style>.xl65{background:yellow;}.xl70{background:blue;}</style></head><body><table>
<tr><td>7</td><td>水</td><td class="xl65" colspan="4">水曜練習会</td></tr>
<tr><td>10</td><td>土</td><td class="xl70" colspan="2">MHLプログラム</td></tr>
</table></body></html>`;

// 実サイト 53rd_schedule_playoff.htm の構造（論理14列）をそのまま再現
const row = (...c: string[]) => `<tr>${c.map((x) => `<td>${x}</td>`).join("")}</tr>`;
const PLAYOFF_HTML = `<html><body><table>
${row("#", "2026/9/19 Sat", "", "", "Visitor", "", "", "", "", "", "", "Home", "", "Division")}
${row("-", "9:00", "～", "11:00", "Saturday Pick Up Hockey", "", "", "", "", "", "", "", "", "-")}
${row("-", "11:00", "～", "11:30", "時間調整", "", "", "", "", "", "", "", "", "-")}
${row("PO1", "12:30", "～", "13:30", "Brass 5th", "team TOKO", "A", "", "vs", "", "B", "Early Bird", "Brass 4th", "Brass Quarter Finals")}
${row("PO2", "13:30", "～", "14:30", "35 &amp; Over 3rd", "STIGA 35", "C", "", "vs", "", "D", "Flying Penguins 35", "35 &amp; Over 2nd", "35 &amp; Over Semi Final")}
${row("PO5", "16:30", "～", "17:30", "Platinum 2nd", "TEAM I", "A", "", "vs", "", "B", "TEAM K", "Platinum 1st", "Platinum Final")}
${row("PO6", "17:30", "～", "18:30", "Gold 1st", "", "", "", "vs", "", "", "", "Gold 2nd", "Gold Final")}
${row("-", "17:30", "～", "18:30", "53期 レギュラーシーズン試合", "", "", "", "", "", "", "", "", "-")}
</table></body></html>`;

// 枠だけ公開された未記入ページ（日付行なし）
const PLACEHOLDER_HTML = `<html><body><table>
${row("MHL TOKYO 54th Season Schedule", "", "", "", "", "", "", "", "", "", "", "", "", "")}
${row("#", "Visitor", "", "", "", "", "", "", "", "", "", "Home", "", "Division")}
</table></body></html>`;

// 実物の 54th_schedule_march.htm 相当: 日程だけ決まっていて対戦カードが未定
const TBD_HTML = `<html><body><table>
${row("#", "2027/3/6 Sat", "", "", "Away", "", "", "", "Home", "Division")}
${row("", "", "", "", "MHL 54th Season Playoff", "", "", "", "", "")}
${row("#", "2027/3/7 Sun", "", "", "Away", "", "", "", "Home", "Division")}
${row("", "", "", "", "MHL 54th Season Playoff", "", "", "", "", "")}
</table></body></html>`;

// 日付はあるのに試合行が読めない（=構造変更を疑うべき）ページ
const BROKEN_HTML = `<html><body><table>
${row("#", "2026/11/7 Sat", "", "", "Visitor", "", "", "", "", "", "", "Home", "", "Division")}
${row("1", "17:30", "→", "18:30", "A team", "B team", "Gold")}
</table></body></html>`;

const calls: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = async (url: any) => {
  const u = String(url);
  calls.push(u);
  const body = u.endsWith("53rd_schedule_playoff.htm")
    ? PLAYOFF_HTML
    : u.includes("_schedule_") ? SCHED_HTML : RENT_HTML;
  // 10月・プレイオフのスケジュールと2026/10のレンタルだけ公開済み、他は404という状況を再現
  if (u.endsWith("53rd_schedule_december.htm")) {
    return new Response(iconv.encode(PLACEHOLDER_HTML, "shift_jis"), { status: 200 });
  }
  if (u.endsWith("54th_schedule_march.htm")) {
    return new Response(iconv.encode(TBD_HTML, "shift_jis"), { status: 200 });
  }
  if (u.endsWith("53rd_schedule_november.htm")) {
    return new Response(iconv.encode(BROKEN_HTML, "shift_jis"), { status: 200 });
  }
  const published = u.endsWith("53rd_schedule_october.htm")
    || u.endsWith("53rd_schedule_playoff.htm")
    || u.endsWith("rent_202610.htm");
  if (!published) return new Response(null, { status: 404 });
  return new Response(iconv.encode(body, "shift_jis"), { status: 200 });
};

async function main() {
  const s = await fetchAllMatches({ now: NOW });
  assert(s.matches.length === 5, `10月2件＋プレイオフ3件をパース (=${s.matches.length})`);
  const po = s.matches.filter((m) => m.sourceUrl.endsWith("playoff.htm"));
  assert(po.length === 3, `プレイオフを3件取得 (=${po.length})`);
  assert(po[0].no === "PO1" && po[0].awayTeam === "team TOKO (A)" && po[0].homeTeam === "Early Bird (B)",
    `PO1: ${po[0].no} ${po[0].awayTeam} vs ${po[0].homeTeam}`);
  assert(po[0].division === "Brass" && po[0].round === "Quarter Finals",
    `回戦名を分離: division=${po[0].division} round=${po[0].round}`);
  assert(po[1].division === "35&Over" && po[1].round === "Semi Final",
    `"35 & Over" を月別表と同じ "35&Over" に正規化 (=${po[1].division})`);
  assert(po[2].division === "Platinum" && po[2].round === "Final",
    `Platinum Final: division=${po[2].division} round=${po[2].round}`);
  assert(po.every((m) => m.month === "9月"), "プレイオフの月ラベルは9月");
  assert(!s.matches.some((m) => m.awayTeam.includes("Pick Up") || m.awayTeam.includes("時間調整")
    || m.awayTeam.includes("レギュラーシーズン試合")), "催し物・時間調整の行は取り込まない");
  assert(!s.matches.some((m) => m.no === "PO6"), "対戦カード未定（両チーム空欄）の行は取り込まない");
  assert(s.matches.filter((m) => !m.sourceUrl.endsWith("playoff.htm")).every((m) => m.round === undefined),
    "月別表の試合に round は付かない");

  const placeholder = s.sources.find((x) => x.url.endsWith("53rd_schedule_december.htm"))!;
  assert(placeholder.status === 200 && placeholder.count === 0 && !placeholder.error,
    `未記入ページ（日付行なし）は警告しない (error=${placeholder.error})`);
  const tbd = s.sources.find((x) => x.url.endsWith("54th_schedule_march.htm"))!;
  assert(tbd.status === 200 && tbd.count === 0 && !tbd.error,
    `日程のみ確定・対戦カード未定のページは警告しない (error=${tbd.error})`);
  const broken = s.sources.find((x) => x.url.endsWith("53rd_schedule_november.htm"))!;
  assert(broken.status === 200 && broken.count === 0 && Boolean(broken.error),
    `日付はあるのに試合0件なら警告する (error=${broken.error})`);

  assert(s.sources.filter((x) => x.status === 404).length === 25, `404はエラー扱いせずスキップ (=${s.sources.filter((x) => x.status === 404).length})`);
  assert(s.sources.every((x) => x.status === 200 || x.status === 404), "想定外ステータスなし");

  // --- 終わったシーズンを保存済みデータで表示し続ける ---
  {
    const archivedMatch = (date: string): Match => ({
      no: "PO1", date, timeStart: "12:30", timeEnd: "13:30",
      awayTeam: "team TOKO (A)", homeTeam: "Early Bird (B)",
      division: "Brass", round: "Quarter Finals", status: "scheduled",
      month: "9月", sourceUrl: "https://example.test/53rd_schedule_playoff.htm",
    });
    const live = [
      { items: [], source: { label: "54th/october", url: "u1", status: 404, count: 0 } },
      { items: [archivedMatch("2026/9/19")], source: { label: "53rd/playoff", url: "u2", status: 200, count: 1 } },
    ];
    const archived = [
      { label: "53rd/playoff", savedAt: "2026-09-13T08:00:00Z", items: [archivedMatch("2026/9/19")] },
      { label: "53rd/september", savedAt: "2026-09-13T08:00:00Z", items: [archivedMatch("2026/9/6")] },
    ];
    const merged = withArchivedSeasons(live, archived, new Date(Date.UTC(2027, 0, 15)));

    assert(merged.length === 3, `取得候補2件＋保存済み1件になる (=${merged.length})`);
    assert(!merged.some((r, i) => i !== 1 && r.source.label === "53rd/playoff" && !r.source.fromArchive),
      "取得できたラベルは保存済みで上書きしない");
    const restored = merged.find((r) => r.source.label === "53rd/september")!;
    assert(restored.source.fromArchive === "2026-09-13T08:00:00Z", "保存時刻が付く");
    assert(restored.items[0].month === "2026年9月",
      `月ラベルは表示時点の年で付け直す (=${restored.items[0].month})`);
    assert(merged.filter((r) => r.source.label === "53rd/playoff").length === 1,
      "取得済みのラベルは二重に足さない");
  }

  // --- スコアも同様 ---
  {
    const game = (gameNo: number) => ({
      gameNo, date: "2026/9/6", dayOfWeek: "Sun", timeStart: "12:30", timeEnd: "13:30",
      awayTeam: "A", awayScore: 3, homeTeam: "B", homeScore: 1,
      divisionLabel: "Bronze", played: true, season: "53rd",
      sourceUrl: "https://example.test/53rd_score_bronze.htm",
    });
    const merged = withArchivedScoreSeasons(
      [{ items: [], source: { label: "54th/Bronze", url: "u", status: 404, count: 0 } }],
      [{ label: "53rd/Bronze", savedAt: "2026-09-13T08:00:00Z", items: [game(1), game(2)] }]
    );
    assert(merged.length === 2 && merged[1].items.length === 2,
      `前シーズンのスコアが足される (=${merged.length}/${merged[1]?.items.length})`);
    assert(merged[1].source.fromArchive === "2026-09-13T08:00:00Z", "スコアにも保存時刻が付く");
  }

  const r = await fetchAllRentalEntries({ now: NOW });
  assert(r.entries.length === 2, `レンタル2件をパース (=${r.entries.length})`);
  assert(r.entries[0].date === "2026/10/7" && r.entries[0].timeStart === "7:00" && r.entries[0].timeEnd === "9:00",
    `1件目: ${r.entries[0].date} ${r.entries[0].timeStart}-${r.entries[0].timeEnd}`);
  assert(r.entries[0].isOfficial === false && r.entries[1].isOfficial === true, "黄=一般 / 青=MHL公式 の判定");
  assert(r.entries[1].month === "10月", `レンタルの月ラベル (=${r.entries[1].month})`);
  console.log(`\n合計 ${calls.length} 件のURLを探索（うち200: 2件）`);

}
main();
