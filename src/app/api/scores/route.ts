import { NextResponse } from "next/server";
import { fetchAllScores } from "@/lib/scores";
import type { GameScore } from "@/lib/scores";

export type { GameScore };

export const revalidate = 259200; // 3日

export async function GET(): Promise<NextResponse> {
  const { games, sources } = await fetchAllScores();
  return NextResponse.json(
    { games, sources, lastUpdated: new Date().toISOString() },
    { headers: { "Cache-Control": "s-maxage=259200, stale-while-revalidate=86400" } }
  );
}
