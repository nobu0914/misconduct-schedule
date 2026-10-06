import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ShareButton from "@/components/events/ShareButton";
import { SPORT_LABEL, closed, dateLabel, googleCalendarUrl, mapUrl, timeLabel, todayJst } from "@/lib/siteEvents";
import { loadEvent } from "@/lib/siteEventsStore";

// events.rinnavi.com/e/{id}: イベント1件。申込は主催者の外部フォームへ（サイトの中では受けない）
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function published(id: string) {
  const e = await loadEvent(id);
  return e?.published ? e : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await published((await params).id);
  if (!e) return { title: "Rinnavi Events" };
  const desc = `${dateLabel(e.date)} ${timeLabel(e)} ${e.place}${e.fee ? ` ／ 参加費 ${e.fee}` : ""}`.replace(/\s+/g, " ").trim();
  return {
    title: `${e.title} - Rinnavi Events`,
    description: desc,
    openGraph: { title: e.title, description: desc, url: `https://events.rinnavi.com/e/${e.id}`, siteName: "Rinnavi Events", type: "article" },
  };
}

/** 本文の URL はリンクにする */
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"）)]+)/g);
  return (
    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline underline-offset-2 break-all">
            {p}
          </a>
        ) : (
          p
        )
      )}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-gray-800 last:border-0 text-sm">
      <span className="w-16 flex-shrink-0 text-xs text-gray-500 pt-0.5">{label}</span>
      <span className="flex-1 min-w-0 text-gray-100 break-words">{children}</span>
    </div>
  );
}

export default async function EventPage({ params }: Props) {
  const e = await published((await params).id);
  if (!e) notFound();
  const pageUrl = `https://events.rinnavi.com/e/${e.id}`;
  const over = e.date < todayJst();
  const isClosed = closed(e);

  return (
    <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
      <Link href="/" className="text-xs text-gray-400" data-feature="events > 詳細 > 一覧へ">
        ← イベント一覧
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 font-medium">{e.kind}</span>
          <span className={`px-2 py-0.5 rounded font-medium ${e.sport === "ice" ? "bg-sky-900/60 text-sky-200" : "bg-gray-800 text-gray-300"}`}>
            {SPORT_LABEL[e.sport]}
          </span>
          {over && <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">終了したイベント</span>}
        </div>
        <h1 className="text-xl font-bold leading-snug">{e.title}</h1>
        <p className="text-base text-white">
          <span className="font-semibold">{`${Number(e.date.slice(0, 4))}年${dateLabel(e.date)}`}</span>
          {timeLabel(e) && <span className="ml-2">{timeLabel(e)}</span>}
        </p>
      </div>

      {/* 申込（外部フォーム） */}
      {!over && e.formUrl && (
        <div className="space-y-1">
          <a
            href={e.formUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-feature={`events > 申込フォームへ > ${e.title}`}
            className={`block w-full py-3 rounded-lg text-center text-base font-bold ${isClosed ? "bg-gray-700 text-gray-300" : "bg-emerald-600 text-white"}`}
          >
            {isClosed ? "受付は終了しました（フォームを開く）" : `${e.formLabel || "申し込む"} ↗`}
          </a>
          <p className="text-[11px] text-gray-500 text-center">
            主催者のフォーム（外部のサイト）が開きます。{e.deadline && !isClosed ? `締切 ${dateLabel(e.deadline)}` : ""}
          </p>
        </div>
      )}

      <section className="rounded-xl border border-gray-800 bg-gray-900 px-3">
        <Row label="会場">
          {e.place}
          {e.address && <span className="block text-xs text-gray-400">{e.address}</span>}
          <a href={mapUrl(e)} target="_blank" rel="noopener noreferrer" className="block text-xs text-emerald-300 mt-0.5" data-feature="events > 詳細 > 地図">
            地図を開く ↗
          </a>
        </Row>
        {e.fee && <Row label="参加費">{e.fee}</Row>}
        {e.capacity && <Row label="定員">{e.capacity}</Row>}
        {e.target && <Row label="対象">{e.target}</Row>}
        {e.bring && <Row label="持ち物">{e.bring}</Row>}
        {e.organizer && <Row label="主催">{e.organizer}</Row>}
        {e.deadline && <Row label="申込締切">{`${dateLabel(e.deadline)}${isClosed ? "（終了）" : ""}`}</Row>}
      </section>

      {e.body && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-3">
          <Body text={e.body} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-2">
        {!over && (
          <a
            href={googleCalendarUrl(e, pageUrl)}
            target="_blank"
            rel="noopener noreferrer"
            data-feature={`events > カレンダーに追加 > ${e.title}`}
            className="w-full py-2.5 rounded-lg text-sm text-center font-medium bg-gray-800 border border-gray-700 text-gray-200"
          >
            📅 Google カレンダーに追加
          </a>
        )}
        <ShareButton title={e.title} />
      </div>
    </main>
  );
}
