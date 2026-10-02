// 公式サイトを取得し、KV の保存データ（スケジュール・レンタル・スコア・順位表・個人成績）を更新する。
//
// 公式サイトが不調で Vercel から取得できない日（UND_ERR_CONNECT_TIMEOUT など）も、サイトは KV の
// 保存データで表示を続ける。その保存データを、公式に届く環境（GitHub Actions・手元のPC）から
// 更新するためのもの。取得・保存の関数は公開API・cron と同じものを使う。
//
// 使い方:
//   KV_REST_API_URL=... KV_REST_API_TOKEN=... npx tsx scripts/refresh-kv.mts
//   npx tsx scripts/refresh-kv.mts --env <.envファイル>   # KV の認証情報をファイルから読む
//   npx tsx scripts/refresh-kv.mts --dry-run              # 取得だけして KV には書かない
//
// GitHub Actions（.github/workflows/refresh-kv.yml）から毎日実行している。

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const envIndex = args.indexOf("--env");
if (envIndex >= 0) {
  const envPath = args[envIndex + 1];
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^(KV_REST_API_URL|KV_REST_API_TOKEN)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
if (!dryRun && (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN)) {
  console.error("KV_REST_API_URL / KV_REST_API_TOKEN が未設定です（--dry-run なら不要）");
  process.exit(1);
}

// KV の認証情報を環境変数に入れてから読み込む
const { fetchAllMatches, currentSeasonNumber } = await import("../src/lib/schedule");
const { fetchAllRentalEntries } = await import("../src/lib/rental");
const { fetchAllScores, decodePage } = await import("../src/lib/scores");
const { fetchSeasonStandings, buildStandingsSources } = await import("../src/lib/standings");
const { parsePlayersHtml } = await import("../src/lib/playerStats");
const { seasonOrdinal } = await import("../src/lib/season");
const { saveSeasonTeams, saveSeasonPlayers, toSeasonTeamEntries } = await import("../src/lib/seasonSnapshot");

// noStore:true の経路で取得すると、取れたものがそのまま KV に保存される（cron と同じ）
const noStore = !dryRun;
const failures = (sources: { error?: string }[]) => sources.filter((s) => s.error).length;

const schedule = await fetchAllMatches({ noStore });
console.log(`schedule:  ${schedule.matches.length} 試合（取得元 ${schedule.sources.length}、失敗 ${failures(schedule.sources)}）`);

const rental = await fetchAllRentalEntries({ noStore });
console.log(`rental:    ${rental.entries.length} 件（取得元 ${rental.sources.length}、失敗 ${failures(rental.sources)}）`);

const scores = await fetchAllScores({ noStore });
console.log(`scores:    ${scores.games.length} 試合（取得元 ${scores.sources.length}、失敗 ${failures(scores.sources)}）`);

// 個人成績は /api/player-stats と同じ取り方（順位表ページの中に載っている）
async function fetchSeasonPlayers(season: number) {
  const perDivision = await Promise.all(
    buildStandingsSources(season).map(async ({ label, url }) => {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) return [];
        return parsePlayersHtml(decodePage(Buffer.from(await res.arrayBuffer())), label, url);
      } catch {
        return [];
      }
    })
  );
  return perDivision.flat().map(({ name, jersey, team, divisionLabel, divisionRank, gp, goals, assists, points, pim }) => ({
    name, jersey, team, divisionLabel, divisionRank, gp, goals, assists, points, pim,
  }));
}

// 順位表・個人成績は今シーズンと前シーズン（前シーズンの公式ページが残っている間は最終順位を取り直す）。
// 保存はディビジョン単位の差し替えで、取れなかったディビジョンは前回分を残す（seasonSnapshot.ts）
const season = currentSeasonNumber();
for (const n of [season, season - 1]) {
  const { results } = await fetchSeasonStandings(n);
  const teams = toSeasonTeamEntries(results.flatMap((r) => r.standings));
  const players = await fetchSeasonPlayers(n);
  if (!dryRun) {
    await saveSeasonTeams(n, teams);
    await saveSeasonPlayers(n, players);
  }
  console.log(`${seasonOrdinal(n).padEnd(5)}      順位表 ${teams.length} チーム / 個人成績 ${players.length} 人`);
}

console.log(dryRun ? "（--dry-run のため KV には書いていません）" : "KV の保存データを更新しました");
