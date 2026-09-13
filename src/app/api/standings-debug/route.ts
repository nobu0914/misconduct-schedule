import { NextResponse } from "next/server";
import { fetchCurrentStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { season, results } = await fetchCurrentStandings(true);
  const allStandings = results.flatMap((r) => r.standings);

  return NextResponse.json({
    debug: results.map((r) => ({
      label: r.label,
      httpStatus: r.status,
      rowCount: r.rowCount,
      colspan2Cells: r.colspan2Cells,
      sectionLog: r.sectionLog,
      playersByTeam: r.playersByTeamDebug,
      found: r.standings.length,
      error: r.error,
    })),
    season,
    standings: allStandings,
    lastUpdated: new Date().toISOString(),
  });
}
