import Link from "next/link";
import { SPORT_SHORT, closed, dateLabel, timeLabel, type SiteEvent } from "@/lib/siteEvents";

/** 一覧の1件（日付・種類・タイトル・会場・料金） */
export default function EventCard({ event: e, past = false }: { event: SiteEvent; past?: boolean }) {
  const [m, d] = e.date.slice(5).split("-").map(Number);
  return (
    <Link
      href={`/e/${e.id}`}
      data-feature={`events > 一覧 > ${e.date} ${e.title}`}
      className={`flex gap-3 rounded-xl border px-3 py-3 transition-colors ${
        past ? "border-gray-800 bg-gray-900/40 opacity-70" : "border-gray-800 bg-gray-900 hover:border-emerald-700"
      }`}
    >
      <div className="w-14 flex-shrink-0 rounded-lg bg-gray-800 flex flex-col items-center justify-center py-1.5">
        <span className="text-[10px] text-gray-400">{m}月</span>
        <span className="text-xl font-bold leading-none text-white">{d}</span>
        <span className="text-[10px] text-gray-400 mt-0.5">{dateLabel(e.date).match(/（(.)）/)?.[1]}</span>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200 font-medium">{e.kind}</span>
          <span className={`px-1.5 py-0.5 rounded font-medium ${e.sport === "ice" ? "bg-sky-900/60 text-sky-200" : "bg-gray-800 text-gray-300"}`}>
            {SPORT_SHORT[e.sport]}
          </span>
          {!past && closed(e) && <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">受付終了</span>}
        </div>
        <p className="text-sm font-semibold text-white leading-snug">{e.title}</p>
        <p className="text-xs text-gray-400 truncate">
          {timeLabel(e) && <span className="mr-2">{timeLabel(e)}</span>}
          {e.place}
        </p>
        {e.fee && <p className="text-[11px] text-gray-500 truncate">参加費 {e.fee}</p>}
      </div>
    </Link>
  );
}
