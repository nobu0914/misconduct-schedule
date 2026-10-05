import { NextResponse } from "next/server";
import { loadNews } from "@/lib/newsStore";

// リーグニュース（週1回更新）。CDN で1時間キャッシュ
export const dynamic = "force-dynamic";

export async function GET() {
  const { latest, history } = await loadNews();
  return NextResponse.json(
    { latest, history: history.slice(1) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
