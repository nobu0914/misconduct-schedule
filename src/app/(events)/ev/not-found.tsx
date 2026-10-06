import Link from "next/link";
import { eventsBase } from "@/lib/eventsBase";

export default async function EventNotFound() {
  const base = await eventsBase();
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
      <p className="text-base font-semibold">このイベントは見つかりません</p>
      <p className="text-xs text-gray-500">掲載が終わったか、アドレスが違う可能性があります。</p>
      <Link href={base || "/"} className="inline-block text-sm text-emerald-300 underline underline-offset-2">
        イベント一覧へ
      </Link>
    </main>
  );
}
