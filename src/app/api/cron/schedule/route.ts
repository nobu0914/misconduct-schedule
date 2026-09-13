import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { fetchAllMatches } from "@/lib/schedule";
import { fetchAllRentalEntries } from "@/lib/rental";
import { isThrottled } from "@/lib/cronGuard";
import type { SourceStatus } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 異常とみなす取得元: 404（未公開の月）以外の失敗に加えて、
 * 200で返ってきたのに解析結果が0件のもの（構造変更の可能性）も含める。
 * 後者は status が 200 なので、error の有無で拾う必要がある。
 */
function failedSources(sources: SourceStatus[]): SourceStatus[] {
  return sources.filter((s) => (s.status !== 200 && s.status !== 404) || Boolean(s.error));
}

function isUpcoming(date: string, today: Date): boolean {
  const [y, m, d] = date.split("/").map(Number);
  return new Date(y, m - 1, d).getTime() >= today.getTime();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  } else if (await isThrottled("schedule", 300)) {
    // 認証なしで誰でも叩ける状態なので、連打で公式サイトに負荷をかけさせない
    return NextResponse.json(
      { ok: true, throttled: true, message: "直近に実行済みのためスキップしました" },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const startedAt = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // キャッシュを介さず公式サイトを直接叩いて、実際の取得可否を確認する
  const [schedule, rental] = await Promise.all([
    fetchAllMatches({ noStore: true }),
    fetchAllRentalEntries({ noStore: true }),
  ]);

  const postponed = schedule.matches.filter((m) => m.status === "postponed").length;
  const upcomingMatches = schedule.matches.filter((m) => isUpcoming(m.date, today)).length;
  const upcomingRentals = rental.entries.filter((e) => isUpcoming(e.date, today)).length;
  const latestMatchDate = schedule.matches.at(-1)?.date ?? null;
  const latestRentalDate = rental.entries.at(-1)?.date ?? null;

  const scheduleFailures = failedSources(schedule.sources);
  const rentalFailures = failedSources(rental.sources);

  const warnings: string[] = [];
  if (schedule.matches.length === 0) warnings.push("スケジュールが1件も取得できていない");
  else if (upcomingMatches === 0) warnings.push("今後の試合が0件（新しい月のページが未取得の可能性）");
  if (rental.entries.length === 0) warnings.push("レンタル情報が1件も取得できていない");
  else if (upcomingRentals === 0) warnings.push("今後のレンタル予定が0件（新しい月のページが未取得の可能性）");
  for (const s of [...scheduleFailures, ...rentalFailures]) {
    warnings.push(`取得失敗 ${s.label}: ${s.error ?? `HTTP ${s.status}`}`);
  }

  // 公開APIのISRキャッシュを破棄し、その場で再生成させる（利用者が古い値を踏まないように）
  let warmed = false;
  try {
    revalidatePath("/api/schedule");
    revalidatePath("/api/rental");
    await Promise.all([
      fetch(new URL("/api/schedule", request.url), { cache: "no-store" }),
      fetch(new URL("/api/rental", request.url), { cache: "no-store" }),
    ]);
    warmed = true;
  } catch (e) {
    warnings.push(`キャッシュ再生成に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  const ok = warnings.length === 0;
  const body = {
    ok,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    warmed,
    warnings,
    schedule: {
      totalMatches: schedule.matches.length,
      scheduledMatches: schedule.matches.length - postponed,
      postponedMatches: postponed,
      upcomingMatches,
      latestMatchDate,
      months: [...new Set(schedule.matches.map((m) => m.month))],
      okSources: schedule.sources.filter((s) => s.count > 0).map((s) => `${s.label}(${s.count})`),
      failedSources: scheduleFailures,
    },
    rental: {
      totalEntries: rental.entries.length,
      upcomingEntries: upcomingRentals,
      latestRentalDate,
      months: [...new Set(rental.entries.map((e) => e.month))],
      okSources: rental.sources.filter((s) => s.count > 0).map((s) => `${s.label}(${s.count})`),
      failedSources: rentalFailures,
    },
  };

  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
