import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";
import { generateAnalyticsReport, loadReports } from "@/lib/analyticsReport";

// 管理者用: アクセス解析の週次レポートの確認と「今すぐ作り直す」（毎週月曜 7:00 に自動で作る）

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function auth(req: NextRequest) {
  return verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  return NextResponse.json(await loadReports());
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  try {
    const { report, digest } = await generateAnalyticsReport();
    return NextResponse.json({ ok: true, report, digest });
  } catch (e) {
    console.error("analytics report (admin) failed", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 });
  }
}
