import iconv from "iconv-lite";
import {
  buildScheduleSources, currentSeasonNumber, seasonOrdinal, monthLabel, fetchAllMatches,
  withArchivedSeasons, seasonFromLabel, type Match,
} from "../src/lib/schedule";
import { parseSeasonNumber } from "../src/lib/season";
import { mergeByDivision, toSeasonTeamEntries } from "../src/lib/seasonSnapshot";
import { normalizeName, findTeam } from "../src/lib/teamName";
import { fetchWaybackScores } from "../scripts/fetch-wayback-scores.mts";
import { fetchWaybackStandings } from "../scripts/fetch-wayback-standings.mts";
import { fillStandingsFromScores } from "../scripts/fill-standings-from-scores.mts";
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
${row("PO7", "18:30", "～", "19:30", "", "", "", "", "vs", "", "", "", "", "Iron Final")}
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
  assert(s.matches.length === 6, `10月2件＋プレイオフ4件をパース (=${s.matches.length})`);
  const po = s.matches.filter((m) => m.sourceUrl.endsWith("playoff.htm"));
  assert(po.length === 4, `プレイオフを4件取得 (=${po.length})`);
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
  // 勝ち上がり待ちの回戦は、チーム名が無くても順位表記で取り込む（決勝が一覧から消えないように）
  const pendingRound = po.find((m) => m.no === "PO6");
  assert(pendingRound?.awayTeam === "Gold 1st" && pendingRound?.homeTeam === "Gold 2nd",
    `対戦相手未定でも順位表記で出す (=${pendingRound?.awayTeam} vs ${pendingRound?.homeTeam})`);
  assert(pendingRound?.division === "Gold" && pendingRound?.round === "Final", "未確定でも回戦名は付く");
  assert(!s.matches.some((m) => m.no === "PO7"), "名前も順位表記も無い枠だけの行は取り込まない");
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
  assert(s.matches.every((m) => m.season !== undefined && m.sourceUrl.includes(`/${m.season}_schedule_`)),
    `試合に取得元のシーズンが付く (${[...new Set(s.matches.map((m) => m.season))].join(",")})`);

  // --- シーズン表記 ---
  assert(parseSeasonNumber("53rd") === 53 && parseSeasonNumber("61st") === 61, "シーズン表記→番号");
  assert(parseSeasonNumber("") === undefined && parseSeasonNumber("march") === undefined, "シーズン表記でないものは undefined");
  assert(seasonFromLabel("53rd/playoff") === "53rd" && seasonFromLabel("54th/october") === "54th",
    "取得元ラベルからシーズンを取り出す");
  assert(seasonFromLabel("Bronze") === undefined, "シーズンの無いラベルは undefined");

  // --- チーム名・選手名の表記ゆれ ---
  {
    assert(normalizeName("青学 Quzilax") === normalizeName("青学Quzilax"), "空白の有無を吸収");
    assert(normalizeName("ＳＹＧＭＡ") === normalizeName("SYGMA"), "全角英字を吸収");
    assert(normalizeName("Dark Sales (B)") === normalizeName("Dark sales"), "ベンチ表記・大文字小文字を吸収");
    assert(normalizeName("たたかえ！！ホイジンガー") === normalizeName("たたかえ!!ホイジンガー"), "全角記号を吸収");
    assert(normalizeName("高山 智宏") === normalizeName("高山　智宏") && normalizeName("高山 智宏") === normalizeName("高山智宏"),
      "選手名の半角/全角スペースを吸収");
    assert(normalizeName("日体大DREAMS WB") !== normalizeName("日体大DREAMS WG"), "別チーム（WB/WG）は別のまま");
    assert(normalizeName("EUROSPORT MĀVIN") === normalizeName("EUROSPORT MAVIN"), "アクセント記号を吸収");
    assert(normalizeName("ダイナモ") === normalizeName("ﾀﾞｲﾅﾓ") && normalizeName("ダイナモ") !== normalizeName("タイナモ"),
      "濁点は残す（半角カナも揃う）");

    const list = [
      { team: "名無しBoyz", divisionLabel: "Brass" },
      { team: "Flying Penguins", divisionLabel: "Platinum" },
      { team: "Flying Penguins Silver", divisionLabel: "Silver" },
      { team: "SONIDO", divisionLabel: "Gold" },
      { team: "SONIDO", divisionLabel: "Silver" },
    ];
    assert(findTeam(list, "NANASHI Boyz (A)", "Brass")?.team === "名無しBoyz", "エイリアス＋ベンチ表記");
    assert(findTeam(list, "Flying Penguins", "Silver") === undefined, "部分一致はしない（別チームを拾わない）");
    assert(findTeam(list, "SONIDO", "Silver")?.divisionLabel === "Silver", "同名チームはディビジョンで区別");
    assert(findTeam(list, "ＳＯＮＩＤＯ", "Iron") === undefined, "ディビジョンが違えば出さない");
  }

  // --- 過去シーズンのスコアを Wayback Machine から取り直す ---
  {
    const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    const page = `<html><body><table>
      ${row(["", "2025/10/4 Sat", "", "", "", "", "", "", "", ""])}
      ${row(["1", "12:30", "～", "13:30", "かんだ食堂", "5", "-", "3", "Flying Penguins", ""])}
      ${row(["2", "13:30", "～", "14:30", "SONIDO", "", "-", "", "DROP HAMMER", ""])}
    </table></body></html>`;
    const sjis = iconv.encode(page, "shift_jis");
    const seen: string[] = [];
    const fakeFetch = async (url: string) => {
      seen.push(url);
      if (url.includes("/cdx/search/cdx")) {
        return new Response(JSON.stringify([
          ["timestamp", "original"],
          ["20250901000000", "https://misconduct.co.jp/wordpress/wp-content/uploads/52nd_score_platinum.htm"],
          ["20260401000000", "https://misconduct.co.jp/wordpress/wp-content/uploads/52nd_score_platinum.htm"],
          ["20260401000000", "https://misconduct.co.jp/wordpress/wp-content/uploads/52nd_score_mystery.htm"],
        ]));
      }
      if (url.includes("20260401000000id_/")) return new Response(sjis);
      return new Response("", { status: 404 });
    };
    const { games, report } = await fetchWaybackScores(52, fakeFetch);
    assert(seen.some((u) => u.includes("20260401000000id_/") && u.endsWith("52nd_score_platinum.htm")),
      "最新のスナップショットを生のバイト列（id_）で取る");
    assert(games.length === 2 && games[0].awayTeam === "かんだ食堂" && games[0].awayScore === 5 && games[0].played,
      `Shift-JIS のスコア表を読める (=${games.length}件)`);
    assert(games[1].played === false, "スコア空欄は未消化");
    assert(games.every((g) => g.season === "52nd" && g.divisionLabel === "Platinum"), "シーズン・ディビジョンが付く");
    assert(games[0].sourceUrl.startsWith("https://web.archive.org/web/20260401000000/"),
      "リンク先は消えた公式ページではなくアーカイブ");
    assert(report.some((r) => r.division === "mystery"), "対応するディビジョンが無いファイルは報告する");
  }

  // --- 過去シーズンの順位表（チーム＋個人）を Wayback Machine から取り直す ---
  {
    const page = `<html><body><table>
      <tr><td>Rank</td><td colspan="2">Team</td><td>GP</td><td>Pts</td><td>W</td><td>L</td><td>T</td></tr>
      <tr><td>1</td><td colspan="2">日体大DREAMS WB</td><td>6</td><td>10</td><td>5</td><td>1</td><td>0</td></tr>
      <tr><td>2</td><td colspan="2">Individuals WB</td><td>6</td><td>2</td><td>1</td><td>5</td><td>0</td></tr>
      <tr><td></td><td>Rank</td><td>Name</td><td>#</td><td>Team</td><td>GP</td><td>G</td><td>A</td><td>P</td><td>PIM</td></tr>
      <tr><td></td><td>1</td><td>山田花子</td><td>9</td><td>日体大DREAMS WB</td><td>6</td><td>7</td><td>3</td><td>10</td><td>0</td></tr>
    </table></body></html>`;
    const sjis = iconv.encode(page, "shift_jis");
    const fakeFetch = async (url: string) => {
      if (url.includes("/cdx/search/cdx")) {
        assert(decodeURIComponent(url).includes("52nd_standings_*"), "順位表のファイルを検索する");
        return new Response(JSON.stringify([
          ["timestamp", "original"],
          ["20260307153626", "https://misconduct.co.jp/wordpress/wp-content/uploads/52nd_standings_wb.htm"],
          ["20260307153626", "https://misconduct.co.jp/wordpress/wp-content/uploads/52nd_standings_mystery.htm"],
        ]));
      }
      if (url.includes("id_/") && url.endsWith("52nd_standings_wb.htm")) return new Response(sjis);
      return new Response("", { status: 404 });
    };
    const { teams, players, report } = await fetchWaybackStandings(52, fakeFetch);
    assert(teams.length === 2 && teams.every((t) => t.divisionLabel === "Women Bronze" && t.totalTeams === 2),
      `Women Bronze の順位を取れる (=${teams.length}チーム)`);
    assert(teams[0].team === "日体大DREAMS WB" && teams[0].rank === 1 && teams[0].wins === 5 && teams[0].points === 10,
      "順位・勝敗・勝点が入る");
    assert(players.length === 1 && players[0].name === "山田花子" && players[0].points === 10 && players[0].divisionLabel === "Women Bronze",
      "個人成績も同じページから取れる");
    assert(report.some((r) => r.division === "Platinum" && r.note?.includes("アーカイブ無し")), "無いディビジョンは報告する");
    assert(report.some((r) => r.division === "mystery"), "対応するディビジョンが無いファイルは報告する（順位表）");
  }

  // --- 保存ページが古いディビジョンはスコアから順位を集計し直す ---
  {
    const gm = (div: string, a: string, as: number, h: string, hs: number) => ({
      gameNo: 1, date: "2026/2/1", dayOfWeek: "Sun", timeStart: "12:30", timeEnd: "13:30",
      awayTeam: a, awayScore: as, homeTeam: h, homeScore: hs, divisionLabel: div, played: true, season: "52nd", sourceUrl: "",
    });
    const games = [
      gm("Iron", "A", 3, "B", 1), gm("Iron", "A", 2, "C", 2), gm("Iron", "C", 5, "B", 0),
      gm("Gold", "X", 1, "Y", 0),
    ];
    const standings = [
      // Iron: 保存ページは1試合分しか無い（古い）
      { team: "A", divisionLabel: "Iron", rank: 1, totalTeams: 2, gp: 1, wins: 1, losses: 0, ties: 0, points: 2 },
      { team: "B", divisionLabel: "Iron", rank: 2, totalTeams: 2, gp: 1, wins: 0, losses: 1, ties: 0, points: 0 },
      // Gold: 保存ページの方が試合数が多い（スコア表の保存が古い）
      { team: "Y", divisionLabel: "Gold", rank: 1, totalTeams: 2, gp: 2, wins: 1, losses: 1, ties: 0, points: 2 },
      { team: "X", divisionLabel: "Gold", rank: 2, totalTeams: 2, gp: 2, wins: 1, losses: 1, ties: 0, points: 2 },
    ];
    const { standings: out, report } = fillStandingsFromScores(standings, games);
    const iron = out.filter((s) => s.divisionLabel === "Iron");
    assert(iron.length === 3 && iron.every((s) => s.gp === 2) && iron[0].points === 3 && iron[1].points === 3 && iron[2].points === 0,
      "スコアの方が新しいディビジョンはスコアから集計（勝ち2・引き分け1）");
    assert(iron[0].team === "C" && iron[1].team === "A", "勝点が同じなら得失点差で並べる（C +5 > A +2）");
    assert(report.find((r) => r.division === "Iron")?.ties.some((t) => t.includes("A") && t.includes("C")) === true,
      "勝点が並んだら報告する");
    assert(out.filter((s) => s.divisionLabel === "Gold")[0].team === "Y", "保存ページの方が新しいディビジョンはそのまま");
  }

  // --- シーズン別の順位・個人成績の保存 ---
  {
    const saved = [
      { team: "A", divisionLabel: "Gold", rank: 1, totalTeams: 2 },
      { team: "B", divisionLabel: "Gold", rank: 2, totalTeams: 2 },
      { team: "C", divisionLabel: "Iron", rank: 1, totalTeams: 1 },
    ];
    const fresh = [{ team: "B", divisionLabel: "Gold", rank: 1, totalTeams: 2 }, { team: "A", divisionLabel: "Gold", rank: 2, totalTeams: 2 }];
    const merged = mergeByDivision(saved, fresh);
    assert(merged.length === 3 && merged.find((x) => x.team === "B")?.rank === 1,
      "取れたディビジョンは最新で差し替える");
    assert(merged.some((x) => x.divisionLabel === "Iron"), "今回取れなかったディビジョンは前回保存分を残す");

    const entries = toSeasonTeamEntries([
      { team: "A", divisionLabel: "Gold", rank: 1, gp: 3, wins: 3, losses: 0, ties: 0, points: 6 },
      { team: "B", divisionLabel: "Gold", rank: 2, gp: 3, wins: 0, losses: 3, ties: 0, points: 0 },
      { team: "C", divisionLabel: "Iron", rank: 1, gp: 2, wins: 1, losses: 0, ties: 1, points: 3 },
    ]);
    assert(entries[0].totalTeams === 2 && entries[2].totalTeams === 1, "ディビジョン内のチーム数を付ける");
  }

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
