import { NextRequest, NextResponse } from "next/server";
import { loadNews } from "@/lib/newsStore";

// リーグニュース（週1回更新）。?offset= で過去の号の続きを読む。CDN で1時間キャッシュ
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const offset = Math.min(10000, Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0));
  const news = await loadNews(offset);
  return NextResponse.json(news, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
