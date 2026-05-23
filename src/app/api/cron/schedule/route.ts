import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScheduleMatch = {
  status?: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const scheduleUrl = new URL("/api/schedule", request.url);
  scheduleUrl.searchParams.set("cron", Date.now().toString());

  const startedAt = Date.now();
  const res = await fetch(scheduleUrl, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, status: res.status, checkedAt: new Date().toISOString() },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const data = await res.json();
  const matches: ScheduleMatch[] = Array.isArray(data.matches) ? data.matches : [];
  const postponed = matches.filter((match) => match.status === "postponed").length;

  return NextResponse.json(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      upstreamLastUpdated: data.lastUpdated ?? null,
      durationMs: Date.now() - startedAt,
      totalMatches: matches.length,
      scheduledMatches: matches.length - postponed,
      postponedMatches: postponed,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
