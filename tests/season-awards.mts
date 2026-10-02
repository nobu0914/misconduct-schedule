// シーズンの最終結果（優勝・準優勝・個人賞）。実行: npx tsx tests/season-awards.mts
import { parseSeasonResultHtml } from "../scripts/fetch-season-results.mts";
import { divisionAwards, playoffResult } from "../src/lib/seasonAwards";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

// 公式の結果ページと同じ構造（h4 の見出し＋ <br> 区切りの段落、全角コロン・全角空白）
const html = `
<div class="post_content">
<h4 class="wp-block-heading">Brass Division</h4>
<p class="wp-block-paragraph">優勝　：　サイコ<br>準優勝　：　Early Bird<br>Top Gun Award　：　久保田一誠(Team Apples)<br>The Wall Award　：　池田浩輝(Team Apples)</p>
<h4 class="wp-block-heading">Women Bronze Division</h4>
<p class="wp-block-paragraph">優勝　：　<br>準優勝　：　<br>Top Gun Award　：　<br>The Wall Award　：　</p>
<h4 class="wp-block-heading">35 &amp; Over Division</h4>
<p class="wp-block-paragraph">優勝　：　武田園<br>準優勝　：　Flying Penguins 35<br>Top Gun Award　：　髙山智宏（Flying Penguins 35）<br>The Wall Award　：　山崎伸(STIGA 35)</p>
</div>`;

const parsed = parseSeasonResultHtml(html);
assert(parsed.length === 3, `ディビジョン3つ (=${parsed.length})`);
const brass = parsed.find((d) => d.division === "Brass");
assert(brass?.champion === "サイコ" && brass.runnerUp === "Early Bird", "Brass 優勝サイコ・準優勝 Early Bird");
assert(brass?.topGun?.name === "久保田一誠" && brass.topGun.team === "Team Apples", "Top Gun は 名前(チーム) に分ける");
assert(parsed.some((d) => d.division === "35&Over"), "「35 & Over」は順位表の表記「35&Over」に揃える");
assert(parsed.find((d) => d.division === "35&Over")?.topGun?.team === "Flying Penguins 35", "全角括弧でも分けられる");
const wb = parsed.find((d) => d.division === "Women Bronze");
assert(wb !== undefined && wb.champion === undefined && wb.topGun === undefined, "空欄のディビジョンは値なし");

// 53rd の実データ（src/data/awards-53rd.json）
assert(playoffResult(53, "Brass", "サイコ") === "champion", "53rd Brass サイコ = 優勝（レギュラーは2位）");
assert(playoffResult(53, "Brass", "Team Apples") === undefined, "53rd Brass Team Apples はレギュラー1位でも優勝ではない");
assert(playoffResult(53, "Brass", "EarlyBird") === "runnerUp", "表記ゆれ（EarlyBird）でも準優勝");
assert(playoffResult(53, "Platinum", "TEAM I") === "champion" && playoffResult(53, "Platinum", "TEAM K") === "runnerUp", "53rd Platinum");
assert(playoffResult(53, "Silver", "サイコ") === undefined, "別ディビジョンの同名は拾わない");
assert(divisionAwards(53, "Women Bronze")?.champion === undefined, "53rd Women Bronze は結果なし");

// 52nd・51st（Wayback Machine に残っていた公式ページ）
assert(playoffResult(52, "Brass", "Evolving Discus") === "champion", "52nd Brass 優勝 Evolving Discus（レギュラー3位）");
assert(playoffResult(52, "Brass", "サイコ") === "runnerUp", "52nd Brass サイコ = 準優勝（レギュラー1位）");
assert(playoffResult(52, "Bronze", "Dark sales") === "runnerUp", "順位表の表記（Dark sales）でも準優勝");
assert(playoffResult(51, "Brass", "Team Apples") === "champion", "51st Brass 優勝 Team Apples");
assert(playoffResult(50, "Brass", "サイコ") === undefined, "結果のないシーズンは出さない");
