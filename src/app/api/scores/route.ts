import { NextResponse } from "next/server";
import { fetchAllScores } from "@/lib/scores";
import type { GameScore } from "@/lib/scores";

export type { GameScore };

export const revalidate = 86400; // 1日（cronで毎日再生成する）

export async function GET(): Promise<NextResponse> {
  const { games, sources } = await fetchAllScores();
  return NextResponse.json(
    { games, sources, lastUpdated: new Date().toISOString() },
    { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } }
  );
}
