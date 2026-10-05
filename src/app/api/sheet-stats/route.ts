import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { normalizeContinueCode } from "@/lib/scoreSheet";
import { loadIndexedSheets } from "@/lib/scoreSheetIndex";
import { rowsOfSheets } from "@/lib/sheetStats";

// アップロードされたスコア表の、ディビジョンの全チームの試合ごとの行（コンテニューコードは出さない）。分析 → チーム別で使う。
// 見られるのは、スコア表をアップロードした人・コンテニューコード（共有リンク含む）で見に来た人だけ（ユーザー指示 10/6）:
// ヘッダー x-continue-codes に端末で使っているコード（最大5つ）を付け、どれかが保存されているときだけ返す。
// 誰でも見る「データ → チーム」には出さない（アップロードしないチームが得をしないように）。AI の総評・ニュースの材料には使う。

export const dynamic = "force-dynamic";

async function usesContinueCode(req: NextRequest): Promise<boolean> {
  const codes = (req.headers.get("x-continue-codes") ?? "")
    .split(",")
    .map((c) => normalizeContinueCode(c))
    .filter((c): c is string => !!c)
    .slice(0, 5);
  if (!codes.length) return false;
  return (await kv.exists(...codes.map((c) => `scoresheet:cc:${c}`)).catch(() => 0)) > 0;
}

export async function GET(req: NextRequest) {
  // 集まり具合（シーズン・ディビジョンごとの試合数だけ）は誰でも見られる（アップロードを呼びかけるため）
  if (req.nextUrl.searchParams.get("summary") === "1") {
    const rows = rowsOfSheets(await loadIndexedSheets());
    const games: Record<string, number> = {};
    for (const r of rows) if (r.team === rows.find((x) => x.date === r.date && x.gameNo === r.gameNo && x.division === r.division)?.team) {
      const k = `${r.season}|${r.division}`;
      games[k] = (games[k] ?? 0) + 1;
    }
    return NextResponse.json({ games }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  }
  const division = req.nextUrl.searchParams.get("div") ?? "";
  if (!division || division.length > 30) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // コードの総当たりに使われないよう回数を制限する
  if (await isRateLimited(`sheetstats:${clientIp(req)}`, 120, 3600)) return NextResponse.json({ error: "limit" }, { status: 429 });
  if (!(await usesContinueCode(req))) return NextResponse.json({ error: "continue_code_only" }, { status: 403 });
  const rows = rowsOfSheets(await loadIndexedSheets()).filter((r) => r.division === division);
  // 人によって見られる・見られないが違うので、共有のキャッシュには載せない
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
}
