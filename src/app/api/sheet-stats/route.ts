import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { normalizeContinueCode } from "@/lib/scoreSheet";
import { loadIndexedSheets } from "@/lib/scoreSheetIndex";
import { rowsOfSheets } from "@/lib/sheetStats";

// アップロードされたスコア表の、ディビジョンの全チームの試合ごとの行（コンテニューコードは出さない）。
// 見られるのは、コンテニューコード・共有リンクでスコア表を表示したことがある人だけ（ユーザー指示 10/6）:
// ヘッダー x-continue-codes に端末で見たことのあるコード（最大5つ）を付け、どれかが保存されているときだけ返す。
// 集計（通算・シーズン別・比較）は画面側で src/lib/sheetStats.ts を使う。

export const dynamic = "force-dynamic";

async function usesContinueCode(req: NextRequest): Promise<boolean> {
  const codes = (req.headers.get("x-continue-codes") ?? "")
    .split(",")
    .map((c) => normalizeContinueCode(c))
    .filter((c): c is string => !!c)
    .slice(0, 5);
  if (!codes.length) return false;
  const found = await kv.exists(...codes.map((c) => `scoresheet:cc:${c}`)).catch(() => 0);
  return found > 0;
}

export async function GET(req: NextRequest) {
  const division = req.nextUrl.searchParams.get("div") ?? "";
  if (!division || division.length > 30) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // コードの総当たりに使われないよう回数を制限する
  if (await isRateLimited(`sheetstats:${clientIp(req)}`, 120, 3600)) return NextResponse.json({ error: "limit" }, { status: 429 });
  if (!(await usesContinueCode(req))) return NextResponse.json({ error: "continue_code_only" }, { status: 403 });
  const rows = rowsOfSheets(await loadIndexedSheets()).filter((r) => r.division === division);
  // 人によって見られる・見られないが違うので、共有のキャッシュには載せない
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
}
