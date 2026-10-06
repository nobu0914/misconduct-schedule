import { NextResponse } from "next/server";
import { splitEvents } from "@/lib/siteEvents";
import { loadPublishedEvents } from "@/lib/siteEventsStore";

// 公開: events.rinnavi.com のこれからのイベントの件数（両サイト上部の切り替えバーに出す）
export const dynamic = "force-dynamic";

export async function GET() {
  const { upcoming } = splitEvents(await loadPublishedEvents());
  return NextResponse.json({ upcoming: upcoming.length }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
