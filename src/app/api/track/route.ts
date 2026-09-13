import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import { isEventType, normalizeTrackedPath } from "@/lib/analyticsConstants";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const today = new Date().toISOString().slice(0, 10);

    // PV追跡（pathはKVのキーになるので、検証したものだけ通す）
    if (body.path !== undefined) {
      const path = normalizeTrackedPath(body.path);
      if (!path) return NextResponse.json({ ok: false }, { status: 400 });

      await Promise.all([
        kv.incr(`pv:${today}:${path}`),
        kv.incr(`pv:${today}:total`),
      ]);
      return NextResponse.json({ ok: true });
    }

    // イベント追跡 (search, card, rank-search)
    if (body.event !== undefined && body.value) {
      if (!isEventType(body.event)) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      const value = String(body.value).slice(0, 100); // 長すぎるキーを防止
      await kv.hincrby(`ev:${today}:${body.event}`, value, 1);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
