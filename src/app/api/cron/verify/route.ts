import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllMatches, type SourceStatus } from "@/lib/schedule";
import { fetchAllRentalEntries } from "@/lib/rental";
import { fetchAllScores } from "@/lib/scores";
import { listArchived, loadArchive } from "@/lib/archive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 週1回の整合性チェック。
 * 公式サイトをキャッシュを介さず取得し、前回の保存内容と突き合わせる。
 * 取得できたものはアーカイブに保存されるので、このルート自体がバックアップも兼ねる。
 */

interface GroupReport {
  group: string;
  liveSources: number;   // 実際にデータが取れた取得元
  totalItems: number;
  archivedSources: number;
  notices: string[];     // 想定内の変化（公開終了→保存データで補完 など）
  problems: string[];    // 要対応
}

const HISTORY_KEY = "verify:history";
const LAST_KEY = "verify:last";

async function inspect(
  group: string,
  sources: SourceStatus[],
  totalItems: number
): Promise<GroupReport> {
  const report: GroupReport = {
    group,
    liveSources: sources.filter((s) => s.count > 0 && !s.fromArchive).length,
    totalItems,
    archivedSources: 0,
    notices: [],
    problems: [],
  };

  const archived = await listArchived(group);
  report.archivedSources = archived.size;

  for (const s of sources) {
    if (s.fromArchive) {
      report.notices.push(
        `${s.label}: 公式ページが取得できないため保存データで表示中（保存: ${s.fromArchive}）`
      );
      continue;
    }
    if (s.error) {
      report.problems.push(`${s.label}: ${s.error}`);
      continue;
    }
    if (s.status !== 200 && s.status !== 404) {
      report.problems.push(`${s.label}: HTTP ${s.status}`);
      continue;
    }
    // 件数が保存時より大きく減っていないか（差し替えミス・部分公開の検知）
    if (s.count > 0 && archived.has(s.label)) {
      const snapshot = await loadArchive<unknown>(group, s.label);
      if (snapshot && s.count < Math.floor(snapshot.count * 0.8)) {
        report.problems.push(
          `${s.label}: 件数が ${snapshot.count} → ${s.count} に減少`
        );
      }
    }
  }

  if (report.liveSources === 0 && report.totalItems === 0) {
    report.problems.push("この区分のデータが1件も取得できていない");
  }
  return report;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  // それぞれの取得が成功分をアーカイブへ保存し、消えた取得元は保存分で補完する
  const [schedule, rental, scores] = await Promise.all([
    fetchAllMatches({ noStore: true }),
    fetchAllRentalEntries({ noStore: true }),
    fetchAllScores({ noStore: true }),
  ]);

  const groups = await Promise.all([
    inspect("schedule", schedule.sources, schedule.matches.length),
    inspect("rental", rental.sources, rental.entries.length),
    inspect("scores", scores.sources, scores.games.length),
  ]);

  const problems = groups.flatMap((g) => g.problems.map((p) => `[${g.group}] ${p}`));
  const notices = groups.flatMap((g) => g.notices.map((n) => `[${g.group}] ${n}`));

  const report = {
    ok: problems.length === 0,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    problems,
    notices,
    groups,
  };

  // 直近の結果と履歴（12週分）を残す
  try {
    await Promise.all([
      kv.set(LAST_KEY, report),
      kv.lpush(HISTORY_KEY, report).then(() => kv.ltrim(HISTORY_KEY, 0, 11)),
    ]);
  } catch (e) {
    console.error("verify report save failed:", e);
  }

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
