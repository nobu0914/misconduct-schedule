import { NextResponse } from "next/server";
import { fetchAndParseScores, SCORE_URLS } from "@/lib/scores";
import type { GameScore } from "@/lib/scores";

export type { GameScore };

export const revalidate = 259200; // 3日

export async function GET(): Promise<NextResponse> {
  const results = await Promise.all(
    SCORE_URLS.map(({ label, url }) => fetchAndParseScores(label, url))
  );
  const games = results.flat();
  return NextResponse.json(
    { games, lastUpdated: new Date().toISOString() },
    { headers: { "Cache-Control": "s-maxage=259200, stale-while-revalidate=86400" } }
  );
}
