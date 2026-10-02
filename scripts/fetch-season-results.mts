// シーズン終了後の公式「最終結果」ページ（プレイオフの優勝・準優勝、Top Gun Award、The Wall Award）を取得し、
// src/data/awards-{シーズン}.json に書き出す。
//
// 順位表はレギュラーシーズンの順位で、優勝はプレイオフで決まる（53rd Brass はレギュラー2位のサイコが優勝）。
// 公式ページはシーズンが変わると消える・差し替わる可能性があるので、取れるうちに JSON で持っておく。
// 2026-10 時点で存在するのは 53rd だけ（他のシーズンの URL は 53rd に転送される）。
//
// 使い方（ネットワークに出られる手元のPCで）:
//   npx tsx scripts/fetch-season-results.mts 53

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { seasonOrdinal } from "../src/lib/season";
import type { AwardPerson, DivisionAwards } from "../src/lib/seasonAwards";

/** "髙山智宏(Flying Penguins)" → { name, team } */
function parsePerson(value: string): AwardPerson | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const m = v.match(/^(.*?)\s*[(（](.*)[)）]$/);
  return m ? { name: m[1].trim(), team: m[2].trim() } : { name: v };
}

/** "35 & Over Division" → "35&Over"（順位表・日程表の表記に合わせる） */
function divisionName(heading: string): string {
  return heading.replace(/\s*Division\s*$/i, "").replace(/\s*&\s*/g, "&").trim();
}

export function parseSeasonResultHtml(html: string): DivisionAwards[] {
  const $ = cheerio.load(html);
  const results: DivisionAwards[] = [];
  $("h1, h2, h3, h4, h5").each((_, el) => {
    const heading = $(el).text().trim();
    if (!/Division$/i.test(heading)) return;
    const body = $(el).nextAll("p").first();
    const lines = (body.html() ?? "")
      .split(/<br\s*\/?>/i)
      .map((l) => cheerio.load(l).text().replace(/ /g, " ").trim());
    const entry: DivisionAwards = { division: divisionName(heading) };
    for (const line of lines) {
      const m = line.match(/^(.+?)\s*[：:]\s*(.*)$/);
      if (!m) continue;
      const [label, value] = [m[1].trim(), m[2].trim()];
      if (!value) continue;
      if (label === "優勝") entry.champion = value;
      else if (label === "準優勝") entry.runnerUp = value;
      else if (/^Top Gun/i.test(label)) entry.topGun = parsePerson(value);
      else if (/^The Wall/i.test(label)) entry.wall = parsePerson(value);
    }
    results.push(entry);
  });
  return results;
}

async function main() {
  const season = Number(process.argv[2]);
  if (!Number.isInteger(season)) {
    console.error("使い方: npx tsx scripts/fetch-season-results.mts 53");
    process.exit(1);
  }
  const url = `https://misconduct.co.jp/result-after-${seasonOrdinal(season)}-season/`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  // 別シーズンの URL は最新の結果ページに転送されるので、取り違えないよう転送先を確認する
  if (!res.ok || !res.url.includes(`result-after-${seasonOrdinal(season)}-season`)) {
    console.error(`${seasonOrdinal(season)} の結果ページがありません（HTTP ${res.status} → ${res.url}）`);
    process.exit(1);
  }
  const awards = parseSeasonResultHtml(await res.text());
  const out = fileURLToPath(new URL(`../src/data/awards-${seasonOrdinal(season)}.json`, import.meta.url));
  writeFileSync(out, JSON.stringify(awards, null, 2) + "\n");
  for (const a of awards) {
    console.log(`${a.division.padEnd(13)} 優勝 ${a.champion ?? "—"} / 準優勝 ${a.runnerUp ?? "—"}`);
  }
  console.log(`→ ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
