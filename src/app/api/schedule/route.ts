import { NextResponse } from "next/server";
import { fetchAllMatches, type Match, type SourceStatus } from "@/lib/schedule";

export type { Match, SourceStatus };

interface ScheduleData {
  matches: Match[];
  lastUpdated: string;
  sources: SourceStatus[];
}

// Next.js は静的解析するためリテラルで書く必要がある。
// lib/schedule.ts の SCHEDULE_REVALIDATE と同じ値にすること。
export const revalidate = 86400; // 1日キャッシュ

export async function GET(): Promise<NextResponse<ScheduleData>> {
  const { matches, sources, fetchedAt } = await fetchAllMatches();

  return NextResponse.json(
    { matches, lastUpdated: fetchedAt, sources },
    { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } }
  );
}
