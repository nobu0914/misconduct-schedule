import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { passcode } = await req.json();
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) return NextResponse.json({ ok: false, error: "not configured" }, { status: 500 });
  if (typeof passcode !== "string" || passcode.toUpperCase() !== expected.toUpperCase()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
