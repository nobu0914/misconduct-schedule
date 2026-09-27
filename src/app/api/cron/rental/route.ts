import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { RENTAL_CACHE_TAG } from "@/lib/cacheTags";
import type { RentalEntry } from "../../rental/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  // 公式サイトのレンタル表キャッシュを破棄し、次の取得で最新を読み込ませる
  revalidateTag(RENTAL_CACHE_TAG);

  const rentalUrl = new URL("/api/rental", request.url);
  rentalUrl.searchParams.set("cron", Date.now().toString());

  const startedAt = Date.now();
  const res = await fetch(rentalUrl, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, status: res.status, checkedAt: new Date().toISOString() },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const data = await res.json();
  const entries: RentalEntry[] = Array.isArray(data.entries) ? data.entries : [];
  const entriesByMonth: Record<string, number> = {};
  for (const entry of entries) {
    entriesByMonth[entry.month] = (entriesByMonth[entry.month] ?? 0) + 1;
  }

  return NextResponse.json(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      totalEntries: entries.length,
      entriesByMonth,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
