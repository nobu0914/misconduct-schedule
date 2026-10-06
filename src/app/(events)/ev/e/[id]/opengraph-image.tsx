import { OG_SIZE, eventsOgImage } from "@/components/events/ogImage";
import { SPORT_SHORT, dateLabel, timeLabel } from "@/lib/siteEvents";
import { loadEvent } from "@/lib/siteEventsStore";

export const alt = "Rinnavi Events";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const e = await loadEvent((await params).id);
  if (!e?.published) return eventsOgImage({});
  return eventsOgImage({
    title: e.title,
    sub: `${dateLabel(e.date)} ${timeLabel(e)}  ${e.place}`.trim(),
    badge: `${e.kind}・${SPORT_SHORT[e.sport]}`,
  });
}
