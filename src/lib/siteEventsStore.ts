// events.rinnavi.com のイベントの読み書き（サーバーだけ）。中身のきまりは siteEvents.ts
import { kv } from "@vercel/kv";
import { ITEMS_KEY, type SiteEvent } from "./siteEvents";

/** 全部（下書きも）。KV に届かなければ空 */
export async function loadAllEvents(): Promise<SiteEvent[]> {
  try {
    const all = await kv.hgetall<Record<string, SiteEvent>>(ITEMS_KEY);
    return Object.values(all ?? {}).filter((e): e is SiteEvent => !!e && typeof e.id === "string");
  } catch (e) {
    console.error("site events load failed", e);
    return [];
  }
}

/** 公開中のものだけ */
export async function loadPublishedEvents(): Promise<SiteEvent[]> {
  return (await loadAllEvents()).filter((e) => e.published);
}

export async function loadEvent(id: string): Promise<SiteEvent | null> {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  try {
    return (await kv.hget<SiteEvent>(ITEMS_KEY, id)) ?? null;
  } catch {
    return null;
  }
}

export async function saveEvent(e: SiteEvent): Promise<void> {
  await kv.hset(ITEMS_KEY, { [e.id]: e });
}

export async function deleteEvent(id: string): Promise<void> {
  await kv.hdel(ITEMS_KEY, id);
}
