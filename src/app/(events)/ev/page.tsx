import EventList from "@/components/events/EventList";
import { splitEvents } from "@/lib/siteEvents";
import { loadPublishedEvents } from "@/lib/siteEventsStore";
import { eventsBase } from "@/lib/eventsBase";

// events.rinnavi.com のトップ: これからのイベントの一覧（管理画面で登録したものだけ）
export const dynamic = "force-dynamic";

export default async function EventsTop() {
  const { upcoming, past } = splitEvents(await loadPublishedEvents());
  const base = await eventsBase();
  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
      <div>
        <h1 className="text-xl font-bold">開催予定</h1>
        <p className="text-xs text-gray-500 mt-1">参加の申込は、各イベントのページから主催者のフォームへどうぞ。</p>
      </div>
      <EventList upcoming={upcoming} past={past} base={base} />
    </main>
  );
}
