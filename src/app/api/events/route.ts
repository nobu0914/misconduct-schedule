import { NextResponse } from "next/server";
import { fetchEvents, type EventsData } from "@/lib/events";

export type { EventItem, ProgramEntry } from "@/lib/events";

// 他の取得系APIと同じく1日キャッシュ。内部 fetch の revalidate と同じ値にする（src/lib/events.ts）
export const revalidate = 86400;

export async function GET(): Promise<NextResponse<EventsData>> {
  // 取れたら KV に保存し、公式に届かないときは保存データで返す
  return NextResponse.json(await fetchEvents({ save: true }));
}
