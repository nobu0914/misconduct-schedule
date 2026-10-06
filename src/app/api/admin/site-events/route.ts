import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPasscode } from "@/lib/adminAuth";
import { sanitizeEvent } from "@/lib/siteEvents";
import { deleteEvent, loadAllEvents, loadEvent, saveEvent } from "@/lib/siteEventsStore";

// 管理者用: events.rinnavi.com に載せるイベントの一覧・登録・修正・削除（書くのは管理者だけ）

export const dynamic = "force-dynamic";

async function auth(req: NextRequest) {
  return verifyAdminPasscode(req, req.headers.get("x-admin-passcode"));
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  const events = (await loadAllEvents()).sort((x, y) => `${y.date} ${y.start ?? ""}`.localeCompare(`${x.date} ${x.start ?? ""}`));
  return NextResponse.json({ events });
}

/** 登録（id 無し）・修正（id あり） */
export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const base = typeof raw.id === "string" && raw.id ? await loadEvent(raw.id) : undefined;
  if (raw.id && !base) return NextResponse.json({ error: "not_found", message: "このイベントは見つかりません（削除された可能性があります）。" }, { status: 404 });
  const { event, error } = sanitizeEvent(raw, base ?? undefined);
  if (!event) return NextResponse.json({ error: "invalid", message: error }, { status: 400 });
  try {
    await saveEvent(event);
    return NextResponse.json({ ok: true, event });
  } catch (e) {
    console.error("site event save failed", e);
    return NextResponse.json({ error: "unavailable", message: "保存できませんでした。" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!(await loadEvent(id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await deleteEvent(id);
  return NextResponse.json({ ok: true });
}
