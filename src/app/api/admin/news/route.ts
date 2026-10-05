import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";
import { generateNews, loadNews } from "@/lib/newsStore";

// 管理者用: リーグニュースの確認と、今すぐ作り直す（金曜の自動作成を待たずに）

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function auth(req: NextRequest) {
  return verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  return NextResponse.json(await loadNews());
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  try {
    const { edition, digest } = await generateNews(new URL(req.url).origin);
    return NextResponse.json({ ok: true, edition, digest });
  } catch (e) {
    console.error("league news (admin) failed", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 });
  }
}
