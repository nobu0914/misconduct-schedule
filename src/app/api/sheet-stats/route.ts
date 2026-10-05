import { NextRequest, NextResponse } from "next/server";
import { loadIndexedSheets } from "@/lib/scoreSheetIndex";
import { rowsOfSheets } from "@/lib/sheetStats";

// アップロードされたスコア表の、ディビジョンの全チームの試合ごとの行（コンテニューコードは出さない）。
// 集計（通算・シーズン別・ディビジョン内の比較）は画面側で src/lib/sheetStats.ts の summarize を使う。

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const division = req.nextUrl.searchParams.get("div") ?? "";
  if (!division || division.length > 30) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const rows = rowsOfSheets(await loadIndexedSheets()).filter((r) => r.division === division);
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
