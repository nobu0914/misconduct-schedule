import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const today = new Date().toISOString().slice(0, 10);

    // PV追跡
    if (body.path) {
      await Promise.all([
        kv.incr(`pv:${today}:${body.path}`),
        kv.incr(`pv:${today}:total`),
      ]);
      return NextResponse.json({ ok: true });
    }

    // イベント追跡 (search, card, rank-search)
    if (body.event && body.value) {
      const event = String(body.event);
      const value = String(body.value).slice(0, 100); // 長すぎるキーを防止
      await kv.hincrby(`ev:${today}:${event}`, value, 1);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
