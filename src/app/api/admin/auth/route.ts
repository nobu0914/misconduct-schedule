import { NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await verifyAdminPasscode(req, body.passcode);

  if (!result.ok) {
    const error =
      result.status === 500 ? "not configured"
      : result.status === 429 ? "試行回数が多すぎます。しばらく待ってください。"
      : undefined;
    return NextResponse.json({ ok: false, error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
