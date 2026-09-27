import { NextResponse } from "next/server";
import { fetchAllRentalEntries, type RentalEntry } from "@/lib/rental";
import type { SourceStatus } from "@/lib/schedule";

export type { RentalEntry };

interface RentalData {
  entries: RentalEntry[];
  lastUpdated: string;
  sources: SourceStatus[];
}

// Next.js は静的解析するためリテラルで書く必要がある。
// lib/rental.ts の RENTAL_REVALIDATE と同じ値にすること。
export const revalidate = 86400; // 1日キャッシュ

export async function GET(): Promise<NextResponse<RentalData>> {
  const { entries, sources, fetchedAt } = await fetchAllRentalEntries();

  return NextResponse.json(
    { entries, lastUpdated: fetchedAt, sources },
    { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } }
  );
}
