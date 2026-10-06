"use client";

import { useState } from "react";
import EventCard from "@/components/events/EventCard";
import { SPORT_SHORT, type SiteEvent, type Sport } from "@/lib/siteEvents";

/** これからのイベント（月ごと）と、終わったイベント。競技が2つ以上あるときだけ絞り込みを出す */
export default function EventList({ upcoming, past, base = "" }: { upcoming: SiteEvent[]; past: SiteEvent[]; base?: string }) {
  const [sport, setSport] = useState<Sport | "all">("all");
  const [showPast, setShowPast] = useState(false);
  const sports = [...new Set([...upcoming, ...past].map((e) => e.sport))];
  const pick = (list: SiteEvent[]) => (sport === "all" ? list : list.filter((e) => e.sport === sport));
  const shown = pick(upcoming);
  const months = new Map<string, SiteEvent[]>();
  for (const e of shown) {
    const k = `${Number(e.date.slice(0, 4))}年${Number(e.date.slice(5, 7))}月`;
    months.set(k, [...(months.get(k) ?? []), e]);
  }
  const pastShown = pick(past).slice(0, 30);

  return (
    <div className="space-y-5">
      {sports.length > 1 && (
        <div className="flex gap-2">
          {(["all", ...sports] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSport(k)}
              data-feature={`events > 競技 > ${k === "all" ? "すべて" : SPORT_SHORT[k]}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                sport === k ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"
              }`}
            >
              {k === "all" ? "すべて" : SPORT_SHORT[k]}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-12">いま告知中のイベントはありません。</p>
      )}
      {[...months.entries()].map(([month, list]) => (
        <section key={month} className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400">{month}</h2>
          {list.map((e) => (
            <EventCard key={e.id} event={e} base={base} />
          ))}
        </section>
      ))}

      {pastShown.length > 0 && (
        <section className="space-y-2 pt-2">
          <button
            onClick={() => setShowPast((v) => !v)}
            data-feature="events > 終わったイベント"
            className="text-xs text-gray-400 underline underline-offset-2"
          >
            終わったイベント（{pastShown.length}）{showPast ? "を閉じる" : "を見る"}
          </button>
          {showPast && pastShown.map((e) => <EventCard key={e.id} event={e} past base={base} />)}
        </section>
      )}
    </div>
  );
}
